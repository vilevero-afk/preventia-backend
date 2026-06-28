import { sanitizeGeneratedRiskMarkdown } from './riskMarkdownSanitizer.js';

const VALIDATION = 'Projet à adapter et à valider par le conseiller en prévention.';

const ERGONOMICS_RISKS = [
  ['Travail écran', 'posture assise prolongée', 'Maintien prolongé en position assise sans alternance suffisante.', 'Fatigue, douleurs lombaires, cervicalgies ou TMS.', '3', '3', '4', '36', 'Élevé', 'Organiser des pauses ou alternances de tâches.'],
  ['Réglage écran', 'hauteur écran inadaptée', 'Écran trop bas, trop haut ou écran portable utilisé sans support.', 'Contraintes cervicales et fatigue visuelle.', '3', '3', '4', '36', 'Élevé', 'Adapter la hauteur des écrans.'],
  ['Assise', 'chaise mal réglée', 'Assise, dossier ou accoudoirs non réglés selon la morphologie.', 'Douleurs dos, épaules ou jambes.', '3', '3', '4', '36', 'Élevé', 'Vérifier le réglage des chaises.'],
  ['Saisie', 'clavier ou souris mal positionnés', 'Clavier ou souris éloignés, trop hauts ou non adaptés.', 'Douleurs poignets, avant-bras ou épaules.', '3', '3', '3', '27', 'Moyen', 'Fournir supports écran, clavier et souris adaptés.'],
  ['Éclairage', 'reflets ou éclairage inadapté', 'Reflets, contraste insuffisant ou éclairage non mesuré.', 'Fatigue visuelle, maux de tête et baisse de concentration.', '2', '3', '4', '24', 'Moyen', 'Corriger les reflets et mesurer l’éclairage.'],
  ['Circulation poste', 'câbles au sol ou encombrement', 'Câbles, multiprises ou objets dans les zones de passage.', 'Trébuchement ou chute de plain-pied.', '3', '2', '3', '18', 'Moyen', 'Sécuriser les câbles au poste accueil.'],
  ['Organisation', 'pauses insuffisantes', 'Absence d’alternance ou pauses insuffisantes lors du travail écran.', 'Fatigue, inconfort et baisse d’attention.', '2', '3', '4', '24', 'Moyen', 'Organiser des pauses ou alternances de tâches.'],
  ['Matériel écran', 'écran portable ou double écran mal utilisé', 'Portable sans support ou double écran placé de manière asymétrique.', 'Contraintes cervicales et fatigue visuelle.', '3', '2', '4', '24', 'Moyen', 'Adapter la hauteur des écrans.'],
  ['Accueil', 'poste accueil avec interruptions fréquentes', 'Téléphone, visiteurs et encodage simultanés.', 'Charge mentale, erreurs et tensions.', '3', '3', '4', '36', 'Élevé', 'Adapter le poste accueil.'],
  ['Télétravail', 'télétravail partiel non vérifié', 'Poste à domicile non observé ou matériel non confirmé.', 'Contraintes posturales hors site.', '3', '2', '3', '18', 'Moyen', 'Vérifier les postes en télétravail.'],
  ['Courrier', 'manutention ponctuelle de dossiers ou colis', 'Port ponctuel de boîtes, dossiers ou petits colis.', 'Douleurs dorsales ou gestes contraignants.', '3', '2', '2', '12', 'Moyen', 'Limiter la manutention ponctuelle ou fournir une aide adaptée.'],
  ['Open space', 'bruit en open space et concentration', 'Bruit ambiant et interruptions dans les zones partagées.', 'Fatigue, erreurs ou baisse de concentration.', '2', '3', '4', '24', 'Moyen', 'Planifier une observation ergonomique des postes.'],
];

export function renderErgonomicsRiskAssessment({ formData = {}, reference = '', date = '', language = 'fr' } = {}) {
  if (language !== 'fr') {
    return sanitizeGeneratedRiskMarkdown('# Analyse de risques ergonomie\n\n> Traduction à prévoir — version française générée.\n\n' +
      renderErgonomicsRiskAssessment({ formData, reference, date, language: 'fr' }));
  }

  const context = buildContext(formData);
  const markdown = [
    '# Analyse de risques ergonomie – Travail administratif sur écran',
    '',
    `> ${VALIDATION}`,
    '',
    '## 1. Identification',
    table([
      ['Élément', 'Valeur'],
      ['Référence', clean(reference) || 'À attribuer'],
      ['Date', clean(date) || new Date().toISOString().slice(0, 10)],
      ['Entreprise', context.company],
      ['Site', context.site],
      ['Activité', context.activity],
      ['Statut', 'Projet à valider'],
    ]),
    '',
    '## 2. Contexte',
    'Cette analyse vise les postes administratifs sur écran, l’accueil, le télétravail partiel, les zones de circulation autour des postes et la manutention ponctuelle de dossiers ou colis.',
    '',
    '## 3. Périmètre',
    'Sont inclus : postes fixes, double écran, ordinateurs portables, chaises, clavier, souris, éclairage, reflets, câbles, pauses, accueil et télétravail partiel.',
    '',
    '## 4. Postes et travailleurs exposés',
    table([
      ['Poste ou activité', 'Travailleurs exposés', 'Éléments à observer'],
      ['Travail administratif sur écran', context.exposed, 'Écran, chaise, clavier, souris, posture et pauses'],
      ['Accueil administratif', 'Agents d’accueil et visiteurs proches', 'Interruptions, câbles, éclairage et contraintes répétées'],
      ['Télétravail partiel', 'Travailleurs en télétravail', 'Matériel, support écran, chaise et clavier/souris'],
    ]),
    '',
    '## 5. Méthode de cotation',
    'Cotation provisoire G x P x E. Gravité, probabilité et exposition sont cotées de 1 à 5. Les scores doivent être confirmés par observation terrain.',
    '',
    '## 6. Tableau principal d’analyse des risques',
    table([
      ['N°', 'Tâche', 'Danger ergonomique', 'Scénario', 'Dommage possible', 'G', 'P', 'E', 'Score', 'Niveau'],
      ...ERGONOMICS_RISKS.map((risk, index) => [index + 1, ...risk.slice(0, 9)]),
    ]),
    '',
    '## 7. Mesures complémentaires',
    table([
      ['N°', 'Action', 'Responsable', 'Délai', 'Preuve attendue'],
      ...requiredActions().map((action, index) => [index + 1, action, 'Ligne hiérarchique / conseiller en prévention', 'À planifier', evidenceFor(action)]),
    ]),
    '',
    '## 8. Plan d’action',
    bullets(requiredActions()),
    '',
    '## 9. Preuves attendues',
    bullets([
      'Photos des postes avant/après réglage.',
      'Check-list poste écran complétée.',
      'Mesure ou constat documenté de l’éclairage et des reflets.',
      'Preuve de fourniture des supports écran, clavier ou souris.',
      'Liste de présence ou preuve d’information aux réglages du poste écran.',
      'Auto-questionnaire ou vérification documentée des postes en télétravail.',
    ]),
    '',
    '## 10. Points à valider',
    bullets([
      'Confirmer les réglages réels par observation ergonomique.',
      'Vérifier les besoins matériel par poste.',
      'Consulter les travailleurs concernés.',
      'Confirmer les situations de télétravail partiel.',
      'Définir les priorités avec l’employeur et le conseiller en prévention.',
    ]),
    '',
    '## 11. Conclusion',
    'Les risques prioritaires concernent la posture assise prolongée, la hauteur écran, le réglage des chaises, les reflets, l’organisation des pauses, le poste accueil et le télétravail partiel. Le document doit être validé après observation ergonomique des postes.',
  ].join('\n');

  return sanitizeGeneratedRiskMarkdown(markdown);
}

function requiredActions() {
  return [
    'Adapter la hauteur des écrans.',
    'Vérifier le réglage des chaises.',
    'Corriger les reflets et mesurer l’éclairage.',
    'Sécuriser les câbles au poste accueil.',
    'Adapter le poste accueil.',
    'Organiser des pauses ou alternances de tâches.',
    'Vérifier les postes en télétravail.',
    'Fournir supports écran, clavier et souris adaptés.',
    'Former le personnel aux réglages du poste écran.',
    'Limiter la manutention ponctuelle ou fournir une aide adaptée.',
    'Planifier une observation ergonomique des postes.',
  ];
}

function buildContext(formData = {}) {
  return {
    company: clean(formData.companyName || formData.entreprise || 'À compléter'),
    site: clean(formData.siteName || formData.siteLieuTravail || formData.site || 'À compléter'),
    activity: clean(formData.activitePoste || formData.activity || 'Travail administratif sur écran'),
    exposed: clean(formData.travailleursExposes || formData.exposedWorkers || 'Travailleurs administratifs concernés'),
  };
}

function evidenceFor(action) {
  if (/écran|clavier|souris/i.test(action)) return 'Photos du poste et preuve du matériel adapté.';
  if (/chaise/i.test(action)) return 'Check-list de réglage de chaise.';
  if (/reflets|éclairage/i.test(action)) return 'Mesure d’éclairement ou constat documenté.';
  if (/télétravail/i.test(action)) return 'Auto-questionnaire ou vérification documentée.';
  if (/former/i.test(action)) return 'Support d’information et preuve de diffusion.';
  return 'Preuve de réalisation à conserver.';
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
  return items.map((item) => `- ${clean(item)}`).join('\n');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
