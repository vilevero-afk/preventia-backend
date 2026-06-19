import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'preventia-billing-test-secret';
process.env.USER_LICENSE_STORE_PATH = path.join('/private/tmp', `preventia-billing-test-${Date.now()}.json`);
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

const {
  app,
  BILLING_PLANS,
  buildCheckoutMetadata,
  createUserLicenseFromCheckoutMetadata,
  findUserLicenseByEmail,
  getPublicBillingPlans,
  hashPassword,
  loadUserLicenses,
  saveUserLicenses,
  validateCheckoutPayload,
} = await import('../server.js');

saveUserLicenses({ userLicenses: [] });

assert.equal(BILLING_PLANS.primary_monthly.price, 79);
assert.equal(BILLING_PLANS.primary_yearly.price, 790);
assert.equal(BILLING_PLANS.additional_monthly.price, 39);
assert.equal(BILLING_PLANS.additional_yearly.price, 390);

const publicPlans = getPublicBillingPlans();
assert.equal(publicPlans.length, 4);
assert.equal(publicPlans[0].currency, 'EUR');

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const plans = await getJson(baseUrl, '/api/billing/plans');
  assert.equal(plans.success, true);
  assert.equal(plans.plans.length, 4);
  assert.equal(plans.plans.some((plan) => plan.id === 'primary_monthly' && plan.price === 79), true);

  const legalIndex = await getText(baseUrl, '/legal');
  assert.match(legalIndex.body, /Informations légales — PreventIA Belgique/);
  assert.match(legalIndex.body, /Conditions d’utilisation/);
  assert.match(legalIndex.body, /Politique de confidentialité/);
  assert.match(legalIndex.body, /Annulation et remboursement/);

  const terms = await getText(baseUrl, '/legal/terms');
  assert.match(terms.headers['content-type'], /text\/html/);
  assert.match(terms.body, /Conditions d’utilisation — PreventIA Belgique/);
  assert.match(terms.body, /La licence principale coûte 79 €\/mois ou 790 €\/an/);
  assert.match(terms.body, /Une licence supplémentaire coûte 39 €\/mois ou 390 €\/an/);

  const privacy = await getText(baseUrl, '/legal/privacy');
  assert.match(privacy.body, /Politique de confidentialité — PreventIA Belgique/);
  assert.match(privacy.body, /mot de passe hashé, jamais le mot de passe en clair/);
  assert.match(privacy.body, /PreventIA ne stocke pas les données de carte bancaire/);

  const cancellation = await getText(baseUrl, '/legal/cancellation');
  assert.match(cancellation.body, /Annulation et remboursement — PreventIA Belgique/);
  assert.match(cancellation.body, /Les abonnements sont mensuels ou annuels/);

  const invalidEmail = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    email: 'not-an-email',
  });
  assert.equal(invalidEmail.success, false);
  assert.match(invalidEmail.error, /Email obligatoire/);

  const shortPassword = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    password: 'short',
    passwordConfirmation: 'short',
  });
  assert.equal(shortPassword.success, false);
  assert.match(shortPassword.error, /minimum 8/);

  const badConfirmation = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    passwordConfirmation: 'different-password',
  });
  assert.equal(badConfirmation.success, false);
  assert.match(badConfirmation.error, /confirmation/);

  const unknownPlan = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    planId: 'unknown_plan',
  });
  assert.equal(unknownPlan.success, false);
  assert.match(unknownPlan.error, /Offre/);

  const missingVatNumber = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    vatNumber: '',
  });
  assert.equal(missingVatNumber.success, false);
  assert.equal(missingVatNumber.error, 'Numéro de TVA obligatoire.');

  const missingAddressLine1 = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    addressLine1: '',
  });
  assert.equal(missingAddressLine1.success, false);
  assert.equal(missingAddressLine1.error, 'Adresse de facturation obligatoire.');

  const missingPostalCode = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    postalCode: '',
  });
  assert.equal(missingPostalCode.success, false);
  assert.equal(missingPostalCode.error, 'Code postal obligatoire.');

  const missingCity = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    city: '',
  });
  assert.equal(missingCity.success, false);
  assert.equal(missingCity.error, 'Ville obligatoire.');

  const missingCountry = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    country: '',
  });
  assert.equal(missingCountry.success, false);
  assert.equal(missingCountry.error, 'Pays obligatoire.');

  const missingTerms = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    acceptTerms: false,
  });
  assert.equal(missingTerms.success, false);
  assert.equal(missingTerms.error, 'Vous devez accepter les conditions d’utilisation.');

  const absentTermsPayload = validCheckoutPayload();
  delete absentTermsPayload.acceptTerms;
  const absentTerms = await createCheckout(baseUrl, absentTermsPayload);
  assert.equal(absentTerms.success, false);
  assert.equal(absentTerms.error, 'Vous devez accepter les conditions d’utilisation.');

  const missingPrivacy = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    acceptPrivacy: false,
  });
  assert.equal(missingPrivacy.success, false);
  assert.equal(missingPrivacy.error, 'Vous devez accepter la politique de confidentialité.');

  const absentPrivacyPayload = validCheckoutPayload();
  delete absentPrivacyPayload.acceptPrivacy;
  const absentPrivacy = await createCheckout(baseUrl, absentPrivacyPayload);
  assert.equal(absentPrivacy.success, false);
  assert.equal(absentPrivacy.error, 'Vous devez accepter la politique de confidentialité.');

  const normalizedWithPhone = await validateCheckoutPayload({
    ...validCheckoutPayload({ email: 'phone.ignored@example.test' }),
    phone: '+32470000000',
    telephone: '+32471111111',
  });
  assert.equal(normalizedWithPhone.ok, true);
  assert.equal(Object.hasOwn(normalizedWithPhone.normalized, 'phone'), false);
  assert.equal(Object.hasOwn(normalizedWithPhone.normalized, 'telephone'), false);
  assert.ok(normalizedWithPhone.normalized.acceptTermsAt);
  assert.ok(normalizedWithPhone.normalized.acceptPrivacyAt);

  const metadataWithPhone = buildCheckoutMetadata(normalizedWithPhone.normalized);
  assert.equal(Object.hasOwn(metadataWithPhone, 'phone'), false);
  assert.equal(Object.hasOwn(metadataWithPhone, 'telephone'), false);
  assert.equal(Object.hasOwn(metadataWithPhone, 'password'), false);
  assert.deepEqual(Object.keys(metadataWithPhone).sort(), [
    'acceptPrivacyAt',
    'acceptTermsAt',
    'addressLine1',
    'billingCycle',
    'city',
    'companyName',
    'country',
    'email',
    'firstName',
    'lastName',
    'licenseType',
    'maxDevices',
    'monthlyRiskAnalysisLimit',
    'monthlySimpleDocumentsLimit',
    'passwordHash',
    'plan',
    'postalCode',
    'price',
    'vatNumber',
  ]);

  const existingPasswordHash = await hashPassword('existing-password');
  createUserLicenseFromCheckoutMetadata(
    checkoutMetadata({
      email: 'existing@example.test',
      passwordHash: existingPasswordHash,
    }),
    {
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      currentPeriodEnd: 4102444800,
    },
  );

  const duplicateEmail = await createCheckout(baseUrl, {
    ...validCheckoutPayload(),
    email: 'existing@example.test',
  });
  assert.equal(duplicateEmail.success, false);
  assert.match(duplicateEmail.error, /existe déjà/);

  const missingStripeSecret = await createCheckout(baseUrl, validCheckoutPayload());
  assert.equal(missingStripeSecret.success, false);
  assert.match(missingStripeSecret.error, /STRIPE_SECRET_KEY/);

  const passwordHash = await hashPassword('correct-password');
  const created = createUserLicenseFromCheckoutMetadata(
    checkoutMetadata({
      email: 'primary.monthly@example.test',
      passwordHash,
    }),
    {
      stripeCustomerId: 'cus_primary',
      stripeSubscriptionId: 'sub_primary',
      currentPeriodEnd: 4102444800,
    },
  );

  assert.equal(created.email, 'primary.monthly@example.test');
  assert.equal(created.plan, 'pro');
  assert.equal(created.licenseType, 'primary');
  assert.equal(created.billingCycle, 'monthly');
  assert.equal(created.price, 79);
  assert.equal(created.currency, 'EUR');
  assert.equal(created.status, 'active');
  assert.equal(created.maxDevices, 3);
  assert.equal(created.monthlySimpleDocumentsLimit, 100);
  assert.equal(created.monthlyRiskAnalysisLimit, 40);
  assert.deepEqual(created.allowedFeatures, ['documents', 'riskAnalysis']);
  assert.ok(created.passwordHash);
  assert.equal(Object.hasOwn(created, 'password'), false);
  assert.equal(created.passwordHash, passwordHash);
  assert.deepEqual(created.billingAddress, {
    addressLine1: 'Rue de Test 1',
    postalCode: '1000',
    city: 'Bruxelles',
    country: 'BE',
  });
  assert.equal(created.acceptTermsAt, '2026-06-19T10:00:00.000Z');
  assert.equal(created.acceptPrivacyAt, '2026-06-19T10:00:00.000Z');
  assert.equal(Object.hasOwn(created, 'phone'), false);
  assert.equal(Object.hasOwn(created, 'telephone'), false);

  const stored = findUserLicenseByEmail('primary.monthly@example.test');
  assert.ok(stored);
  assert.equal(stored.stripeCustomerId, 'cus_primary');
  assert.equal(loadUserLicenses().userLicenses.length, 2);
} finally {
  await close(server);
  fs.rmSync(process.env.USER_LICENSE_STORE_PATH, { force: true });
}

console.info('Billing tests passed.');

function validCheckoutPayload(overrides = {}) {
  return {
    email: 'new.customer@example.test',
    password: 'correct-password',
    passwordConfirmation: 'correct-password',
    firstName: 'Ada',
    lastName: 'Lovelace',
    companyName: 'PreventIA Test',
    vatNumber: 'BE0123456789',
    addressLine1: 'Rue de Test 1',
    postalCode: '1000',
    city: 'Bruxelles',
    country: 'BE',
    planId: 'primary_monthly',
    acceptTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
}

function checkoutMetadata(overrides = {}) {
  return {
    email: 'primary.monthly@example.test',
    passwordHash: '$2b$12$placeholderHashForBillingTestOnly0000000000000000000',
    firstName: 'Ada',
    lastName: 'Lovelace',
    companyName: 'PreventIA Test',
    vatNumber: 'BE0123456789',
    addressLine1: 'Rue de Test 1',
    postalCode: '1000',
    city: 'Bruxelles',
    country: 'BE',
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'monthly',
    price: '79',
    currency: 'EUR',
    maxDevices: '3',
    monthlySimpleDocumentsLimit: '100',
    monthlyRiskAnalysisLimit: '40',
    allowedFeatures: 'documents,riskAnalysis',
    acceptTermsAt: '2026-06-19T10:00:00.000Z',
    acceptPrivacyAt: '2026-06-19T10:00:00.000Z',
    phone: '+32470000000',
    telephone: '+32471111111',
    ...overrides,
  };
}

function createCheckout(baseUrl, payload) {
  return postJson(baseUrl, '/api/billing/create-checkout-session', payload);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function getJson(baseUrl, pathName) {
  return requestJson(baseUrl, pathName, { method: 'GET' });
}

function getText(baseUrl, pathName) {
  return requestText(baseUrl, pathName, { method: 'GET' });
}

function postJson(baseUrl, pathName, payload) {
  return requestJson(baseUrl, pathName, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

function requestJson(baseUrl, pathName, options) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, baseUrl);
    const req = http.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function requestText(baseUrl, pathName, options) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, baseUrl);
    const req = http.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
          statusCode: res.statusCode,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}
