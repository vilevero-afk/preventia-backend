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
  await testTechnicalExclusions();
  await testFireEvacuationExtraction();
  await testDeduplication();
  await testLengthLimits();
  await testMissingMarkdown();
} finally {
  await close(server);
}

console.info('Prevention dossier extraction tests passed.');

async function testTechnicalExclusions() {
  const response = await extract(`additionalInformation: sans objet
documentType: Analyse de risques
Page 1 / 1
Livre III
Méthode de cotation
`);

  assertNoTechnicalReview(response);
  assert.ok(response.ignoredItems.length > 0);
}

async function testFireEvacuationExtraction() {
  const response = await extract(`# Analyse de risques incendie et évacuation

- Évacuation générale à organiser.
- Point de rassemblement à confirmer.
- Accueil secours et accès pompiers à prévoir.
- Dégager voies d’évacuation et issues de secours.
- Extincteurs accessibles à contrôler.
- Portes coupe-feu à vérifier.
- FDS produits dangereux à obtenir.
- Rapport extincteurs à obtenir.
`);

  assert.equal(response.companyKey, 'spge');
  assert.equal(response.sourceDocumentId, 'doc-123');
  assert.equal(response.sourceReference, 'AR-2026-0063');
  assert.equal(response.sourceDocumentType, 'Analyse de risques incendie et évacuation');

  assertItem(response, 'piu', 'évacuation', true);
  assertItem(response, 'piu', 'rassemblement', true);
  assertItem(response, 'piu', 'secours', true);
  assertItem(response, 'pgp', 'voies', true);
  assertItem(response, 'pgp', 'extinction', true);
  assertItem(response, 'pgp', 'coupe-feu', true);

  const evidenceText = response.items
    .filter((item) => item.destination === 'evidence' || item.destination === 'validationPoint')
    .map((item) => JSON.stringify(item).toLowerCase())
    .join('\n');
  assert.match(evidenceText, /fds|rapport/);

  for (const item of response.items.filter((item) => item.destination === 'evidence')) {
    assert.equal(item.shouldReview, false);
  }
}

async function testDeduplication() {
  const response = await extract('- Dégager voies d’évacuation et issues de secours.', {
    existingCandidateFingerprints: ['pgp|degager-voies-evacuation|obstruction-issues'],
  });

  assert.ok(!response.items.some((item) => item.fingerprint === 'pgp|degager-voies-evacuation|obstruction-issues'));
  assert.ok(response.ignoredItems.some((item) => item.reason === 'Déjà présent dans le dossier prévention'));
}

async function testLengthLimits() {
  const response = await extract(`# Analyse

- Dégager voies d’évacuation et issues de secours avec un texte volontairement long qui ne doit jamais ressortir comme un paragraphe complet dans le titre ou la description car Flutter affichera des candidats courts.
- Évacuation générale à organiser avec plusieurs détails opérationnels à condenser.
`);

  for (const item of response.items) {
    assert.ok(item.title.length <= 90, item.title);
    assert.ok(item.description.length <= 240, item.description);
    assert.ok(String(item.evidence || '').length <= 180, item.evidence);
  }
}

async function testMissingMarkdown() {
  const response = await postJson(baseUrl, '/api/prevention-dossier/extract', {
    documentType: 'Analyse générale',
    formData: {},
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.error, 'markdown_required');
}

function assertNoTechnicalReview(response) {
  const reviewedText = response.items
    .filter((item) => item.shouldReview)
    .map((item) => JSON.stringify(item))
    .join('\n');
  assert.doesNotMatch(reviewedText, /additionalInformation|documentType|Page 1 \/ 1|Livre III|Méthode de cotation/i);
}

function assertItem(response, destination, needle, shouldReview) {
  const item = response.items.find((candidate) =>
    candidate.destination === destination
    && candidate.shouldReview === shouldReview
    && JSON.stringify(candidate).toLowerCase().includes(needle.toLowerCase()));
  assert.ok(item, `${destination} ${needle} shouldReview=${shouldReview}`);
}

function extract(markdown, overrides = {}) {
  return postJson(baseUrl, '/api/prevention-dossier/extract', {
    companyKey: 'spge',
    documentType: 'Analyse de risques incendie et évacuation',
    sourceDocumentId: 'doc-123',
    sourceReference: 'AR-2026-0063',
    markdown,
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      riskProfile: 'modéré',
    },
    language: 'fr',
    ...overrides,
  });
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
