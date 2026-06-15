import assert from 'node:assert/strict';

process.env.PREVENTIA_BACKEND_NO_START = '1';

const {
  assertRiskAssessmentMarkdownIsValid,
  buildFallbackRiskItems,
  buildRiskAssessmentFixedSections,
  ensureCompleteRiskAssessmentData,
  finalizeRiskAssessmentMarkdown,
  renderRiskAssessmentFinalMarkdown,
  validateRiskAssessmentStructuredData,
} = await import('../server.js');

const documentType = 'Analyse de risques incendie et évacuation';
const language = 'fr';
const formData = {
  documentReference: 'AR-2026-0024',
  secteurActivite: 'Service technique communal',
  siteLieuTravail: 'Atelier central et dépôt',
  activitePoste: 'Stockage de solvants, recharge batteries et évacuation du personnel',
  produitsDangereux: 'Solvants inflammables, aérosols et batteries lithium-ion',
  machinesEquipements: 'Armoires de stockage, chargeurs et extincteurs',
  travailleursExposes: 'Agents techniques, visiteurs et intérimaires',
  accidentsIncidents: 'Départ de feu évité près de la zone de recharge',
  mesuresExistantes: 'Extincteurs, consignes affichées et éclairage de secours',
  presenceCppt: 'Oui',
  serviceInterneExterne: 'SIPPT et SEPPT',
  contraintesParticulieres: 'Issues parfois encombrées et stockage temporaire en couloir',
};

const completeSeedData = validateRiskAssessmentStructuredData({
  ...buildRiskAssessmentFixedSections(formData, documentType, language),
  ...buildFallbackRiskItems(formData, documentType, language),
}, language);

const brokenStructuredData = buildIntentionallyIncompleteFireRiskData(completeSeedData);
const structuredData = ensureCompleteRiskAssessmentData(
  brokenStructuredData,
  documentType,
  language,
  formData,
);

const markdown = renderRiskAssessmentFinalMarkdown(structuredData, language);
const duplicatedMarkdown = markdown.replace(
  /(Référence : AR-2026-0024\nDate : [^\n]+)/,
  '$1\nRéférence : AR-2026-0024\nDate : 15/06/2026',
);
const finalMarkdown = finalizeRiskAssessmentMarkdown(
  duplicatedMarkdown,
  language,
  structuredData.documentIdentification.reference,
);

assertRiskAssessmentMarkdownIsValid(finalMarkdown, language);

assert.equal(structuredData.mainRiskAssessment.initialAssessment.length, 8);
assert.equal(structuredData.mainRiskAssessment.measuresFollowUpValidation.length, 8);
assert.equal(structuredData.residualRiskAnalysis.length, 8);
assert.equal(structuredData.actionPriorities.length, 8);
assert.equal(structuredData.draftActionPlan.length, 8);
assert.equal(structuredData.photoPlan.photos.length, 8);
assert.equal(structuredData.hazardIdentification.length, 8);

structuredData.mainRiskAssessment.initialAssessment.forEach((row, index) => {
  assert.equal(row.number, String(index + 1));
  assertCompleteRow(row, `initialAssessment ${index + 1}`);
});
structuredData.mainRiskAssessment.measuresFollowUpValidation.forEach((row, index) => {
  assert.equal(row.number, String(index + 1));
  assertCompleteRow(row, `measuresFollowUpValidation ${index + 1}`);
});
structuredData.residualRiskAnalysis.forEach((row, index) => {
  assert.notEqual(row.mainRisk, String(index + 1));
  assertCompleteRow(row, `residualRiskAnalysis ${index + 1}`);
});
structuredData.actionPriorities.forEach((row, index) => {
  assert.notEqual(row.relatedRisk, String(index + 1));
  assertCompleteRow(row, `actionPriorities ${index + 1}`);
});
structuredData.draftActionPlan.forEach((row, index) => {
  assert.notEqual(row.relatedRisk, String(index + 1));
  assertCompleteRow(row, `draftActionPlan ${index + 1}`);
});

[
  '4. Glossaire des abréviations utilisées',
  '5. Périmètre de l’analyse',
  '9. Plan photos',
  '11. Méthode de cotation',
  '12.1 Évaluation initiale des risques',
  '12.2 Mesures, suivi et validation',
  '16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention',
  '17. Documents à créer ou à mettre à jour',
  '22. Conclusion',
  '23. Mention de validation',
].forEach((expected) => assert.match(finalMarkdown, new RegExp(escapeRegExp(expected))));

[
  /Document Reference:/,
  /Analyse de risques – Projet à valider/,
  /4\. Périmètre de l’analyse\n\n\|? ?Abréviation/,
  /9\. Tableau principal d’analyse des risques\n\n(?:Plan photos|\| Numéro photo)/,
  /11\. Priorités d’action\n\nScore =/,
  /16\. Annexes nécessaires\n\n.*\bPAA\b/s,
  /17\. Conclusion\n\n\|? ?Document \| Pourquoi/s,
].forEach((forbidden) => assert.doesNotMatch(finalMarkdown, forbidden));

assert.ok(
  finalMarkdown.startsWith(
    'Analyse de risques – Projet à adapter et à valider\nRéférence : AR-2026-0024\nDate : ',
  ),
  'L’en-tête final doit utiliser le titre et la référence principale.',
);
assert.equal(finalMarkdown.match(/\bAR-\d{4}-\d{4}\b/g)?.every((value) => value === 'AR-2026-0024'), true);
assert.equal(
  countMarkdownDataRows(getSection(finalMarkdown, '12.1 Évaluation initiale des risques', '12.2 Mesures, suivi et validation')),
  8,
  '12.1 doit contenir 8 lignes de risques.',
);
[
  'Inflammation de produits combustibles ou inflammables',
  'Échauffement, court-circuit, dégagement de gaz ou départ de feu',
  'Issue, couloir ou voie d’évacuation encombré',
  'Extincteur, dévidoir ou bouton d’alarme inaccessible',
  'Porte coupe-feu maintenue ouverte ou compartimentage non vérifié',
  'Méconnaissance des consignes ou du point de rassemblement',
  'Accès pompier encombré ou mal identifié',
  'Incompatibilités chimiques ou absence d’information sécurité',
].forEach((risk) => assert.match(
  getSection(finalMarkdown, '12.1 Évaluation initiale des risques', '12.2 Mesures, suivi et validation'),
  new RegExp(escapeRegExp(risk)),
));
assert.equal(
  countMarkdownDataRows(getSection(finalMarkdown, '12.2 Mesures, suivi et validation', '13. Analyse des risques résiduels')),
  8,
  '12.2 doit contenir 8 lignes de suivi.',
);
[
  'Vérifier compatibilité, ventilation, quantités stockées et séparation des produits',
  'Contrôler chargeurs, ventilation, éloignement combustibles et procédure incident batterie',
  'Dégager les voies, marquer les zones interdites au stockage et contrôler quotidiennement',
  'Rendre les équipements visibles et accessibles, ajouter marquage au sol si nécessaire',
  'Supprimer les cales, vérifier fermeture automatique et sensibiliser le personnel',
  'Renforcer accueil sécurité, briefing intérimaires et exercice évacuation',
  'Dégager accès, marquer zones interdites et informer chauffeurs/sous-traitants',
  'Centraliser FDS, vérifier étiquetage CLP et séparer incompatibilités',
].forEach((measure) => assert.match(
  getSection(finalMarkdown, '12.2 Mesures, suivi et validation', '13. Analyse des risques résiduels'),
  new RegExp(escapeRegExp(measure)),
));
assert.equal(
  countMarkdownDataRows(getSection(finalMarkdown, '13. Analyse des risques résiduels', '14. Priorités d’action')),
  8,
  '13 doit contenir 8 lignes résiduelles.',
);
assert.equal(
  countMarkdownDataRows(getSection(finalMarkdown, '14. Priorités d’action', '15. Projet de plan d’action')),
  8,
  '14 doit contenir 8 priorités.',
);
assert.equal(
  countMarkdownDataRows(getSection(finalMarkdown, '15. Projet de plan d’action', '16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention')),
  8,
  '15 doit contenir 8 actions.',
);
assert.doesNotMatch(finalMarkdown, /\|\s*Risque concerné\s*\|\s*À compléter\s*\|/);
assert.doesNotMatch(finalMarkdown, /\|\s*À compléter\s*\|\s*(?:SIPPT|Responsable|Maintenance|RH|Photo|Rapport)/);
assert.doesNotMatch(getSection(finalMarkdown, '12.1 Évaluation initiale des risques', '12.2 Mesures, suivi et validation'), /\|\s*2\s*\|\s*À compléter\s*\|/);
assert.doesNotMatch(getSection(finalMarkdown, '12.2 Mesures, suivi et validation', '13. Analyse des risques résiduels'), /\|\s*2\s*\|\s*À compléter\s*\|/);
assert.doesNotMatch(getSection(finalMarkdown, '14. Priorités d’action', '15. Projet de plan d’action'), /Risque concerné\s*\|\s*À compléter/);
assert.doesNotMatch(getSection(finalMarkdown, '15. Projet de plan d’action', '16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention'), /Risque concerné\s*\|\s*À compléter/);
assertNoDuplicateConsecutiveReferenceDate(finalMarkdown);
assert.ok(
  finalMarkdown.indexOf('12.1 Évaluation initiale des risques') <
    finalMarkdown.indexOf('12.2 Mesures, suivi et validation'),
  'Les sections 12.1 et 12.2 doivent rester séparées et ordonnées.',
);
assert.ok(
  (finalMarkdown.match(/À compléter/g) || []).length <= 20,
  'Le fallback incendie ne doit pas contenir plus de 20 occurrences de "À compléter".',
);
assert.ok(
  countOccurrences([
    getSection(finalMarkdown, '12.1 Évaluation initiale des risques', '13. Analyse des risques résiduels'),
    getSection(finalMarkdown, '14. Priorités d’action', '16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention'),
  ].join('\n'), 'À compléter') < 5,
  'Les sections 12, 14 et 15 ne doivent presque plus contenir "À compléter".',
);

console.info('Risk renderer test passed.');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildIntentionallyIncompleteFireRiskData(seedData) {
  const broken = structuredClone(seedData);
  const placeholderInitial = (number) => ({
    number: String(number),
    task: 'À compléter',
    hazard: 'À compléter',
    hazardousSituationOrScenario: 'À compléter',
    possibleRiskOrHarm: 'À compléter',
    exposed: 'À compléter',
    existingMeasures: 'À compléter',
    existingEvidence: 'À compléter',
    observedOrDeclaredElements: 'À compléter',
    elementsToConfirm: 'À compléter',
    severity: 'À compléter',
    probability: 'À compléter',
    exposure: 'À compléter',
    scoringJustification: 'À compléter',
    initialScore: 'À compléter',
    initialLevel: 'À compléter',
  });
  const placeholderFollowUp = (number) => ({
    number: String(number),
    additionalMeasure: 'À compléter',
    stopLevel: 'À compléter',
    responsible: 'À compléter',
    deadline: 'À compléter',
    residualScore: 'À compléter',
    residualLevel: 'À compléter',
    residualScoreJustification: 'À compléter',
    expectedEvidence: 'À compléter',
    photoToInsert: 'À compléter',
    annexToAttach: 'À compléter',
    priority: 'À compléter',
    blockingPoint: 'À compléter',
    externalAdvice: 'À compléter',
  });

  broken.mainRiskAssessment.initialAssessment = [
    seedData.mainRiskAssessment.initialAssessment[0],
    ...Array.from({ length: 7 }, (_unused, index) => placeholderInitial(index + 2)),
  ];
  broken.mainRiskAssessment.measuresFollowUpValidation = [
    seedData.mainRiskAssessment.measuresFollowUpValidation[0],
    ...Array.from({ length: 7 }, (_unused, index) => placeholderFollowUp(index + 2)),
  ];
  broken.actionPriorities = Array.from({ length: 8 }, (_unused, index) => ({
    action: index === 0 ? seedData.actionPriorities[0].action : 'À compléter',
    relatedRisk: 'À compléter',
    responsible: 'À compléter',
    deadline: 'À compléter',
    expectedEvidence: 'À compléter',
    blockingPoint: 'À compléter',
    externalAdvice: 'À compléter',
    actionType: 'À compléter',
  }));
  broken.draftActionPlan = Array.from({ length: 8 }, () => ({
    relatedRisk: 'À compléter',
    actionToPerform: 'À compléter',
    responsible: 'À compléter',
    deadline: 'À compléter',
    expectedEvidence: 'À compléter',
    photoAfterCorrection: 'À compléter',
    standardStatus: 'À compléter',
    paaOrPgpLink: 'À compléter',
    blockingPoint: 'À compléter',
    externalAdvice: 'À compléter',
  }));

  return broken;
}

function assertCompleteRow(row, label) {
  Object.entries(row).forEach(([key, value]) => {
    assert.notEqual(String(value || '').trim(), '', `${label}.${key} est vide`);
    assert.notEqual(String(value || '').trim(), 'À compléter', `${label}.${key} est incomplet`);
    assert.notEqual(String(value || '').trim(), 'À déterminer', `${label}.${key} est indéterminé`);
  });
}

function getSection(document, startTitle, endTitle) {
  const start = document.indexOf(startTitle);
  const end = document.indexOf(endTitle, start + startTitle.length);
  assert.notEqual(start, -1, `Section absente: ${startTitle}`);
  assert.notEqual(end, -1, `Section suivante absente: ${endTitle}`);
  return document.slice(start, end);
}

function countMarkdownDataRows(section) {
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .filter((line) => !/^\|\s*-+/.test(line.trim()))
    .slice(1)
    .length;
}

function assertNoDuplicateConsecutiveReferenceDate(document) {
  const lines = document.split('\n');

  for (let index = 0; index < lines.length - 3; index += 1) {
    const firstReference = lines[index].trim().match(/^Référence\s*:\s*(.+)$/);
    const firstDate = lines[index + 1].trim().match(/^Date\s*:\s*(.+)$/);
    const secondReference = lines[index + 2].trim().match(/^Référence\s*:\s*(.+)$/);
    const secondDate = lines[index + 3].trim().match(/^Date\s*:\s*(.+)$/);

    assert.ok(
      !(firstReference && firstDate && secondReference && secondDate &&
        firstReference[1] === secondReference[1] && firstDate[1] === secondDate[1]),
      'Le markdown final ne doit pas contenir deux blocs Référence/Date identiques consécutifs.',
    );
  }
}

function countOccurrences(value, search) {
  return (String(value).match(new RegExp(escapeRegExp(search), 'g')) || []).length;
}
