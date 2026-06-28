import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app, isRiskAnalysisDocument } = await import('../server.js');
const { renderElevatorRiskAssessmentMarkdown } = await import(
  '../src/renderers/elevatorRiskAssessmentRenderer.js'
);
const { enrichElevatorRiskAssessmentWithAI } = await import(
  '../src/renderers/specializedRiskAiEnrichment.js'
);

const aliases = [
  'Analyse de risques — Ascenseur',
  'Analyse de risques – Ascenseur',
  'Analyse de risques - Ascenseur',
  'Analyse de risques ascenseur',
  'Analyse ascenseur',
  'Ascenseur',
  'risk_assessment_elevator',
  'elevator_risk_assessment',
];

const formData = {
  companyName: 'SPGE',
  siteName: 'Site administratif de Verviers',
  siteContact: 'Sophie Martin',
  preventionAdvisor: 'Vincent Legrand',
  siteManager: 'Marc Delvaux',
  technicalServiceContact: 'Jean Peeters',
  historicalValue: 'inconnue',
  additionalContext: `SCÉNARIO TEST SPGE ASCENSEUR
Site administratif de Verviers
Propriétaire : SPGE
Gestionnaire : Marc Delvaux
SECT : Organisme à confirmer
Entreprise de maintenance : Lift Service
Localisation de l’ascenseur : aile administrative, près de l’accueil
Marque : Marque test
Numéro de fabrication : ASC-0042
Année de construction : 2002
Mise en service : 2003
Type d’ascenseur : hydraulique
Charge nominale : 630 kg
Capacité : 8 personnes
Vitesse : 1 m/s
Nombre d’arrêts : 4
Environnement : bureaux administratifs
Intensité d’utilisation : normale
Utilisateurs vulnérables : PMR et visiteurs
Rapport SECT : Non disponible, à obtenir
Dernier contrôle périodique : Non disponible, à obtenir
Attestation de régularisation : À vérifier
Remarques SECT ouvertes : Inconnues
Travaux de modernisation : À documenter
Travaux ouverts : Inconnus
PERSONNES EXPOSÉES
- travailleurs
- visiteurs
- PMR
- personnel de maintenance
RISQUES IDENTIFIÉS
- communication bidirectionnelle non testée
- éclairage secours à vérifier
- précision d’arrêt à contrôler
MESURES EXISTANTES
- contrat de maintenance annoncé
POINTS À VÉRIFIER
- cuvette, salle machines, portes palières et communication
MESURES À PRÉVOIR
- tests communication et éclairage secours
Responsables : Service technique et conseiller en prévention
Délais : 1 à 3 mois
PREUVES À OBTENIR
- rapport SECT, contrôle périodique et contrat de maintenance
Référence AR-2026-0042 — Page 1 / 1`,
};

const markdown = renderElevatorRiskAssessmentMarkdown(formData, 'fr');
assert.ok(markdown.length > 0);
assert.match(markdown, /Analyse de risques — Ascenseur/);
assert.match(markdown, /aide au conseiller en prévention/i);

for (const expected of [
  'SPGE', 'Site administratif de Verviers', 'Sophie Martin', 'Vincent Legrand',
  'Marc Delvaux', 'Jean Peeters', 'ASC-0042', 'Lift Service',
  'Service technique et conseiller en prévention', '1 à 3 mois',
  'SECT', 'AR du 9 mars 2003', 'gravité x probabilité x exposition',
  'porte cabine', 'portes palières', 'communication bidirectionnelle',
  'éclairage secours', 'cuvette', 'salle machines', 'parachute',
  'limiteur de vitesse', 'PAA', 'PGP', 'DIU', 'PIU',
]) {
  assert.match(markdown, new RegExp(expected, 'i'), expected);
}

assert.ok((markdown.match(/Page 1 \/ 1/g) || []).length <= 1);
assert.doesNotMatch(markdown, /SCÉNARIO TEST SPGE/i);
assert.doesNotMatch(markdown, /Référence AR-/i);
assert.doesNotMatch(markdown, /Page 1 \/ 1/i);
assert.ok((markdown.match(/\[à compléter\]/g) || []).length < 10);
assertNumberedSectionsHaveContent(markdown, [18, 19, 20, 21, 22, 23]);

const scenarioOnlyMarkdown = renderElevatorRiskAssessmentMarkdown({
  companyName: 'SPGE',
  additionalContext: formData.additionalContext,
}, 'fr');
for (const extracted of ['Site administratif de Verviers', 'ASC-0042', 'communication bidirectionnelle non testée', '1 à 3 mois']) {
  assert.match(scenarioOnlyMarkdown, new RegExp(extracted, 'i'), `Extraction scénario : ${extracted}`);
}

let aiRequest;
const enrichedMarkdown = await enrichElevatorRiskAssessmentWithAI({
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
assert.match(aiRequest.instructions, /rapport du SECT/);
assert.match(aiRequest.input[0].content[0].text, /Site administratif de Verviers/);
assert.doesNotMatch(aiRequest.input[0].content[0].text, /SCÉNARIO TEST SPGE/);
await assert.rejects(
  enrichElevatorRiskAssessmentWithAI({
    baseMarkdown: markdown,
    formData,
    language: 'fr',
    documentType: aliases[0],
    model: 'test-model',
    maxOutputTokens: 9000,
    openai: { responses: { create: async () => ({ output_text: `${markdown}\nSCÉNARIO TEST SPGE ASCENSEUR` }) } },
  }),
  /Scénario brut encore présent/,
);

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

function assertNumberedSectionsHaveContent(document, sectionNumbers) {
  for (const number of sectionNumbers) {
    const match = document.match(new RegExp(`^## ${number}\\.[^\\n]*\\n\\n([\\s\\S]*?)(?=^## \\d+\\.|$)`, 'm'));
    assert.ok(match?.[1]?.trim(), `La section ${number} ne doit pas être vide.`);
  }
}
