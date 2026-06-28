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
  assert.equal(isSimplePreventionDocument('Analyse de risques par poste de travail'), true);
  assert.equal(canUseDocumentType('Analyse de risques par poste de travail'), true);
  assert.equal(isSimplePreventionDocument('Fiche de poste'), true);
  assert.equal(canUseDocumentType('Fiche de poste'), true);

  const workstationResponse = await generate('Analyse de risques par poste de travail');
  assert.equal(workstationResponse.success, true);
  assert.equal(workstationResponse.source, 'deterministic_backend');
  assert.equal(workstationResponse.documentType, 'Analyse de risques par poste de travail');
  assert.doesNotMatch(JSON.stringify(workstationResponse), /documentType inconnu/i);
  assert.match(workstationResponse.document, /# Analyse de risques par poste de travail/);
  assert.match(workstationResponse.document, /Tableau principal d’analyse des risques/);
  assert.match(workstationResponse.document, /Agent d’accueil administratif|Technicien de maintenance/);

  const jobSheetResponse = await generate('Fiche de poste');
  assert.equal(jobSheetResponse.success, true);
  assert.equal(jobSheetResponse.source, 'deterministic_backend');
  assert.equal(jobSheetResponse.documentType, 'Fiche de poste');
  assert.doesNotMatch(JSON.stringify(jobSheetResponse), /documentType inconnu/i);
  assert.match(jobSheetResponse.document, /# Fiche de poste/);
  assert.match(jobSheetResponse.document, /Technicien de maintenance/);
  assert.match(jobSheetResponse.document, /Risques liés au poste/);
  assert.match(jobSheetResponse.document, /Mesures de prévention/);
  assert.match(jobSheetResponse.document, /Projet à adapter et à valider/);
} finally {
  await close(server);
}

console.info('Job description alias tests passed.');

function generate(documentType) {
  return postJson(baseUrl, '/api/generate-document', {
    documentType,
    language: 'fr',
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      activitePoste: documentType === 'Analyse de risques par poste de travail'
        ? 'Agent d’accueil administratif'
        : 'Technicien de maintenance',
      secteurActivite: 'Maintenance bâtiments',
      tachesPrincipales: 'Interventions techniques; rondes; petites réparations',
      machinesEquipements: 'Outillage électroportatif, escabeau',
      risques: 'Manutention, travail en hauteur ponctuel, risque électrique résiduel',
      mesuresPrevention: 'Vérifier les outils, respecter les consignations, utiliser les EPI',
      epi: 'Chaussures de sécurité, gants adaptés, lunettes',
      formations: 'Accueil sécurité, BA4 selon interventions autorisées',
    },
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
