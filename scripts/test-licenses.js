import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.LICENSE_STORE_PATH = path.join('/private/tmp', `preventia-licenses-test-${Date.now()}.json`);

const {
  canUseDocumentType,
  createLicenseRecord,
  incrementUsage,
  loadLicenses,
  registerDeviceIfAllowed,
  saveLicenses,
  validateLicenseAccess,
} = await import('../server.js');

const simpleDocumentType = 'Plan annuel d’action';
const riskDocumentType = 'Analyse de risques incendie et évacuation';
const futureEndDate = '2099-12-31';

saveLicenses({ licenses: [] });

const documentsLicense = createAndStoreLicense({
  companyName: 'PreventIA Test Documents',
  adminEmail: 'admin-documents@example.test',
  plan: 'documents',
  endDate: futureEndDate,
});

assert.equal(documentsLicense.plan, 'documents');
assert.equal(documentsLicense.monthlySimpleDocumentsLimit, 100);
assert.equal(documentsLicense.monthlyRiskAnalysisLimit, 0);

assert.equal(registerDeviceIfAllowed(documentsLicense, {
  deviceId: 'device-doc-1',
  deviceName: 'Poste admin',
  platform: 'ios',
  appVersion: '1.0.0',
}).ok, true);
assert.equal(registerDeviceIfAllowed(documentsLicense, {
  deviceId: 'device-doc-2',
  platform: 'ios',
}).ok, true);
assert.equal(registerDeviceIfAllowed(documentsLicense, {
  deviceId: 'device-doc-3',
  platform: 'ios',
}).ok, false, 'Le troisième appareil doit être refusé pour le plan documents.');
assert.equal(documentsLicense.activatedDevices.length, 2);
saveCurrentLicense(documentsLicense);

assert.equal(canUseDocumentType(documentsLicense, simpleDocumentType), true);
assert.equal(canUseDocumentType(documentsLicense, riskDocumentType), false);

let validation = validateLicenseAccess({
  licenseKey: documentsLicense.licenseKey,
  deviceId: 'device-doc-1',
  documentType: simpleDocumentType,
});
assert.equal(validation.ok, true);
assert.equal(validation.license.usedSimpleDocumentsThisMonth, 0, 'La validation seule ne consomme pas de quota.');
incrementUsage(validation.license, simpleDocumentType);
saveLicenses(validation.store);
assert.equal(
  loadLicenses().licenses.find((license) => license.licenseKey === documentsLicense.licenseKey).usedSimpleDocumentsThisMonth,
  1,
  'Le quota est consommé seulement après succès simulé.',
);

validation = validateLicenseAccess({
  licenseKey: documentsLicense.licenseKey,
  deviceId: 'device-doc-1',
  documentType: riskDocumentType,
});
assert.equal(validation.ok, false);
assert.equal(validation.error, 'Votre abonnement ne permet pas de générer ce type de document.');

const risksLicense = createAndStoreLicense({
  companyName: 'PreventIA Test Risks',
  adminEmail: 'admin-risks@example.test',
  plan: 'risks',
  endDate: futureEndDate,
});
assert.equal(registerDeviceIfAllowed(risksLicense, { deviceId: 'device-risk-1' }).ok, true);
saveCurrentLicense(risksLicense);
assert.equal(canUseDocumentType(risksLicense, riskDocumentType), true);
assert.equal(canUseDocumentType(risksLicense, simpleDocumentType), false);
assert.equal(validateLicenseAccess({
  licenseKey: risksLicense.licenseKey,
  deviceId: 'device-risk-1',
  documentType: riskDocumentType,
}).ok, true);
assert.equal(validateLicenseAccess({
  licenseKey: risksLicense.licenseKey,
  deviceId: 'device-risk-1',
  documentType: simpleDocumentType,
}).ok, false);

const proLicense = createAndStoreLicense({
  companyName: 'PreventIA Test Pro',
  adminEmail: 'admin-pro@example.test',
  plan: 'pro',
  endDate: futureEndDate,
});
assert.equal(registerDeviceIfAllowed(proLicense, { deviceId: 'device-pro-1' }).ok, true);
saveCurrentLicense(proLicense);
assert.equal(canUseDocumentType(proLicense, simpleDocumentType), true);
assert.equal(canUseDocumentType(proLicense, riskDocumentType), true);
assert.equal(validateLicenseAccess({
  licenseKey: proLicense.licenseKey,
  deviceId: 'device-pro-1',
  documentType: simpleDocumentType,
}).ok, true);
assert.equal(validateLicenseAccess({
  licenseKey: proLicense.licenseKey,
  deviceId: 'device-pro-1',
  documentType: riskDocumentType,
}).ok, true);

const expiredLicense = createAndStoreLicense({
  companyName: 'PreventIA Test Expired',
  adminEmail: 'admin-expired@example.test',
  plan: 'pro',
  endDate: '2000-01-01',
});
assert.equal(registerDeviceIfAllowed(expiredLicense, { deviceId: 'device-expired-1' }).ok, true);
saveCurrentLicense(expiredLicense);
validation = validateLicenseAccess({
  licenseKey: expiredLicense.licenseKey,
  deviceId: 'device-expired-1',
  documentType: simpleDocumentType,
});
assert.equal(validation.ok, false);
assert.equal(validation.error, 'Licence expirée.');

fs.rmSync(process.env.LICENSE_STORE_PATH, { force: true });
console.info('License tests passed.');

function createAndStoreLicense(payload) {
  const store = loadLicenses();
  const license = createLicenseRecord(payload);
  store.licenses.push(license);
  saveLicenses(store);
  return license;
}

function saveCurrentLicense(updatedLicense) {
  const store = loadLicenses();
  const index = store.licenses.findIndex((license) => license.licenseKey === updatedLicense.licenseKey);
  assert.notEqual(index, -1);
  store.licenses[index] = updatedLicense;
  saveLicenses(store);
}
