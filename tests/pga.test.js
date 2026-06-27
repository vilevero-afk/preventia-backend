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
  const response = await postJson(baseUrl, '/api/generate-document', {
    documentType: 'Plan annuel d’action',
    language: 'fr',
    formData: {
      companyName: 'SPGE',
      site: 'Site administratif',
      context: 'Bureaux administratifs et locaux techniques.',
      riskProfile: 'modéré',
      importedActionItems: [
        'additionalInformation: bloc brut',
        'documentType: Analyse de risques incendie',
        'activity: bureaux administratifs',
        'Famille de danger / Danger précis / Scénario plausible',
        'Livre III - Code belge du bien-être au travail',
        'Page 1 / 1',
        'Vérifier compatibilité, ventilation, quantités stockées et séparation des produits',
        'Dégager les voies, marquer les zones interdites au stockage et contrôler quotidiennement',
        'Rendre les équipements visibles et accessibles',
        'Supprimer les cales, vérifier fermeture automatique et sensibiliser le personnel',
        'Centraliser FDS, vérifier étiquetage CLP et séparer incompatibilités',
      ],
    },
  });

  assert.equal(response.success, true);
  assert.equal(response.source, 'deterministic_backend');
  assert.match(response.document, /Vérifier la compatibilité, la ventilation, les quantités stockées/);
  assert.match(response.document, /Dégager les voies d’évacuation/);
  assert.match(response.document, /Rendre les moyens d’extinction visibles et accessibles/);
  assert.match(response.document, /Supprimer les cales, vérifier la fermeture automatique/);
  assert.match(response.document, /Centraliser les FDS, vérifier l’étiquetage CLP/);
  assert.doesNotMatch(response.document, /additionalInformation/);
  assert.doesNotMatch(response.document, /documentType/);
  assert.doesNotMatch(response.document, /Famille de danger/);
  assert.doesNotMatch(extractSection(response.document, 4), /Livre III/);
  assert.doesNotMatch(response.document, /Page 1 \/ 1/);
  assert.ok(countActionRows(response.document) < 50);
  assert.match(response.document, /## 7\. Preuves à obtenir/);
  assert.match(response.document, /## 8\. Points à vérifier avant validation/);
} finally {
  await close(server);
}

console.info('PGA/PAA/PGP tests passed.');

function countActionRows(document) {
  return document.split('\n').filter((line) => /^\| \d+ \|/.test(line)).length;
}

function extractSection(document, number) {
  const next = number + 1;
  const match = document.match(new RegExp(`^## ${number}\\. [^\\n]+\\n\\n([\\s\\S]*?)(?=^## ${next}\\. |(?![\\s\\S]))`, 'm'));
  assert.ok(match?.[1], `La section ${number} doit exister.`);
  return match[1];
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
