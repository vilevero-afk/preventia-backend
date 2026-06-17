import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'preventia-user-license-test-secret';
process.env.ADMIN_LICENSE_SECRET = 'admin-test-secret';
process.env.USER_LICENSE_STORE_PATH = path.join('/private/tmp', `preventia-user-licenses-test-${Date.now()}.json`);

const {
  app,
  findUserLicenseByEmail,
  getPlanDefaults,
  incrementUsage,
  loadUserLicenses,
  saveUserLicenses,
} = await import('../server.js');

const simpleDocumentType = 'Plan annuel d’action';
const riskDocumentType = 'Analyse de risques incendie et évacuation';
const futureEndDate = '2099-12-31';

saveUserLicenses({ userLicenses: [] });

assert.equal(getPlanDefaults('pro', 'primary', 'monthly').price, 79);
assert.equal(getPlanDefaults('pro', 'primary', 'yearly').price, 790);
assert.equal(getPlanDefaults('pro', 'additional', 'monthly').price, 39);
assert.equal(getPlanDefaults('pro', 'additional', 'yearly').price, 390);

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const shortPassword = await register(baseUrl, {
    email: 'short@example.test',
    password: 'short',
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'monthly',
    endDate: futureEndDate,
  });
  assert.equal(shortPassword.success, false);
  assert.match(shortPassword.error, /minimum 8/);

  const created = await register(baseUrl, {
    email: 'Primary.Monthly@Example.Test',
    password: 'correct-password',
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'monthly',
    endDate: futureEndDate,
  });
  assert.equal(created.success, true);
  assert.equal(created.userLicense.email, 'primary.monthly@example.test');
  assert.equal(created.userLicense.price, 79);
  assert.equal(created.userLicense.maxDevices, 3);
  assert.equal(Object.hasOwn(created.userLicense, 'passwordHash'), false);
  assert.equal(Object.hasOwn(created.userLicense, 'password'), false);

  const storedPrimary = findUserLicenseByEmail('primary.monthly@example.test');
  assert.ok(storedPrimary.passwordHash);
  assert.equal(Object.hasOwn(storedPrimary, 'password'), false);

  const resetPassword = await adminResetPassword(baseUrl, {
    email: 'PRIMARY.MONTHLY@example.test',
    newPassword: 'new-correct-password',
  });
  assert.equal(resetPassword.success, true);
  assert.equal(resetPassword.message, 'Mot de passe réinitialisé.');
  assert.equal(Object.hasOwn(resetPassword, 'passwordHash'), false);

  const oldPasswordAfterReset = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'correct-password',
    deviceId: 'reset-device-old',
  });
  assert.equal(oldPasswordAfterReset.success, false);

  const newPasswordAfterReset = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'new-correct-password',
    deviceId: 'device-1',
  });
  assert.equal(newPasswordAfterReset.success, true);

  const duplicate = await register(baseUrl, {
    email: 'PRIMARY.MONTHLY@example.test',
    password: 'another-password',
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'monthly',
    endDate: futureEndDate,
  });
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /existe déjà/);

  const badLogin = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'wrong-password',
    deviceId: 'device-1',
  });
  assert.equal(badLogin.success, false);

  const login = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'new-correct-password',
    deviceId: 'device-1',
    deviceName: 'Portable',
    platform: 'ios',
    appVersion: '1.0.0',
  });
  assert.equal(login.success, true);
  assert.ok(login.token);
  assert.equal(login.licenseStatus.activatedDevices, 1);

  const storedAfterLogin = findUserLicenseByEmail('primary.monthly@example.test');
  assert.equal(storedAfterLogin.activatedDevices.length, 1);

  const device2 = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'new-correct-password',
    deviceId: 'device-2',
  });
  assert.equal(device2.success, true);

  const device3 = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'new-correct-password',
    deviceId: 'device-3',
  });
  assert.equal(device3.success, true);

  const device4 = await postJson(baseUrl, '/api/auth/login', {
    email: 'primary.monthly@example.test',
    password: 'new-correct-password',
    deviceId: 'device-4',
  });
  assert.equal(device4.success, false);
  assert.match(device4.error, /Limite d’appareils/);

  const me = await getJson(baseUrl, '/api/auth/me', login.token);
  assert.equal(me.success, true);
  assert.equal(me.licenseStatus.email, 'primary.monthly@example.test');

  const validation = await postJson(baseUrl, '/api/auth/validate-generation', {
    deviceId: 'device-1',
    documentType: riskDocumentType,
  }, login.token);
  assert.equal(validation.success, true);
  assert.equal(validation.canGenerate, true);

  const beforeUsage = findUserLicenseByEmail('primary.monthly@example.test');
  assert.equal(beforeUsage.usedRiskAnalysisThisMonth, 0);
  incrementUsage(beforeUsage, riskDocumentType);
  const usageStore = loadUserLicenses();
  const usageIndex = usageStore.userLicenses.findIndex((item) => item.email === beforeUsage.email);
  usageStore.userLicenses[usageIndex] = beforeUsage;
  saveUserLicenses(usageStore);
  assert.equal(findUserLicenseByEmail('primary.monthly@example.test').usedRiskAnalysisThisMonth, 1);

  const expired = await register(baseUrl, {
    email: 'expired@example.test',
    password: 'correct-password',
    plan: 'pro',
    licenseType: 'additional',
    billingCycle: 'yearly',
    endDate: '2000-01-01',
  });
  assert.equal(expired.success, true);
  assert.equal(expired.userLicense.price, 390);

  const expiredLogin = await postJson(baseUrl, '/api/auth/login', {
    email: 'expired@example.test',
    password: 'correct-password',
    deviceId: 'expired-device',
  });
  assert.equal(expiredLogin.success, false);
  assert.equal(expiredLogin.error, 'Licence expirée.');

  const additionalMonthly = await register(baseUrl, {
    email: 'additional.monthly@example.test',
    password: 'correct-password',
    plan: 'pro',
    licenseType: 'additional',
    billingCycle: 'monthly',
    endDate: futureEndDate,
  });
  assert.equal(additionalMonthly.success, true);
  assert.equal(additionalMonthly.userLicense.price, 39);

  assert.equal(findUserLicenseByEmail('primary.monthly@example.test').allowedFeatures.includes('documents'), true);
  assert.equal(findUserLicenseByEmail('primary.monthly@example.test').allowedFeatures.includes('riskAnalysis'), true);
  assert.equal(simpleDocumentType.length > 0, true);
} finally {
  await close(server);
  fs.rmSync(process.env.USER_LICENSE_STORE_PATH, { force: true });
}

console.info('User license tests passed.');

function register(baseUrl, payload) {
  return postJson(baseUrl, '/api/auth/register-license', payload, null, {
    'x-admin-secret': process.env.ADMIN_LICENSE_SECRET,
  });
}

function adminResetPassword(baseUrl, payload) {
  return postJson(baseUrl, '/api/auth/admin-reset-password', payload, null, {
    'x-admin-secret': process.env.ADMIN_LICENSE_SECRET,
  });
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

function postJson(baseUrl, pathName, payload, token = null, headers = {}) {
  return requestJson(baseUrl, pathName, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

function getJson(baseUrl, pathName, token) {
  return requestJson(baseUrl, pathName, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
