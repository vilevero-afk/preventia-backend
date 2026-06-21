import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { LicenseStore, normalizeEmail, publicLicense } from '../src/licenseStore.js';

const jsonPath = path.join('/private/tmp', `preventia-license-store-${Date.now()}.json`);
const store = new LicenseStore({ databaseUrl: '', jsonPath });

try {
  await store.init();
  assert.equal(store.mode, 'json');
  assert.equal(fs.existsSync(jsonPath), true);
  assert.equal(normalizeEmail('  Ada.Lovelace@Example.TEST '), 'ada.lovelace@example.test');

  const passwordHash = await bcrypt.hash('correct-password', 4);
  const created = await store.create({
    id: 'license-1',
    email: ' Ada.Lovelace@Example.TEST ',
    password: 'must-never-be-stored',
    passwordHash,
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'monthly',
    status: 'active',
    endDate: '2099-12-31',
    maxDevices: 2,
    activatedDevices: [],
    allowedFeatures: ['documents', 'riskAnalysis'],
  });
  assert.equal(created.email, 'ada.lovelace@example.test');
  assert.equal(Object.hasOwn(created, 'password'), false);

  const found = await store.findByEmail('ADA.LOVELACE@example.test');
  assert.equal(found.id, 'license-1');

  const newPasswordHash = await bcrypt.hash('new-correct-password', 4);
  const reset = await store.resetPassword('ada.lovelace@example.test', newPasswordHash);
  assert.equal(reset.passwordHash, newPasswordHash);
  assert.equal(await bcrypt.compare('new-correct-password', reset.passwordHash), true);

  const firstDevice = await store.addDevice(reset, { deviceId: 'device-1', deviceName: 'Portable' });
  assert.equal(firstDevice.ok, true);
  assert.equal(firstDevice.activated, true);
  assert.equal(firstDevice.license.activatedDevices.length, 1);

  const existingDevice = await store.addDevice(firstDevice.license, { deviceId: 'device-1', appVersion: '2.0' });
  assert.equal(existingDevice.ok, true);
  assert.equal(existingDevice.activated, false);
  assert.equal(existingDevice.license.activatedDevices.length, 1);

  const secondDevice = await store.addDevice(existingDevice.license, { deviceId: 'device-2' });
  assert.equal(secondDevice.ok, true);
  const overLimit = await store.addDevice(secondDevice.license, { deviceId: 'device-3' });
  assert.equal(overLimit.ok, false);
  assert.match(overLimit.error, /Limite d’appareils/);

  const afterRemoval = await store.removeDevice('license-1', 'device-1');
  assert.deepEqual(afterRemoval.activatedDevices.map((device) => device.deviceId), ['device-2']);

  const response = publicLicense(await store.findByEmail('ada.lovelace@example.test'));
  assert.equal(Object.hasOwn(response, 'passwordHash'), false);
  assert.equal(Object.hasOwn(response, 'password_hash'), false);
  assert.equal(Object.hasOwn(response, 'password'), false);
  assert.equal(fs.readFileSync(jsonPath, 'utf8').includes('must-never-be-stored'), false);
} finally {
  await store.close();
  fs.rmSync(jsonPath, { force: true });
}

console.info('License store tests passed.');
