import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app, canUseDocumentType, isSimplePreventionDocument } = await import('../server.js');

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  for (const documentType of ['Analyse de risques par poste de travail', 'Fiche de poste']) {
    assert.equal(isSimplePreventionDocument(documentType), true, documentType);
    assert.equal(canUseDocumentType(documentType), true, documentType);

    const response = await postJson(baseUrl, '/api/generate-document', {
      documentType,
      language: 'fr',
      formData: {
        companyName: 'SPGE',
        siteName: 'Site administratif de Verviers',
        activitePoste: 'Technicien de maintenance',
        secteurActivite: 'Maintenance bâtiments',
        tachesPrincipales: 'Interventions techniques; rondes; petites réparations',
        machinesEquipements: 'Outillage électroportatif, escabeau',
        risques: 'Manutention, travail en hauteur ponctuel, risque électrique résiduel',
        mesuresPrevention: 'Vérifier les outils, respecter les consignations, utiliser les EPI',
        epi: 'Chaussures de sécurité, gants adaptés, lunettes',
        formations: 'Accueil sécurité, BA4 selon interventions autorisées',
      },
    });

    assert.equal(response.success, true, documentType);
    assert.equal(response.source, 'deterministic_backend', documentType);
    assert.equal(response.documentType, 'Fiche de poste', documentType);
    assert.doesNotMatch(JSON.stringify(response), /documentType inconnu/i);
    assert.match(response.document, /# Fiche de poste/);
    assert.match(response.document, /Technicien de maintenance/);
    assert.match(response.document, /Risques liés au poste/);
    assert.match(response.document, /Mesures de prévention/);
    assert.match(response.document, /Projet à adapter et à valider/);
  }
} finally {
  await close(server);
}

console.info('Job description alias tests passed.');

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
          resolve({ statusCode: response.statusCode, ...JSON.parse(responseBody) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}
