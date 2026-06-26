import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app } = await import('../server.js');

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const electricalPayload = {
    documentType: 'Analyse de risques — Installations électriques BT/HT',
    markdown: `# Analyse de risques — Installations électriques BT/HT

Entreprise SPGE, site administratif de Verviers.

- RGIE : PV RGIE non disponible, preuve à obtenir.
- BA4 / BA5 : liste des personnes autorisées à confirmer.
- Consignation : procédure à formaliser pour les interventions.
- Thermographie : rapport de thermographie à obtenir pour le TGBT.
- TGBT : coupure générale à intégrer au PIU avec contacts de secours.
- PIU : prévoir coupure, incendie électrique et secours.
- PGP/PAA : actions prioritaires sur RGIE, BA4/BA5, consignation et thermographie.
- DIU : conserver schémas, plans de coupure et localisation du TGBT.`,
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      address: 'Rue des Écoles 12',
      postalCode: '4800',
      city: 'Verviers',
      preventionAdvisor: 'Vincent Legrand',
      technicalServiceContact: 'Service technique',
      riskProfile: 'modéré',
    },
    sourceDocumentId: 'doc-test-1',
    sourceReference: 'AR-2026-0050',
    language: 'fr',
  };

  const electrical = await postJson(baseUrl, '/api/prevention-dossier/extract', electricalPayload);
  assert.equal(electrical.companyProfile.companyName, 'SPGE');
  assert.equal(electrical.companyProfile.riskProfile, 'modéré');
  assert.ok(electrical.piuCandidates.length > 0);
  assert.ok(electrical.pgpCandidates.length > 0);
  assert.ok(electrical.evidenceItems.length > 0);
  assert.ok(electrical.priorityActions.length > 0);
  assert.ok(electrical.piuCandidates.length <= 40);
  assert.ok(electrical.pgpCandidates.length <= 80);
  assertContains(electrical.piuCandidates, ['coupure', 'tgbt', 'secours', 'incendie']);
  assertContains(electrical.pgpCandidates, ['consignation', 'thermographie', 'rgie', 'ba4']);
  assertContains(electrical.evidenceItems, ['pv rgie', 'thermographie']);
  assertNoValidatedStatus(electrical);
  assertCandidateStatuses(electrical);

  const missingProfile = await postJson(baseUrl, '/api/prevention-dossier/extract', {
    ...electricalPayload,
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
    },
  });
  assert.ok(missingProfile.warnings.includes('Profil de risque de l’entreprise à confirmer avant validation du PIU et du PGP/PAA.'));
  assertContains(missingProfile.pointsToVerify, ['profil de risque']);
  assert.equal(missingProfile.companyProfile.riskProfile, 'inconnu / à déterminer');
  assertNoValidatedStatus(missingProfile);

  const seveso = await postJson(baseUrl, '/api/prevention-dossier/extract', {
    ...electricalPayload,
    markdown: `# Analyse générale

- Activités administratives.
- Évacuation, premiers secours et organisation à vérifier.
- Aucun inventaire technique détaillé fourni dans ce test.`,
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      riskProfile: 'Seveso seuil haut',
    },
  });
  assertContains(seveso.pointsToVerify, ['seveso']);
  assert.ok(seveso.requiredValidations.some((item) => /seveso/i.test(item.reason)));
  assert.doesNotMatch(JSON.stringify(seveso.piuCandidates), /accident majeur/i);
  assertNoValidatedStatus(seveso);

  const missingMarkdown = await postJson(baseUrl, '/api/prevention-dossier/extract', {
    documentType: 'Analyse générale',
    formData: {},
  });
  assert.equal(missingMarkdown.statusCode, 400);
  assert.equal(missingMarkdown.error, 'markdown_required');
} finally {
  await close(server);
}

console.info('Prevention dossier extraction tests passed.');

function assertContains(items, needles) {
  const text = JSON.stringify(items).toLowerCase();
  assert.ok(needles.some((needle) => text.includes(needle.toLowerCase())), needles.join(' / '));
}

function assertNoValidatedStatus(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoValidatedStatus(item);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'status') assert.notEqual(child, 'validé');
      assertNoValidatedStatus(child);
    }
  }
}

function assertCandidateStatuses(response) {
  for (const item of [
    ...response.structuredRiskRows,
    ...response.piuCandidates,
    ...response.pgpCandidates,
    ...response.diuCandidates,
    ...response.priorityActions,
  ]) {
    assert.equal(item.status, 'à valider');
  }
  for (const item of response.evidenceItems) assert.equal(item.status, 'à obtenir');
  for (const item of response.pointsToVerify) assert.equal(item.status, 'à vérifier');
  for (const item of response.requiredValidations) assert.equal(item.status, 'à obtenir');
}

function listen(appInstance) {
  return new Promise((resolve, reject) => {
    const instance = appInstance.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
}

function close(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}

function postJson(baseUrl, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(pathname, baseUrl);
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ statusCode: response.statusCode, ...parsed });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

