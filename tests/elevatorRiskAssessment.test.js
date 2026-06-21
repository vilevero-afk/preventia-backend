import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
delete process.env.OPENAI_API_KEY;

const { app, isRiskAnalysisDocument } = await import('../server.js');
const { renderElevatorRiskAssessmentMarkdown } = await import(
  '../src/renderers/elevatorRiskAssessmentRenderer.js'
);

const aliases = [
  'Analyse de risques — Ascenseur',
  'Analyse de risques ascenseur',
  'Analyse ascenseur',
  'Ascenseur',
  'risk_assessment_elevator',
  'elevator_risk_assessment',
];

const formData = {
  companyName: 'PreventIA Test',
  siteName: 'Site Bruxelles',
  owner: 'Propriétaire test',
  elevatorType: 'hydraulique',
  historicalValue: 'inconnue',
};

const markdown = renderElevatorRiskAssessmentMarkdown(formData, 'fr');
assert.ok(markdown.length > 0);
assert.match(markdown, /Analyse de risques — Ascenseur/);
assert.match(markdown, /aide au conseiller en prévention/i);

for (const expected of [
  'SECT', 'AR du 9 mars 2003', 'gravité x probabilité x exposition',
  'porte cabine', 'portes palières', 'communication bidirectionnelle',
  'éclairage secours', 'cuvette', 'salle machines', 'parachute',
  'limiteur de vitesse', 'PAA', 'PGP', 'DIU', 'PIU',
]) {
  assert.match(markdown, new RegExp(expected, 'i'), expected);
}

assert.equal(renderElevatorRiskAssessmentMarkdown(formData, 'fr'), markdown);
const emptyMarkdown = renderElevatorRiskAssessmentMarkdown({}, 'fr');
assert.match(emptyMarkdown, /\[à compléter\]/);
assert.match(emptyMarkdown, /\[à vérifier sur site\]/);
assert.match(emptyMarkdown, /\[preuve à obtenir\]/);
assert.match(emptyMarkdown, /\[validation requise\]/);
assert.doesNotMatch(
  renderElevatorRiskAssessmentMarkdown({ historicalValue: 'non' }, 'fr'),
  /## 9\. Ascenseur de valeur historique/,
);

for (const alias of aliases) {
  assert.equal(isRiskAnalysisDocument(alias), true, alias);
}

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  for (const documentType of aliases) {
    const response = await postJson(baseUrl, '/api/generate-document', {
      documentType,
      formData,
      language: 'fr',
    });
    assert.equal(response.success, true, documentType);
    assert.equal(response.source, 'deterministic_backend', documentType);
    assert.equal(response.documentType, 'Analyse de risques — Ascenseur');
    assert.match(response.document, /Analyse de risques — Ascenseur/);
  }
} finally {
  await close(server);
}

console.info('Elevator risk assessment tests passed.');

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
