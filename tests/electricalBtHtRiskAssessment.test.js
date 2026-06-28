import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app, isRiskAnalysisDocument } = await import('../server.js');
const { renderElectricalBtHtRiskAssessmentMarkdown } = await import(
  '../src/renderers/electricalBtHtRiskAssessmentRenderer.js'
);
const { enrichElectricalBtHtRiskAssessmentWithAI } = await import(
  '../src/renderers/specializedRiskAiEnrichment.js'
);

const aliases = [
  'Analyse de risques — Installations électriques BT/HT',
  'Analyse de risques – Installations électriques BT/HT',
  'Analyse de risques - Installations électriques BT/HT',
  'Analyse de risques BT/HT',
  'Analyse de risques électrique',
  'Analyse de risques électricité',
  'Analyse de risques basse tension haute tension',
  'risk_assessment_electrical_bt_ht',
];

const formData = {
  companyName: 'SPGE',
  siteName: 'Site administratif de Verviers',
  siteContact: 'Sophie Martin',
  preventionAdvisor: 'Vincent Legrand',
  siteManager: 'Marc Delvaux',
  technicalServiceContact: 'Jean Peeters',
  analysisStage: 'Exploitation',
  installationType: 'mixte',
  additionalContext: `SCÉNARIO TEST SPGE
Site administratif de Verviers
Stade de l’analyse : Exploitation
Armoires basse tension : TGBT au local technique et tableaux divisionnaires par étage
Cabine haute tension : Pas de cabine haute tension connue sur site
Transformateur : Non connu / à vérifier
TGBT : Présent au local technique
Tableaux divisionnaires : par étage
PV RGIE : Non disponible, à obtenir
Contrôle périodique : Dernier rapport à obtenir
Liste BA4/BA5 : Non disponible
Procédure de consignation : À formaliser
Rapport de thermographie : Aucun rapport disponible
Remarques de contrôle ouvertes : Situation inconnue
Équipements raccordés : équipements de bureaux et multiprises
PERSONNES EXPOSÉES
- service technique
- entreprises extérieures
- personnel de nettoyage
- travailleurs proches des armoires
- visiteurs en cas d’accès non contrôlé
ZONES CONCERNÉES
- local technique
- bureaux comportant des multiprises
RISQUES IDENTIFIÉS
- accès non autorisé
- échauffement et incendie
MESURES EXISTANTES
- armoires fermées
POINTS À VÉRIFIER
- obturations, différentiels et repérage
MESURES À PRÉVOIR
- consignation et thermographie
Priorités : PV RGIE, accès, BA4/BA5, consignation et thermographie
Responsables : Service technique et conseiller en prévention
Délais : 1 à 3 mois
PREUVES À OBTENIR
- PV RGIE, liste BA4/BA5 et rapport de thermographie
Liens PAA / PGP : actions prioritaires
Liens DIU : schémas et plans de coupure
Liens PIU : coupure générale et contacts
Référence AR-2026-0042 — Page 1 / 1`,
};

const markdown = renderElectricalBtHtRiskAssessmentMarkdown(formData, 'fr');
assert.ok(markdown.length > 0);
assert.match(markdown, /Analyse de risques — Installations électriques BT\/HT/);
assert.match(markdown, /aide au conseiller en prévention/i);

for (const expected of [
  'SPGE', 'Site administratif de Verviers', 'Sophie Martin', 'Vincent Legrand',
  'Marc Delvaux', 'Jean Peeters', 'Exploitation', 'TGBT au local technique',
  'tableaux divisionnaires par étage', 'Service technique et conseiller en prévention', '1 à 3 mois',
  'basse tension', 'haute tension', 'BA4', 'BA5', 'RGIE', 'contact direct',
  'contact indirect', 'arc électrique', 'consignation', 'thermographie',
  'PAA', 'PGP', 'DIU', 'PIU',
]) {
  assert.match(markdown, new RegExp(expected, 'i'), expected);
}

assert.ok((markdown.match(/Page 1 \/ 1/g) || []).length <= 1);
assert.doesNotMatch(markdown, /SCÉNARIO TEST SPGE/i);
assert.doesNotMatch(markdown, /Référence AR-/i);
assert.doesNotMatch(markdown, /Page 1 \/ 1/i);
assert.ok((markdown.match(/\[à compléter\]/g) || []).length < 10);
assert.ok((markdown.match(/Instructions écrites existantes/g) || []).length <= 3);
assertNumberedSectionsHaveContent(markdown, [17, 18, 19, 20, 21, 22]);

const scenarioOnlyMarkdown = renderElectricalBtHtRiskAssessmentMarkdown({
  companyName: 'SPGE',
  additionalContext: formData.additionalContext,
}, 'fr');
for (const extracted of ['Site administratif de Verviers', 'TGBT au local technique', 'travailleurs proches des armoires', '1 à 3 mois']) {
  assert.match(scenarioOnlyMarkdown, new RegExp(extracted, 'i'), `Extraction scénario : ${extracted}`);
}

let aiRequest;
const enrichedMarkdown = await enrichElectricalBtHtRiskAssessmentWithAI({
  baseMarkdown: markdown,
  formData,
  language: 'fr',
  documentType: aliases[0],
  model: 'test-model',
  maxOutputTokens: 9000,
  openai: { responses: { create: async (request) => {
    aiRequest = request;
    return { output_text: `${markdown}\nRéférence AR-2026-0042 — Page 1 / 1\nPage 1 / 1` };
  } } },
});
assert.doesNotMatch(enrichedMarkdown, /Page 1 \/ 1/);
assert.doesNotMatch(enrichedMarkdown, /Référence AR-/);
assert.match(aiRequest.instructions, /rapports RGIE/);
assert.match(aiRequest.input[0].content[0].text, /Site administratif de Verviers/);
assert.doesNotMatch(aiRequest.input[0].content[0].text, /SCÉNARIO TEST SPGE/);
await assert.rejects(
  enrichElectricalBtHtRiskAssessmentWithAI({
    baseMarkdown: markdown,
    formData,
    language: 'fr',
    documentType: aliases[0],
    model: 'test-model',
    maxOutputTokens: 9000,
    openai: { responses: { create: async () => ({ output_text: `${markdown}\nSCÉNARIO TEST SPGE` }) } },
  }),
  /Scénario brut encore présent/,
);

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

function assertNumberedSectionsHaveContent(document, sectionNumbers) {
  for (const number of sectionNumbers) {
    const match = document.match(new RegExp(`^## ${number}\\.[^\\n]*\\n\\n([\\s\\S]*?)(?=^## \\d+\\.|$)`, 'm'));
    assert.ok(match?.[1]?.trim(), `La section ${number} ne doit pas être vide.`);
  }
}
