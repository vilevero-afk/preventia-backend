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
  createUserLicenseFromCheckoutMetadata,
  findUserLicenseByEmail,
  getPublicBillingPlans,
  hashPassword,
  loadUserLicenses,
  saveUserLicenses,
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

  const stored = findUserLicenseByEmail('primary.monthly@example.test');
  assert.ok(stored);
  assert.equal(stored.stripeCustomerId, 'cus_primary');
  assert.equal(loadUserLicenses().userLicenses.length, 2);
} finally {
  await close(server);
  fs.rmSync(process.env.USER_LICENSE_STORE_PATH, { force: true });
}

console.info('Billing tests passed.');

function validCheckoutPayload() {
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
