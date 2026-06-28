import { sanitizeGeneratedRiskMarkdown } from './riskMarkdownSanitizer.js';

const VALIDATION = 'Projet à adapter et à valider par le conseiller en prévention.';

const WORKSTATION_RISKS = [
  ['Travail écran accueil', 'posture écran prolongée', 'Utilisation prolongée de l’écran et du téléphone.', 'Fatigue visuelle, TMS, douleurs cervicales.', 'Adapter le poste écran et le siège.'],
  ['Accueil et téléphone', 'interruptions fréquentes et charge mentale', 'Interruptions répétées pendant l’encodage, les appels et l’accueil.', 'Erreurs, surcharge mentale, fatigue.', 'Organiser l’alternance des tâches en cas d’exposition prolongée écran/téléphone.'],
  ['Accueil public', 'accueil visiteurs difficiles ou agressivité verbale', 'Contact avec visiteurs mécontents ou situation conflictuelle.', 'Stress, incident verbal ou perte de maîtrise de la situation.', 'Formaliser la procédure d’accueil visiteurs difficiles.'],
  ['Déplacements internes', 'déplacements ponctuels dans le bâtiment', 'Déplacements vers salles, bureaux, courrier ou zones d’accueil.', 'Chute de plain-pied ou heurt.', 'Sécuriser les câbles et zones de passage.'],
  ['Courrier et colis', 'manutention légère du courrier ou de colis', 'Port ponctuel de courrier, dossiers ou petits colis.', 'Douleurs dorsales ou gestes contraignants.', 'Limiter ou organiser la manutention ponctuelle du courrier et des colis.'],
  ['Zone accueil', 'câbles ou trébuchement au poste accueil', 'Câbles, sacs, documents ou multiprises dans les zones de passage.', 'Trébuchement ou chute de plain-pied.', 'Sécuriser les câbles et zones de passage.'],
  ['Open space', 'bruit et concentration', 'Bruit ambiant, conversations et interruptions.', 'Fatigue, erreurs ou baisse de concentration.', 'Organiser l’alternance des tâches en cas d’exposition prolongée écran/téléphone.'],
  ['Données visibles', 'confidentialité des données affichées', 'Écran ou documents visibles par visiteurs ou tiers.', 'Atteinte à la confidentialité ou erreur de traitement.', 'Prévoir des consignes de confidentialité écran et documents.'],
  ['Évacuation', 'évacuation des visiteurs', 'Présence de visiteurs lors d’une alarme ou évacuation.', 'Retard d’évacuation ou absence de guidage.', 'Informer l’agent d’accueil sur les consignes d’évacuation visiteurs.'],
  ['Accueil isolé', 'travail isolé ponctuel à l’accueil', 'Présence seule en début ou fin de journée.', 'Difficulté à alerter en cas d’incident.', 'Prévoir un moyen d’alerte interne en cas d’incident à l’accueil.'],
];

export function renderWorkstationRiskAssessment({ formData = {}, reference = '', date = '', language = 'fr' } = {}) {
  if (language !== 'fr') {
    return sanitizeGeneratedRiskMarkdown('# Analyse de risques par poste de travail\n\n> Traduction à prévoir — version française générée.\n\n' +
      renderWorkstationRiskAssessment({ formData, reference, date, language: 'fr' }));
  }

  const context = buildContext(formData);
  const risks = includeCleaningProductRisk(formData)
    ? [...WORKSTATION_RISKS, ['Local nettoyage proche', 'exposition ponctuelle aux produits d’entretien', 'Passage ou proximité d’un local nettoyage mentionné.', 'Irritation ou exposition accidentelle limitée.', 'Vérifier la séparation et les consignes du local nettoyage.']]
    : WORKSTATION_RISKS;

  const markdown = [
    '# Analyse de risques par poste de travail – Agent d’accueil administratif',
    '',
    `> ${VALIDATION}`,
    '',
    '## 1. Identification du poste',
    table([
      ['Élément', 'Valeur'],
      ['Référence', clean(reference) || 'À attribuer'],
      ['Date', clean(date) || new Date().toISOString().slice(0, 10)],
      ['Entreprise', context.company],
      ['Site', context.site],
      ['Poste analysé', context.job],
      ['Service', context.service],
    ]),
    '',
    '## 2. Mission principale',
    'Assurer l’accueil administratif, l’orientation des visiteurs, la gestion des appels, le traitement courant du courrier et les tâches administratives associées.',
    '',
    '## 3. Tâches réelles du poste',
    bullets([
      'Accueil et orientation des visiteurs.',
      'Gestion du téléphone et des demandes entrantes.',
      'Encodage administratif sur écran.',
      'Traitement du courrier, documents et petits colis.',
      'Information des visiteurs en cas d’évacuation.',
    ]),
    '',
    '## 4. Équipements, outils et produits',
    table([
      ['Catégorie', 'Éléments'],
      ['Équipements et outils', 'Écran, clavier, souris, téléphone, logiciel d’accueil, bureau ou comptoir, chaise réglable'],
      ['Documents et flux', 'Courrier, dossiers, petits colis, badges ou registres visiteurs'],
      ['Produits', includeCleaningProductRisk(formData) ? 'Produits d’entretien à proximité à vérifier' : 'Aucun produit dangereux propre au poste, sauf mention explicite'],
    ]),
    '',
    '## 5. Personnes exposées',
    bullets([
      'Agent d’accueil administratif.',
      'Collègues proches de la zone accueil.',
      'Visiteurs présents dans la zone accueil.',
      'Personnel d’entretien ou intervenants ponctuels.',
    ]),
    '',
    '## 6. Méthode de cotation',
    'Cotation provisoire G x P x E. Gravité, probabilité et exposition sont cotées de 1 à 5. Les scores doivent être confirmés par observation terrain.',
    '',
    '## 7. Tableau principal d’analyse des risques',
    table([
      ['N°', 'Tâche', 'Danger', 'Scénario', 'Risque', 'G', 'P', 'E', 'Score', 'Niveau'],
      ...risks.map((risk, index) => [index + 1, ...risk.slice(0, 4), ...score(index)]),
    ]),
    '',
    '## 8. Mesures existantes',
    bullets([
      'Poste de travail administratif existant.',
      'Organisation locale de l’accueil à confirmer.',
      'Consignes internes et moyens d’alerte à vérifier.',
      'Équipements écran, téléphone et chaise à observer sur site.',
    ]),
    '',
    '## 9. Mesures complémentaires',
    table([
      ['N°', 'Action', 'Responsable', 'Délai', 'Preuve attendue'],
      ...requiredActions().map((action, index) => [index + 1, action, 'Ligne hiérarchique / conseiller en prévention', 'À planifier', evidenceFor(action)]),
    ]),
    '',
    '## 10. Plan d’action PAA/PGP',
    bullets(requiredActions()),
    '',
    '## 11. Preuves attendues',
    bullets([
      'Photos du poste accueil, des câbles, de l’écran et du siège.',
      'Check-list poste écran et observation terrain.',
      'Procédure visiteurs difficiles et consignes d’alerte.',
      'Preuve d’information sur les consignes d’évacuation visiteurs.',
      'Consignes de confidentialité écran et documents.',
      'Organisation du courrier, des colis et des alternances de tâches.',
    ]),
    '',
    '## 12. Points bloquants avant validation',
    table([
      ['Point bloquant', 'Responsable', 'Condition de levée'],
      ['Observation terrain non réalisée', 'Conseiller en prévention', 'Check-list ou rapport complété'],
      ['Moyen d’alerte interne non confirmé', 'Employeur / service technique', 'Test ou preuve de disponibilité'],
      ['Procédure visiteurs difficiles non formalisée', 'Employeur / ligne hiérarchique', 'Procédure diffusée'],
      ['Consignes évacuation visiteurs non confirmées', 'Responsable PIU', 'Consignes connues par l’accueil'],
    ]),
    '',
    '## 13. Conclusion',
    'Cette analyse de risques par poste de travail identifie les risques prioritaires du poste d’agent d’accueil administratif. Elle doit être validée par observation terrain, échange avec l’agent concerné et confirmation des procédures internes.',
  ].join('\n');

  return sanitizeGeneratedRiskMarkdown(markdown);
}

function requiredActions() {
  return [
    'Adapter le poste écran et le siège.',
    'Sécuriser les câbles et zones de passage.',
    'Formaliser la procédure d’accueil visiteurs difficiles.',
    'Informer l’agent d’accueil sur les consignes d’évacuation visiteurs.',
    'Organiser l’alternance des tâches en cas d’exposition prolongée écran/téléphone.',
    'Prévoir des consignes de confidentialité écran et documents.',
    'Limiter ou organiser la manutention ponctuelle du courrier et des colis.',
    'Vérifier l’éclairage et les reflets au poste accueil.',
    'Prévoir un moyen d’alerte interne en cas d’incident à l’accueil.',
    'Former ou informer l’agent sur les procédures internes.',
  ];
}

function buildContext(formData = {}) {
  return {
    company: clean(formData.companyName || formData.entreprise || 'À compléter'),
    site: clean(formData.siteName || formData.siteLieuTravail || formData.site || 'À compléter'),
    job: clean(formData.activitePoste || formData.poste || formData.activity || 'Agent d’accueil administratif'),
    service: clean(formData.secteurActivite || formData.service || formData.department || 'Administration'),
  };
}

function includeCleaningProductRisk(formData = {}) {
  const text = clean([
    formData.additionalContext,
    formData.informationsComplementaires,
    formData.produitsDangereux,
    formData.contraintesParticulieres,
  ].filter(Boolean).join(' ')).toLowerCase();
  return /local nettoyage|produits d.?entretien|nettoyage proche|proximite.*nettoyage/.test(text);
}

function score(index) {
  const scores = [
    ['3', '3', '4', '36', 'Élevé'],
    ['3', '3', '4', '36', 'Élevé'],
    ['3', '2', '3', '18', 'Moyen'],
    ['3', '2', '3', '18', 'Moyen'],
    ['3', '2', '2', '12', 'Moyen'],
    ['3', '2', '3', '18', 'Moyen'],
    ['2', '3', '4', '24', 'Moyen'],
    ['3', '2', '3', '18', 'Moyen'],
    ['4', '2', '3', '24', 'Moyen'],
    ['3', '2', '2', '12', 'Moyen'],
    ['3', '1', '2', '6', 'Faible'],
  ];
  return scores[index] || ['2', '2', '2', '8', 'Faible'];
}

function evidenceFor(action) {
  if (/câbles|zones de passage/i.test(action)) return 'Photos avant/après et contrôle visuel.';
  if (/visiteurs difficiles|alerte/i.test(action)) return 'Procédure ou test du moyen d’alerte.';
  if (/évacuation/i.test(action)) return 'Consignes d’évacuation visiteurs diffusées.';
  if (/confidentialité/i.test(action)) return 'Consignes validées et contrôle de visibilité écran.';
  if (/manutention|courrier|colis/i.test(action)) return 'Organisation courrier/colis et aide disponible.';
  return 'Preuve de réalisation ou check-list signée.';
}

function table(rows) {
  const cleaned = rows.map((row) => row.map((cell) => clean(cell).replace(/\|/g, '/')));
  return [
    `| ${cleaned[0].join(' | ')} |`,
    `| ${cleaned[0].map(() => '---').join(' | ')} |`,
    ...cleaned.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function bullets(items) {
  return [...new Set(items.map(clean))].map((item) => `- ${item}`).join('\n');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
