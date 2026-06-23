const COMPLETE = '[à compléter]';
const VERIFY = '[à vérifier sur site]';
const NOT_APPLICABLE = '[non applicable à confirmer]';
const VALIDATE = '[validation requise]';
const IMPORT = '[à compléter / à importer]';

const CHAPTER_TITLES = [
  'Coordonnées du bâtiment',
  'Approbation du plan',
  'Coordonnées des personnes ressources',
  'Informations générales',
  'Responsables spécifiques et leur suppléant',
  'L’annonce aux services de secours',
  'Déclenchement du plan en interne',
  'Procédure d’évacuation',
  'Évacuation des personnes à mobilité réduite',
  'Lieux de rassemblement',
  'Recensement des personnes présentes',
  'Accès pour les secours et leur accueil',
  'Rôle des personnes ressources',
  'Organisation des exercices',
  'Locaux disponibles',
  'Procédures en cas d’incendie',
  'Consignes et recommandations spécifiques',
  'Dossier pour les pompiers',
  'Plans',
  'Dispositions concernant la mise à l’abri',
  'Dispositions concernant la prise d’iode',
  'Dispositions concernant l’évacuation du secteur/quartier',
  'Procédures d’information et de formation',
  'Dispositions générales',
  'Problèmes rencontrés',
  'Consignes de fin d’incident',
  'Attestation de réception des consignes de sécurité',
  'Signatures',
];

const REFLEX_SHEETS = [
  ['00', 'Nomenclature des fiches', ['Identifier le scénario.', 'Sélectionner la fiche applicable.', 'Désigner le responsable.', 'Tracer la décision.']],
  ['01', 'Consignes en cas d’incendie', ['Déclencher l’alarme.', 'Appeler le 112.', 'Évacuer sans s’exposer.', 'Accueillir les secours.']],
  ['02', 'Alerte SEVESO / incident extérieur nécessitant mise à l’abri', ['Déclencher la mise à l’abri.', 'Fermer les ouvertures.', 'Arrêter la ventilation si prévu.', 'Suivre les autorités.']],
  ['03', 'Alerte à la bombe / colis suspect', ['Ne rien toucher.', 'Éloigner les personnes.', 'Appeler le 112.', 'Noter les informations utiles.']],
  ['04', 'Menaces biologiques ou chimiques', ['Isoler la zone.', 'Éviter tout contact.', 'Appeler le 112.', 'Attendre les spécialistes.']],
  ['05', 'Déversement accidentel de substances dangereuses', ['Interdire l’accès.', 'Identifier le produit sans exposition.', 'Consulter la FDS.', 'Alerter les secours si nécessaire.']],
  ['06', 'Inondation', ['Éloigner les personnes.', 'Éviter tout contact électrique.', 'Couper les énergies si sûr.', 'Suivre les autorités.']],
  ['07', 'Tempête / orage', ['Suspendre les activités extérieures.', 'S’éloigner des vitrages.', 'Mettre les personnes à l’abri.', 'Suivre les alertes.']],
  ['08', 'Accident de transport de matières dangereuses', ['Rester à distance.', 'Appeler le 112.', 'Se mettre à l’abri.', 'Ne pas approcher le véhicule.']],
  ['09', 'Séisme', ['Se protéger des chutes.', 'S’éloigner des vitrages.', 'Évacuer après les secousses si requis.', 'Signaler les dommages.']],
  ['10', 'Fuite de gaz à l’intérieur du bâtiment', ['Éviter toute étincelle.', 'Évacuer la zone.', 'Appeler le 112 depuis une zone sûre.', 'Couper le gaz uniquement si prévu.']],
  ['11', 'Accident corporel ou malaise', ['Protéger la zone.', 'Appeler le 112.', 'Alerter un secouriste.', 'Ne pas déplacer la victime sans nécessité.']],
  ['12', 'Fuite de chlore à la piscine', ['Évacuer la zone exposée.', 'Éviter toute inhalation.', 'Appeler le 112.', 'Consulter la FDS.']],
  ['13', 'Intoxication alimentaire', ['Alerter la direction.', 'Appeler les secours si nécessaire.', 'Identifier les personnes concernées.', 'Conserver les éléments utiles.']],
  ['14', 'Pandémie / épidémie', ['Appliquer les consignes sanitaires.', 'Limiter les contacts.', 'Informer les responsables.', 'Renforcer l’hygiène.']],
  ['15', 'Coupure de courant / délestage', ['Sécuriser les activités.', 'Vérifier l’éclairage de secours.', 'Contrôler les équipements critiques.', 'Informer le service technique.']],
  ['16', 'Menace terroriste', ['Appeler le 112 si possible.', 'S’échapper si la voie est sûre.', 'Se cacher si nécessaire.', 'Respecter les consignes de police.']],
  ['17', 'Intrusion dangereuse / AMOK', ['Alerter discrètement le 112.', 'S’échapper si possible.', 'Se confiner si nécessaire.', 'Ne pas confronter l’auteur.']],
  ['18', 'Prise d’otages', ['Ne pas provoquer l’auteur.', 'Alerter le 112 si possible.', 'Observer sans s’exposer.', 'Suivre les consignes de police.']],
  ['19', 'Fermeture inopinée de l’établissement', ['Suspendre les accès.', 'Informer les personnes présentes.', 'Sécuriser les activités critiques.', 'Activer la chaîne de décision.']],
  ['20', 'Accident / évènement grave survenu à un membre du personnel à l’extérieur', ['Contacter les secours locaux.', 'Alerter la direction.', 'Confirmer les faits.', 'Préserver la confidentialité.']],
  ['21', 'Agression sur le lieu ou le chemin du travail', ['Se mettre en sécurité.', 'Appeler le 112.', 'Assister sans s’exposer.', 'Préserver les éléments utiles.']],
  ['22', 'Gale ou maladie contagieuse spécifique', ['Appliquer les consignes sanitaires.', 'Limiter les contacts.', 'Informer les responsables.', 'Tracer les mesures prises.']],
];

export function renderInternalEmergencyPlanMarkdown(formData = {}, language = 'fr') {
  const data = normalizeFormData(formData);
  const translationNotice = normalizeLanguage(language) === 'fr'
    ? ''
    : '> Traduction à prévoir — version française générée.';

  return [
    '# Plan Interne d’Urgence',
    '',
    '## Modèle opérationnel à compléter',
    '',
    markdownTable([
      ['Élément', 'Valeur'],
      ['Dénomination', firstKnown(data.siteName, data.buildingName)],
      ['Type de document', 'Plan Interne d’Urgence – document opérationnel'],
      ['Rédigé par', data.preventionAdvisor],
      ['Version', COMPLETE],
      ['Statut', 'Document de travail à compléter et valider'],
      ['Base de travail', 'Modèle PreventIA – PIU opérationnel'],
    ]),
    '',
    translationNotice,
    translationNotice ? '' : null,
    '> Les champs signalés [à compléter] doivent être vérifiés sur site avant diffusion. Les éléments techniques, les plans, les contacts et les validations doivent être confirmés par les personnes compétentes.',
    '',
    tableOfContents(),
    '',
    ...buildChapters(data),
  ].filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function buildChapters(data) {
  const address = joinAddress(data);
  const chapters = [
    chapter(1, tables([
      [['Élément', 'Information'], ['Entreprise', data.companyName], ['Dénomination du bâtiment', firstKnown(data.siteName, data.buildingName)], ['Adresse complète', address], ['Téléphone', COMPLETE], ['Coordonnées GPS', VERIFY], ['Accès principal', VERIFY]],
    ]), checklist(['Confirmer la dénomination.', 'Vérifier l’adresse depuis la voie publique.', 'Identifier l’accès principal.'])),

    chapter(2, tables([
      [['Étape', 'Nom', 'Date', 'Statut'], ['Rédaction', data.preventionAdvisor, COMPLETE, VALIDATE], ['Vérification sur site', COMPLETE, COMPLETE, VALIDATE], ['Approbation employeur', COMPLETE, COMPLETE, VALIDATE], ['Révision prévue', COMPLETE, COMPLETE, VALIDATE]],
    ])),

    chapter(3, tables([
      [['Fonction', 'Titulaire', 'Téléphone', 'Disponibilité'], ['Responsable du bâtiment', data.siteManager, COMPLETE, VERIFY], ['Conseiller en prévention', data.preventionAdvisor, COMPLETE, VERIFY], ['Service technique', data.technicalServiceContact, COMPLETE, VERIFY], ['Responsable évacuation', data.emergencyManager, COMPLETE, VERIFY], ['Accueil', COMPLETE, COMPLETE, VERIFY], ['Secouristes', COMPLETE, COMPLETE, VERIFY]],
    ])),

    chapter(4, tables([
      [['Élément', 'Information'], ['Activité du site', COMPLETE], ['Effectif maximal', COMPLETE], ['Horaires', COMPLETE], ['Visiteurs', COMPLETE], ['Entreprises extérieures', COMPLETE], ['Risques particuliers', VERIFY], ['Accessibilité PMR', VERIFY]],
    ])),

    chapter(5, tables([
      [['Mission', 'Titulaire', 'Suppléant', 'Validation'], ['Coordination du PIU', data.emergencyManager, COMPLETE, VALIDATE], ['Évacuation', data.emergencyManager, COMPLETE, VALIDATE], ['Appel au 112', COMPLETE, COMPLETE, VALIDATE], ['Recensement', COMPLETE, COMPLETE, VALIDATE], ['Accueil des secours', COMPLETE, COMPLETE, VALIDATE], ['Coupures techniques', data.technicalServiceContact, COMPLETE, VALIDATE]],
    ])),

    chapter(6, tables([
      [['Information à transmettre au 112', 'Valeur'], ['Adresse exacte', address], ['Type d’incident', COMPLETE], ['Zone concernée', COMPLETE], ['Victimes', COMPLETE], ['Risques particuliers', VERIFY], ['Accès conseillé', VERIFY], ['Nom de l’appelant', COMPLETE]],
    ]), checklist(['Appeler le 112.', 'Parler clairement.', 'Ne pas raccrocher sans autorisation.', 'Envoyer une personne à l’accès secours.'])),

    chapter(7, tables([
      [['Étape', 'Moyen', 'Responsable'], ['Détection', VERIFY, COMPLETE], ['Confirmation sans exposition', VERIFY, COMPLETE], ['Alerte interne', data.fireAlarmSystem, data.emergencyManager], ['Activation du PIU', COMPLETE, data.emergencyManager], ['Traçabilité de l’heure', COMPLETE, COMPLETE]],
    ])),

    chapter(8, checklist(['Déclencher l’alarme.', 'Utiliser les sorties sûres.', 'Fermer les portes sans verrouiller.', 'Ne pas utiliser les ascenseurs.', 'Rejoindre le lieu de rassemblement.', 'Attendre l’autorisation de retour.']), tables([
      [['Point à vérifier', 'Statut'], ['Audibilité de l’alarme', VERIFY], ['Cheminements', VERIFY], ['Issues de secours', VERIFY], ['Éclairage de sécurité', VERIFY]],
    ])),

    chapter(9, tables([
      [['Élément', 'Disposition'], ['Procédure PMR', data.pmrProcedure], ['Personnes concernées', COMPLETE], ['Aidants désignés', COMPLETE], ['Zone d’attente sûre', VERIFY], ['Moyen de communication', VERIFY], ['Solution alternative', NOT_APPLICABLE]],
    ]), checklist(['Associer les personnes concernées.', 'Tester la procédure sans mise en danger.', 'Informer les secours de toute personne en attente.'])),

    chapter(10, tables([
      [['Élément', 'Lieu principal', 'Lieu alternatif'], ['Adresse ou repère', data.assemblyPoint, COMPLETE], ['Capacité', VERIFY, VERIFY], ['Signalisation', VERIFY, VERIFY], ['Accessibilité PMR', VERIFY, VERIFY], ['Distance des risques', VERIFY, VERIFY]],
    ])),

    chapter(11, tables([
      [['Population', 'Source de comptage', 'Responsable', 'Résultat'], ['Travailleurs', COMPLETE, COMPLETE, COMPLETE], ['Visiteurs', COMPLETE, COMPLETE, COMPLETE], ['Entreprises extérieures', COMPLETE, COMPLETE, COMPLETE], ['Personnes manquantes', 'Informer les secours.', data.emergencyManager, COMPLETE]],
    ])),

    chapter(12, tables([
      [['Élément', 'Information'], ['Accès véhicules de secours', VERIFY], ['Point d’accueil', COMPLETE], ['Responsable accueil', COMPLETE], ['Clés ou badges', VERIFY], ['Obstacles et gabarit', VERIFY], ['Itinéraire vers le sinistre', VERIFY], ['Accès hors horaires', VERIFY]],
    ])),

    chapter(13, tables([
      [['Rôle', 'Action opérationnelle'], ['Responsable PIU', 'Décider et coordonner.'], ['Suppléant', 'Remplacer le responsable.'], ['Guide', 'Conduire vers une sortie sûre.'], ['Serre-file', 'Vérifier la zone sans s’exposer.'], ['Responsable recensement', 'Comparer les listes.'], ['Accueil secours', 'Guider les intervenants.'], ['Service technique', 'Réaliser uniquement les coupures prévues.']],
    ])),

    chapter(14, tables([
      [['Élément', 'Valeur'], ['Fréquence', COMPLETE], ['Prochain exercice', COMPLETE], ['Scénario', COMPLETE], ['Participants', COMPLETE], ['Observateurs', COMPLETE], ['Compte rendu', COMPLETE], ['Actions correctives', COMPLETE]],
    ]), checklist(['Informer les acteurs utiles.', 'Tester une situation réaliste.', 'Recueillir les écarts.', 'Attribuer les actions.'])),

    chapter(15, tables([
      [['Local', 'Emplacement', 'Équipement', 'Disponibilité'], ['Poste de coordination', COMPLETE, COMPLETE, VERIFY], ['Local premiers soins', COMPLETE, COMPLETE, VERIFY], ['Accueil des proches', COMPLETE, COMPLETE, NOT_APPLICABLE], ['Local autorités', COMPLETE, COMPLETE, NOT_APPLICABLE]],
    ])),

    chapter(16, field('Informations issues des analyses de risques incendie', IMPORT), tables([
      [['Moyen ou action', 'Information'], ['Centrale incendie / alarme', data.fireAlarmSystem], ['Détection', VERIFY], ['Extincteurs', VERIFY], ['Désenfumage', VERIFY], ['Coupure gaz', data.gasShutoff], ['Coupure électricité', data.electricityShutoff], ['Coupure eau', data.waterShutoff], ['Coupure ventilation', data.ventilationShutoff]],
    ]), checklist(['Donner l’alarme.', 'Appeler le 112.', 'Évacuer.', 'Fermer les portes.', 'Ne combattre un départ de feu que sans danger.', 'Accueillir les pompiers.'])),

    reflexChapter(data),

    chapter(18, field('Éléments issus des analyses de risques', IMPORT), tables([
      [['Élément du dossier', 'Information ou statut'], ['Emplacement du dossier', data.firefighterFileLocation], ['Coordonnées du bâtiment', address], ['Liste des contacts', COMPLETE], ['Plans disponibles', data.availablePlans], ['Plans des coupures', VERIFY], ['Risques particuliers', VERIFY], ['Clés et badges', VERIFY], ['Date de mise à jour', COMPLETE]],
    ])),

    chapter(19, tables([
      [['Plan', 'Disponible', 'Date', 'Vérifié sur site'], ['Plan de situation', data.availablePlans, COMPLETE, VERIFY], ['Plan d’accès secours', VERIFY, COMPLETE, VERIFY], ['Plans d’évacuation', VERIFY, COMPLETE, VERIFY], ['Plan des moyens incendie', VERIFY, COMPLETE, VERIFY], ['Plan des coupures', VERIFY, COMPLETE, VERIFY], ['Plan des zones à risques', NOT_APPLICABLE, COMPLETE, VERIFY]],
    ])),

    chapter(20, field('Mise à l’abri', 'Procédure opérationnelle à compléter.'), field('Éléments issus des analyses de risques', IMPORT), tables([
      [['Élément', 'Disposition'], ['Signal de mise à l’abri', VERIFY], ['Locaux désignés', COMPLETE], ['Capacité', VERIFY], ['Fermeture des ouvertures', VERIFY], ['Coupure ventilation', data.ventilationShutoff], ['Communication avec les autorités', VERIFY]],
    ]), checklist(['Déclencher le signal prévu.', 'Rejoindre le local désigné.', 'Fermer portes et fenêtres.', 'Arrêter la ventilation si prévu.', 'Attendre la fin d’alerte officielle.'])),

    chapter(21, field('Prise d’iode', 'Uniquement sur instruction officielle.'), tables([
      [['Élément', 'Disposition'], ['Applicabilité', NOT_APPLICABLE], ['Stock', COMPLETE], ['Lieu de stockage', COMPLETE], ['Responsable', COMPLETE], ['Contrôle des dates', VERIFY], ['Distribution', 'Uniquement sur ordre des autorités.']],
    ])),

    chapter(22, tables([
      [['Élément', 'Disposition'], ['Ordre d’évacuation externe', 'Attendre les autorités.'], ['Destination', COMPLETE], ['Itinéraire', VERIFY], ['Transport', COMPLETE], ['Assistance PMR', COMPLETE], ['Listes de présence', COMPLETE], ['Contact à destination', COMPLETE]],
    ])),

    chapter(23, tables([
      [['Public', 'Information ou formation', 'Fréquence', 'Preuve'], ['Nouveaux travailleurs', COMPLETE, COMPLETE, COMPLETE], ['Personnes ressources', COMPLETE, COMPLETE, COMPLETE], ['Service technique', COMPLETE, COMPLETE, COMPLETE], ['Entreprises extérieures', COMPLETE, COMPLETE, COMPLETE], ['Visiteurs', COMPLETE, COMPLETE, COMPLETE]],
    ])),

    chapter(24, checklist(['Conserver une version accessible du PIU.', 'Protéger les données personnelles.', 'Réviser après tout changement important.', 'Réviser après un incident ou exercice.', 'Diffuser uniquement la version validée.']), tables([
      [['Gestion documentaire', 'Valeur'], ['Emplacement original', COMPLETE], ['Copies contrôlées', COMPLETE], ['Responsable des mises à jour', COMPLETE], ['Périodicité de révision', COMPLETE], ['Prochaine révision', COMPLETE]],
    ])),

    chapter(25, field('Actions issues des analyses de risques', IMPORT), tables([
      [['Problème ou écart', 'Action', 'Responsable', 'Délai', 'Statut'], [COMPLETE, COMPLETE, COMPLETE, COMPLETE, COMPLETE], [COMPLETE, COMPLETE, COMPLETE, COMPLETE, COMPLETE], [COMPLETE, COMPLETE, COMPLETE, COMPLETE, COMPLETE]],
    ])),

    chapter(26, checklist(['Attendre l’autorisation de fin d’incident.', 'Contrôler les zones avant retour.', 'Informer les personnes concernées.', 'Préserver les éléments utiles.', 'Organiser le retour d’expérience.', 'Mettre à jour le PIU.']), tables([
      [['Décision', 'Responsable', 'Heure', 'Validation'], ['Fin d’alerte', COMPLETE, COMPLETE, VALIDATE], ['Réintégration', COMPLETE, COMPLETE, VALIDATE], ['Fermeture temporaire', COMPLETE, COMPLETE, NOT_APPLICABLE]],
    ])),

    chapter(27, tables([
      [['Nom et prénom', 'Fonction', 'Consignes reçues le', 'Compréhension vérifiée', 'Signature'], [COMPLETE, COMPLETE, COMPLETE, VALIDATE, COMPLETE], [COMPLETE, COMPLETE, COMPLETE, VALIDATE, COMPLETE], [COMPLETE, COMPLETE, COMPLETE, VALIDATE, COMPLETE], [COMPLETE, COMPLETE, COMPLETE, VALIDATE, COMPLETE]],
    ])),

    chapter(28, tables([
      [['Rôle', 'Nom', 'Date', 'Signature'], ['Employeur', COMPLETE, COMPLETE, COMPLETE], ['Responsable du bâtiment', data.siteManager, COMPLETE, COMPLETE], ['Responsable évacuation', data.emergencyManager, COMPLETE, COMPLETE], ['Conseiller en prévention', data.preventionAdvisor, COMPLETE, COMPLETE], ['Autre validation', COMPLETE, COMPLETE, COMPLETE]],
    ]), field('Statut final', VALIDATE)),
  ];

  return chapters.flatMap((item) => [item, '']);
}

function reflexChapter(data) {
  const scenarioText = data.emergencyScenarios === COMPLETE ? '' : data.emergencyScenarios.toLowerCase();
  const sheets = REFLEX_SHEETS.map(([number, title, actions]) => [
    `### FICHE ${number} – ${title}`,
    '',
    `Applicabilité : ${sheetApplicability(number, title, scenarioText)}`,
    '',
    'Consignes :',
    ...actions.map((action) => `- [ ] ${action}`),
    '- [ ] Informer le responsable PIU.',
    '- [ ] Tracer les décisions et heures utiles.',
    '',
  ].join('\n')).join('\n');

  return chapter(17,
    field('Points issus des analyses de risques', IMPORT),
    field('Scénarios fournis', data.emergencyScenarios),
    sheets,
  );
}

function sheetApplicability(number, title, scenarios) {
  if (number === '00') return '[applicable]';
  const keywords = title.toLowerCase().split(/\s|\//).filter((word) => word.length > 5);
  return keywords.some((keyword) => scenarios.includes(keyword)) ? '[applicable à valider]' : '[à confirmer]';
}

function tableOfContents() {
  return [
    '## Table des matières opérationnelle',
    '',
    markdownTable([
      ['N°', 'Chapitre'],
      ...CHAPTER_TITLES.map((title, index) => [String(index + 1), title]),
    ]),
  ].join('\n');
}

function chapter(number, ...blocks) {
  return [
    `## ${number}. ${CHAPTER_TITLES[number - 1]}`,
    '',
    ...blocks.filter(Boolean),
  ].join('\n\n');
}

function tables(definitions) {
  return definitions.map(markdownTable).join('\n\n');
}

function checklist(items) {
  return items.map((item) => `- [ ] ${item}`).join('\n');
}

function field(label, value) {
  return `- ${label} : ${value}`;
}

function normalizeFormData(formData) {
  const input = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {};
  const fields = [
    'companyName', 'siteName', 'buildingName', 'address', 'postalCode', 'city', 'country',
    'preventionAdvisor', 'siteManager', 'technicalServiceContact', 'emergencyManager',
    'assemblyPoint', 'pmrProcedure', 'firefighterFileLocation', 'fireAlarmSystem',
    'gasShutoff', 'electricityShutoff', 'waterShutoff', 'ventilationShutoff',
    'emergencyScenarios', 'availablePlans',
  ];
  return Object.fromEntries(fields.map((name) => [name, formatValue(input[name])]));
}

function firstKnown(...values) {
  return values.find((value) => value && value !== COMPLETE) || COMPLETE;
}

function joinAddress(data) {
  const locality = [data.postalCode, data.city].filter(isKnown).join(' ');
  return [data.address, locality, data.country].filter(isKnown).join(', ') || COMPLETE;
}

function isKnown(value) {
  return value && value !== COMPLETE;
}

function markdownTable(rows) {
  const [header, ...body] = rows;
  return [
    `| ${header.map(escapeCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.map((cell) => escapeCell(formatValue(cell))).join(' | ')} |`),
  ].join('\n');
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return COMPLETE;
  if (Array.isArray(value)) {
    const items = value.map(formatScalar).filter(Boolean);
    return items.length ? items.join(', ') : COMPLETE;
  }
  if (typeof value === 'object') {
    const items = Object.entries(value).map(([key, entry]) => `${formatScalar(key)} : ${formatScalar(entry)}`);
    return items.length ? items.join('; ') : COMPLETE;
  }
  return formatScalar(value) || COMPLETE;
}

function formatScalar(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function normalizeLanguage(language) {
  return String(language || 'fr').trim().toLowerCase().split(/[-_]/)[0];
}

export { CHAPTER_TITLES, REFLEX_SHEETS };
