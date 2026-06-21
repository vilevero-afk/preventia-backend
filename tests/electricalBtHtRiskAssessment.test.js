import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
delete process.env.OPENAI_API_KEY;

const { app, isRiskAnalysisDocument } = await import('../server.js');
const { renderElectricalBtHtRiskAssessmentMarkdown } = await import(
  '../src/renderers/electricalBtHtRiskAssessmentRenderer.js'
);

const aliases = [
  'Analyse de risques — Installations électriques BT/HT',
  'Analyse de risques BT/HT',
  'Analyse de risques électrique',
  'Analyse de risques électricité',
  'Analyse de risques basse tension haute tension',
  'risk_assessment_electrical_bt_ht',
];

const formData = {
  companyName: 'PreventIA Test',
  siteName: 'Site Bruxelles',
  installationType: 'mixte',
  workEquipment: [{ name: 'Presse', power: '15 kW' }],
};

const markdown = renderElectricalBtHtRiskAssessmentMarkdown(formData, 'fr');
assert.ok(markdown.length > 0);
assert.match(markdown, /Analyse de risques — Installations électriques BT\/HT/);
assert.match(markdown, /aide au conseiller en prévention/i);

for (const expected of [
  'basse tension', 'haute tension', 'BA4', 'BA5', 'RGIE', 'contact direct',
  'contact indirect', 'arc électrique', 'consignation', 'thermographie',
  'PAA', 'PGP', 'DIU', 'PIU',
]) {
  assert.match(markdown, new RegExp(expected, 'i'), expected);
}

assert.equal(renderElectricalBtHtRiskAssessmentMarkdown(formData, 'fr'), markdown);
assert.match(renderElectricalBtHtRiskAssessmentMarkdown({}, 'fr'), /\[à compléter\]/);
assert.match(renderElectricalBtHtRiskAssessmentMarkdown({}, 'fr'), /\[à vérifier sur site\]/);
assert.match(renderElectricalBtHtRiskAssessmentMarkdown({}, 'fr'), /\[preuve à obtenir\]/);

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
    assert.equal(response.documentType, 'Analyse de risques — Installations électriques BT/HT');
    assert.match(response.document, /Analyse de risques — Installations électriques BT\/HT/);
  }
} finally {
  await close(server);
}

console.info('Electrical BT/HT risk assessment tests passed.');

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
