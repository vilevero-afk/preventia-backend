import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app, selectRendererForDocumentType } = await import('../server.js');

assert.equal(
  selectRendererForDocumentType('Analyse de risques ergonomie')?.rendererName,
  'renderErgonomicsRiskAssessment',
);

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const response = await postJson(baseUrl, '/api/generate-document', {
    documentType: 'Analyse de risques ergonomie',
    language: 'fr',
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      secteurActivite: 'Administration',
      nombreTravailleurs: '25',
      siteLieuTravail: 'Site administratif de Verviers',
      activitePoste: 'Travail administratif sur écran et accueil',
      machinesEquipements: 'Écrans, claviers, souris, chaises de bureau, téléphone',
      produitsDangereux: 'Aucun produit dangereux utilisé au poste administratif',
      travailleursExposes: 'Personnel administratif, accueil et télétravailleurs partiels',
      accidentsIncidents: 'Fatigue visuelle et inconfort postural déclarés',
      mesuresExistantes: 'Chaises réglables et écrans standards',
      presenceCppt: 'À confirmer',
      serviceInterneExterne: 'SIPPT / SEPPT à consulter si nécessaire',
      contraintesParticulieres: 'Accueil, téléphone, interruptions et télétravail partiel',
      informationsComplementaires: 'Observation ergonomique à planifier',
      additionalContext: `SCÉNARIO TEST SPGE
Postes écran administratifs, accueil et télétravail partiel.
Référence AR-2026-0073 — Page 1 / 1`,
    },
  });

  assert.equal(response.success, true);
  assert.equal(response.source, 'deterministic_backend');
  assert.equal(response.documentType, 'Analyse de risques ergonomie');
  assert.match(response.document, /posture assise prolongée/i);
  assert.match(response.document, /hauteur écran/i);
  assert.match(response.document, /chaise mal réglée/i);
  assert.match(response.document, /reflets ou éclairage/i);
  assert.match(response.document, /télétravail partiel/i);
  assert.match(response.document, /Adapter la hauteur des écrans/);
  assert.match(response.document, /Former le personnel aux réglages du poste écran/);
  assert.doesNotMatch(response.document, /Vérifier et documenter Exposition aux produits dangereux/i);
  assert.doesNotMatch(response.document, /Utilisation de machines ou équipements/i);
  assert.doesNotMatch(response.document, /Activité du poste à valider sur le terrain/i);
  assert.doesNotMatch(response.document, /SCÉNARIO TEST SPGE/i);
  assert.doesNotMatch(response.document, /Page 1 \/ 1/i);
  assertNoEmptySections(response.document);
} finally {
  await close(server);
}

console.info('Ergonomics risk renderer tests passed.');

function assertNoEmptySections(document) {
  const headings = [...document.matchAll(/^##\s+\d+\.\s+.+$/gm)];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? document.length;
    assert.ok(document.slice(start, end).trim(), `Section vide: ${heading[0]}`);
  }
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
          resolve(JSON.parse(responseBody));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}
