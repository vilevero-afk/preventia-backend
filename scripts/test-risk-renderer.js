import assert from 'node:assert/strict';

process.env.PREVENTIA_BACKEND_NO_START = '1';

const {
  assertRiskAssessmentMarkdownIsValid,
  buildFallbackRiskItems,
  buildRiskAssessmentFixedSections,
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

const structuredData = validateRiskAssessmentStructuredData({
  ...buildRiskAssessmentFixedSections(formData, documentType, language),
  ...buildFallbackRiskItems(formData, documentType, language),
}, language);

const markdown = renderRiskAssessmentFinalMarkdown(structuredData, language);
const finalMarkdown = finalizeRiskAssessmentMarkdown(
  markdown,
  language,
  structuredData.documentIdentification.reference,
);

assertRiskAssessmentMarkdownIsValid(finalMarkdown, language);

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

console.info('Risk renderer test passed.');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
