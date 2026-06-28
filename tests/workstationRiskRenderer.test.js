import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app, selectRendererForDocumentType } = await import('../server.js');

assert.equal(
  selectRendererForDocumentType('Analyse de risques par poste de travail')?.rendererName,
  'renderWorkstationRiskAssessment',
);
assert.equal(
  selectRendererForDocumentType('Fiche de poste')?.rendererName,
  'renderJobDescriptionSheetMarkdown',
);
assert.notEqual(
  selectRendererForDocumentType('Analyse de risques par poste de travail')?.rendererName,
  'renderJobDescriptionSheetMarkdown',
);

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const response = await postJson(baseUrl, '/api/generate-document', {
    documentType: 'Analyse de risques par poste de travail',
    language: 'fr',
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      activitePoste: 'Agent d’accueil administratif',
      secteurActivite: 'Administration',
      travailleursExposes: 'Agent d’accueil, visiteurs et collègues proches',
      additionalContext: `SCÉNARIO TEST SPGE
Accueil visiteurs, téléphone, courrier, écran et petits colis.
Référence AR-2026-0072 — Page 1 / 1`,
    },
  });

  assert.equal(response.success, true);
  assert.equal(response.source, 'deterministic_backend');
  assert.equal(response.documentType, 'Analyse de risques par poste de travail');
  assert.match(response.document, /Analyse de risques par poste de travail/);
  assert.match(response.document, /posture écran prolongée/i);
  assert.match(response.document, /charge mentale/i);
  assert.match(response.document, /accueil visiteurs difficiles/i);
  assert.match(response.document, /câbles ou trébuchement/i);
  assert.match(response.document, /confidentialité/i);
  assert.match(response.document, /moyen d’alerte interne/i);
  assert.match(response.document, /tableau principal d’analyse des risques/i);
  assert.match(response.document, /plan d’action/i);
  assert.doesNotMatch(response.document, /Fiche de poste – Projet à adapter et à valider/i);
  assert.doesNotMatch(response.document, /SCÉNARIO TEST SPGE/i);
  assert.doesNotMatch(response.document, /Décrire les missions principales du poste/i);
  assert.doesNotMatch(response.document, /Page 1 \/ 1/i);
  assertNoEmptySections(response.document);
  assertNoRepeatedTasks(response.document);
} finally {
  await close(server);
}

console.info('Workstation risk renderer tests passed.');

function assertNoEmptySections(document) {
  const headings = [...document.matchAll(/^##\s+\d+\.\s+.+$/gm)];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? document.length;
    assert.ok(document.slice(start, end).trim(), `Section vide: ${heading[0]}`);
  }
}

function assertNoRepeatedTasks(document) {
  const match = document.match(/^## 3\. Tâches réelles du poste\s*\n([\s\S]*?)(?=^## 4\. )/m);
  assert.ok(match?.[1]);
  const tasks = match[1].split('\n').filter((line) => line.startsWith('- '));
  assert.equal(new Set(tasks.map((line) => line.toLowerCase())).size, tasks.length);
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
