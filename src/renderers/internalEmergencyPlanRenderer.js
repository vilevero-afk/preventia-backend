const MISSING = '[à compléter]';

const REFLEX_SHEETS = [
  ['00', 'Nomenclature des fiches', ['Identifier le scénario.', 'Noter le numéro de fiche.', 'Diffuser la fiche utile.', 'Archiver chaque mise à jour.']],
  ['01', 'Incendie', ['Déclencher l’alarme.', 'Appeler le 112.', 'Évacuer sans prendre de risque.', 'Accueillir les secours.']],
  ['02', 'Mise à l’abri / SEVESO / incident extérieur', ['Déclencher la mise à l’abri.', 'Fermer portes et fenêtres.', 'Arrêter la ventilation si prévu.', 'Suivre les instructions des autorités.']],
  ['03', 'Alerte à la bombe / colis suspect', ['Ne pas toucher l’objet.', 'Éloigner les personnes.', 'Appeler le 112.', 'Conserver les informations reçues.']],
  ['04', 'Menace biologique ou chimique', ['Éloigner les personnes.', 'Éviter tout contact.', 'Appeler le 112.', 'Isoler la zone si possible.']],
  ['05', 'Déversement accidentel de substances dangereuses', ['Interdire l’accès.', 'Identifier le produit sans exposition.', 'Appeler les secours si nécessaire.', 'Utiliser uniquement les moyens prévus.']],
  ['06', 'Inondation', ['Éloigner les personnes de l’eau.', 'Couper les énergies si cela est sûr.', 'Protéger les accès exposés.', 'Suivre les consignes des autorités.']],
  ['07', 'Tempête / orage', ['Mettre les personnes à l’abri.', 'Éloigner les personnes des vitrages.', 'Suspendre les activités extérieures.', 'Surveiller les alertes officielles.']],
  ['08', 'Accident de transport de matières dangereuses', ['Rester à distance.', 'Appeler le 112.', 'Se mettre à l’abri.', 'Ne pas approcher le véhicule.']],
  ['09', 'Séisme', ['S’éloigner des vitrages.', 'Se protéger des chutes d’objets.', 'Évacuer après les secousses si nécessaire.', 'Contrôler les dommages visibles.']],
  ['10', 'Fuite de gaz', ['Ne créer aucune étincelle.', 'Évacuer la zone.', 'Appeler le 112 depuis une zone sûre.', 'Couper le gaz uniquement si prévu.']],
  ['11', 'Accident corporel ou malaise', ['Protéger la zone.', 'Appeler le 112.', 'Alerter un secouriste.', 'Ne pas déplacer la victime sans nécessité.']],
  ['12', 'Fuite de chlore / produit spécifique si applicable', ['Évacuer contre le vent si possible.', 'Éviter toute inhalation.', 'Appeler le 112.', 'Consulter la fiche de données de sécurité.']],
  ['13', 'Intoxication alimentaire', ['Alerter la direction.', 'Contacter les secours si nécessaire.', 'Conserver les éléments utiles.', 'Identifier les personnes concernées.']],
  ['14', 'Pandémie / épidémie', ['Appliquer les consignes sanitaires.', 'Isoler la personne si nécessaire.', 'Informer les contacts désignés.', 'Renforcer les mesures d’hygiène.']],
  ['15', 'Coupure de courant / délestage', ['Sécuriser les activités en cours.', 'Utiliser l’éclairage de secours.', 'Vérifier les équipements critiques.', 'Informer le service technique.']],
  ['16', 'Menace terroriste', ['Appeler le 112 dès que possible.', 'S’échapper si la voie est sûre.', 'Se cacher si nécessaire.', 'Garder le silence.']],
  ['17', 'Intrusion dangereuse / AMOK', ['Alerter discrètement le 112.', 'S’échapper si la voie est sûre.', 'Se confiner si nécessaire.', 'Ne pas confronter l’auteur.']],
  ['18', 'Prise d’otages', ['Ne pas provoquer l’auteur.', 'Alerter le 112 si possible.', 'Observer sans prendre de risque.', 'Suivre les consignes des policiers.']],
  ['19', 'Fermeture inopinée du site', ['Suspendre les accès.', 'Informer les personnes présentes.', 'Sécuriser les activités critiques.', 'Activer la chaîne de décision.']],
  ['20', 'Évènement grave concernant un travailleur à l’extérieur', ['Contacter les secours locaux.', 'Alerter la direction.', 'Confirmer les faits disponibles.', 'Préserver la confidentialité.']],
  ['21', 'Agression', ['Se mettre en sécurité.', 'Appeler le 112.', 'Porter assistance sans s’exposer.', 'Préserver les éléments utiles.']],
  ['22', 'Maladie contagieuse spécifique', ['Éloigner la personne si nécessaire.', 'Appliquer les consignes sanitaires.', 'Informer les contacts désignés.', 'Tracer les mesures prises.']],
];

export function renderInternalEmergencyPlanMarkdown(formData = {}, language = 'fr') {
  const data = normalizeFormData(formData);
  const sections = buildSections(data);
  const translationNotice = normalizeLanguage(language) === 'fr'
    ? ''
    : '> Traduction à prévoir — version française générée.';

  return [
    '# Plan Interne d’Urgence — PIU',
    '',
    '**Projet à compléter, vérifier sur site et valider**',
    translationNotice,
    '',
    '> Ce document est une aide à la rédaction d’un PIU. Il doit être complété, vérifié sur site, adapté aux moyens réels et validé par les personnes compétentes avant diffusion.',
    '',
    ...sections,
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n').trim() + '\n';
}

function buildSections(data) {
  const site = joinAddress(data);
  const sections = [
    section(1, 'Identification du document', [['Élément', 'Valeur'], ['Entreprise', data.companyName], ['Site', data.siteName], ['Bâtiment', data.buildingName], ['Référence PIU', MISSING], ['Version', MISSING], ['Date', MISSING]], 'Vérifier la référence et la version.', 'Registre des versions signé.', 'Page de garde du PIU.', 'Direction du site.', 'Version ou responsable absent.'),
    section(2, 'Coordonnées du bâtiment', [['Élément', 'Valeur'], ['Adresse complète', site], ['Téléphone principal', MISSING], ['Coordonnées GPS', MISSING], ['Accès principal', MISSING]], 'Vérifier l’adresse depuis la voie publique.', 'Adresse confirmée par la direction.', 'Photo de façade et accès principal.', 'Responsable du bâtiment.', 'Adresse imprécise ou accès non identifié.'),
    section(3, 'Approbation et validation du plan', [['Validation', 'Responsable', 'Statut'], ['Rédaction', data.preventionAdvisor, '☐'], ['Approbation', data.emergencyManager, '☐'], ['Avis des acteurs compétents', MISSING, '☐'], ['Date de révision', MISSING, '☐']], 'Vérifier le circuit d’approbation.', 'Page de validation signée.', 'Organigramme de validation.', 'Employeur et personnes compétentes.', 'Validateur ou date de révision absent.'),
    section(4, 'Personnes ressources et contacts utiles', [['Fonction', 'Contact'], ['Responsable d’urgence', data.emergencyManager], ['Suppléant', data.deputyEmergencyManager], ['Conseiller en prévention', data.preventionAdvisor], ['Accueil', data.receptionContact], ['Service technique', data.technicalServiceContact], ['Sécurité', data.securityContact], ['Secouristes', data.firstAiders]], 'Tester les numéros et disponibilités.', 'Liste de contacts datée.', 'Emplacement de la liste affichée.', 'Direction du site.', 'Contact critique injoignable.'),
    section(5, 'Informations générales du site', [['Élément', 'Valeur'], ['Activité', data.activityType], ['Travailleurs', data.numberOfWorkers], ['Visiteurs', data.visitors], ['Entreprises extérieures', data.externalCompanies], ['Heures d’ouverture', data.openingHours], ['Travail de nuit', data.nightWork], ['Nettoyage', data.cleaningHours], ['Gardiennage', data.securityGuarding], ['Risques spécifiques', data.specificRisks]], 'Comparer les effectifs aux présences réelles.', 'Registre des présences et horaires.', 'Plan d’occupation du site.', 'Direction et prévention.', 'Effectif maximal inconnu.'),
    section(6, 'Responsables spécifiques et suppléants', [['Rôle', 'Titulaire', 'Suppléant'], ['Direction des opérations', data.emergencyManager, data.deputyEmergencyManager], ['Guides d’évacuation', data.evacuationGuides, MISSING], ['Équipe incendie', data.fireTeam, MISSING], ['Recensement', MISSING, MISSING], ['Accueil des secours', data.receptionContact, MISSING]], 'Confirmer chaque présence par plage horaire.', 'Liste nominative avec suppléants.', 'Organigramme opérationnel.', 'Direction du site.', 'Rôle critique sans suppléant.'),
    section(7, 'Annonce aux services de secours', [['Action', 'Statut'], ['Appeler le 112.', '☐'], ['Donner l’adresse exacte du site.', '☐'], ['Préciser le type d’incident.', '☐'], ['Préciser le nombre de victimes.', '☐'], ['Indiquer l’accès conseillé.', '☐']], 'Le téléphone permet-il d’appeler le 112 ?', 'Photo ou localisation du téléphone d’urgence.', 'Point d’appel et accès secours.', 'Direction du site.', 'Adresse incohérente avec les plans affichés.'),
    section(8, 'Déclenchement du plan en interne', [['Action', 'Responsable', 'Statut'], ['Détecter et confirmer l’alerte.', MISSING, '☐'], ['Alerter le responsable d’urgence.', data.receptionContact, '☐'], ['Déclencher le signal adapté.', data.emergencyManager, '☐'], ['Informer les équipes.', MISSING, '☐'], ['Tracer l’heure de déclenchement.', MISSING, '☐']], 'Tester la chaîne d’alerte.', 'Compte rendu d’un test.', 'Schéma de la chaîne d’alerte.', 'Responsable d’urgence.', 'Signal non audible ou procédure inconnue.'),
    section(9, 'Procédure d’évacuation', [['Action', 'Statut'], ['Déclencher l’alarme.', '☐'], ['Quitter les locaux par les sorties sûres.', '☐'], ['Fermer les portes sans les verrouiller.', '☐'], ['Rejoindre le point de rassemblement.', '☐'], ['Ne pas revenir sans autorisation.', '☐']], 'Parcourir tous les itinéraires.', 'Rapport du dernier exercice.', 'Plans d’évacuation affichés.', 'Service prévention.', 'Issue inutilisable ou alarme non perceptible.'),
    section(10, 'Personnes à mobilité réduite / assistance', [['Élément', 'Disposition'], ['Procédure PMR', data.pmrProcedure], ['Zone d’attente sûre', data.safeWaitingArea], ['Personnes chargées de l’assistance', MISSING], ['Moyen de communication', MISSING]], 'Tester la procédure avec les personnes concernées.', 'Compte rendu du test PMR.', 'Plan des zones d’attente sûres.', 'Prévention et personnes concernées.', 'Aucune solution d’assistance sûre.'),
    section(11, 'Lieux de rassemblement', [['Élément', 'Valeur'], ['Point principal', data.assemblyPoint], ['Point alternatif', MISSING], ['Signalisation', MISSING], ['Capacité', MISSING], ['Distance des risques', MISSING]], 'Vérifier l’accessibilité en toute saison.', 'Photo datée du point.', 'Plan des deux points.', 'Responsable d’urgence.', 'Point exposé au scénario d’urgence.'),
    section(12, 'Recensement des personnes présentes', [['Population', 'Source de comptage', 'Responsable'], ['Travailleurs', MISSING, MISSING], ['Visiteurs', data.visitors, data.receptionContact], ['Entreprises extérieures', data.externalCompanies, MISSING], ['Personnes manquantes', 'Informer les secours.', data.emergencyManager]], 'Comparer les listes au comptage réel.', 'Modèle de liste de présence.', 'Emplacement du poste de recensement.', 'Direction du site.', 'Présences non traçables.'),
    section(13, 'Accès pour les secours et accueil', [['Élément', 'Valeur'], ['Accès conseillé', MISSING], ['Point d’accueil', data.receptionContact], ['Clés ou badges', MISSING], ['Obstacles', MISSING], ['Guidage vers le sinistre', MISSING]], 'Faire le trajet avec un véhicule de secours.', 'Accord ou avis du service incendie.', 'Plan d’accès et photos des portails.', 'Responsable du bâtiment.', 'Accès bloqué ou gabarit insuffisant.'),
    section(14, 'Rôle des personnes ressources', [['Rôle', 'Mission courte'], ['Responsable d’urgence', 'Décider et coordonner.'], ['Suppléant', 'Remplacer le responsable.'], ['Guide', 'Conduire vers la sortie.'], ['Serre-file', 'Vérifier la zone sans s’exposer.'], ['Secouriste', 'Porter assistance sans danger.'], ['Accueil', 'Guider les secours.']], 'Expliquer chaque rôle aux titulaires.', 'Fiches de rôle signées.', 'Organigramme affiché.', 'Direction du site.', 'Mission inconnue par le titulaire.'),
    section(15, 'Organisation des exercices', [['Élément', 'Valeur'], ['Fréquence', MISSING], ['Scénarios prévus', data.emergencyScenarios], ['Observateurs', MISSING], ['Compte rendu', MISSING], ['Plan d’actions', MISSING]], 'Planifier un exercice réaliste.', 'Rapport et liste de présence.', 'Photos autorisées de l’exercice.', 'Direction et prévention.', 'Aucun exercice planifié.'),
    section(16, 'Locaux disponibles pour la gestion d’urgence', [['Local', 'Usage', 'Équipement'], ['Poste de commandement', MISSING, MISSING], ['Local premiers soins', MISSING, MISSING], ['Accueil des proches', MISSING, MISSING], ['Local des autorités', MISSING, MISSING]], 'Contrôler l’accès et les moyens disponibles.', 'Inventaire daté des équipements.', 'Plan et photos des locaux.', 'Responsable d’urgence.', 'Aucun local utilisable.'),
    section(17, 'Procédures incendie', [['Action', 'Statut'], ['Donner l’alarme.', '☐'], ['Appeler le 112.', '☐'], ['Évacuer.', '☐'], ['Utiliser un extincteur sans s’exposer.', '☐'], ['Fermer les portes.', '☐'], ['Accueillir les pompiers.', '☐']], 'Tester l’alarme et les cheminements.', 'Rapport de contrôle du système.', 'Plan des moyens incendie.', 'Prévention et service incendie.', 'Alarme ou évacuation défaillante.'),
    section(18, 'Moyens techniques et coupures', [['Moyen', 'Présence ou emplacement'], ['Alarme incendie', data.fireAlarmSystem], ['Tableau de détection', data.fireDetectionPanelLocation], ['Extincteurs', data.extinguishers], ['Hydrants', data.hydrants], ['Désenfumage', data.smokeExtraction], ['Coupure gaz', data.gasShutoff], ['Coupure électricité', data.electricityShutoff], ['Coupure eau', data.waterShutoff], ['Coupure ventilation', data.ventilationShutoff]], 'Identifier chaque commande sur place.', 'Rapports de contrôle et essais.', 'Photos et plan des coupures.', 'Service technique.', 'Commande inaccessible ou non identifiée.'),
    reflexSection(data),
    section(20, 'Dossier pour les pompiers', [['Élément', 'Valeur'], ['Emplacement du dossier', data.firefighterFileLocation], ['Coordonnées du site', site], ['Plans disponibles', data.availablePlans], ['Risques spécifiques', data.specificRisks], ['Clés et accès', MISSING]], 'Vérifier l’accès permanent au dossier.', 'Inventaire daté du dossier.', 'Photo de son emplacement.', 'Direction et service incendie.', 'Dossier absent ou inaccessible.'),
    section(21, 'Plans et annexes', [['Annexe', 'Statut'], ['Plan de situation.', '☐'], ['Plan d’accès secours.', '☐'], ['Plans d’évacuation.', '☐'], ['Plan des coupures.', '☐'], ['Plan des risques spécifiques.', '☐'], ['Liste des contacts.', '☐'], ['Plans disponibles déclarés.', data.availablePlans]], 'Comparer les plans aux locaux réels.', 'Jeu de plans daté.', 'Plans lisibles à annexer.', 'Responsable du bâtiment.', 'Plan obsolète ou manquant.'),
    section(22, 'Mise à l’abri', [['Action', 'Statut'], ['Déclencher le signal prévu.', '☐'], ['Rejoindre le local désigné.', '☐'], ['Fermer les ouvertures.', '☐'], ['Arrêter la ventilation si prévu.', '☐'], ['Écouter les autorités.', '☐'], ['Attendre la fin d’alerte.', '☐']], 'Tester l’audibilité et l’étanchéité utile.', 'Compte rendu d’exercice.', 'Plan des locaux de mise à l’abri.', 'Responsable d’urgence.', 'Local ou signal non défini.'),
    section(23, 'Prise d’iode si applicable', [['Élément', 'Valeur'], ['Applicabilité', 'À confirmer.'], ['Stock disponible', MISSING], ['Lieu de stockage', MISSING], ['Responsable', MISSING], ['Instruction officielle', 'Attendre l’ordre des autorités.']], 'Vérifier la zone de planification concernée.', 'Consigne officielle et registre du stock.', 'Photo du lieu de stockage.', 'Médecin du travail et autorités compétentes.', 'Distribution prévue sans ordre officiel.'),
    section(24, 'Évacuation du secteur / quartier', [['Action', 'Statut'], ['Attendre ou confirmer l’ordre des autorités.', '☐'], ['Définir les moyens de transport.', '☐'], ['Assister les personnes vulnérables.', '☐'], ['Emporter les listes de présence.', '☐'], ['Informer le point d’accueil.', '☐']], 'Vérifier les itinéraires externes.', 'Accord avec les moyens de transport.', 'Carte des itinéraires et destinations.', 'Autorités et direction.', 'Destination ou transport non défini.'),
    section(25, 'Information et formation du personnel', [['Public', 'Contenu', 'Preuve'], ['Nouveaux travailleurs', 'Consignes de base.', MISSING], ['Personnes ressources', 'Rôle opérationnel.', MISSING], ['Sous-traitants', 'Alerte et évacuation.', MISSING], ['Visiteurs', 'Consignes essentielles.', MISSING]], 'Interroger un échantillon de personnes.', 'Registre de formation signé.', 'Supports et affichages à annexer.', 'Direction et prévention.', 'Personnes ressources non formées.'),
    section(26, 'Problèmes rencontrés / points ouverts', [['Point ouvert', 'Responsable', 'Échéance', 'Statut'], [MISSING, MISSING, MISSING, '☐'], [MISSING, MISSING, MISSING, '☐'], [MISSING, MISSING, MISSING, '☐']], 'Recenser les écarts après chaque exercice.', 'Plan d’actions actualisé.', 'Photo des écarts matériels.', 'Direction du site.', 'Écart critique sans responsable.'),
    section(27, 'Consignes de fin d’incident', [['Action', 'Statut'], ['Attendre l’autorisation de fin d’alerte.', '☐'], ['Contrôler les zones avant retour.', '☐'], ['Informer les personnes concernées.', '☐'], ['Préserver les preuves utiles.', '☐'], ['Organiser le retour d’expérience.', '☐']], 'Définir qui autorise la reprise.', 'Compte rendu de fin d’incident.', 'Photos des zones avant reprise.', 'Direction et autorités compétentes.', 'Reprise sans contrôle de sécurité.'),
    section(28, 'Attestation de réception des consignes', [['Nom', 'Fonction', 'Date', 'Signature'], [MISSING, MISSING, MISSING, MISSING], [MISSING, MISSING, MISSING, MISSING], [MISSING, MISSING, MISSING, MISSING]], 'Vérifier la compréhension des consignes.', 'Attestations signées.', 'Support remis à annexer.', 'Responsable hiérarchique.', 'Personnel exposé sans preuve d’information.'),
    section(29, 'Signatures', [['Rôle', 'Nom', 'Date', 'Signature'], ['Employeur', MISSING, MISSING, MISSING], ['Responsable d’urgence', data.emergencyManager, MISSING, MISSING], ['Conseiller en prévention', data.preventionAdvisor, MISSING, MISSING], ['Autre validation requise', MISSING, MISSING, MISSING]], 'Vérifier les pouvoirs de signature.', 'Version finale signée et datée.', 'Page de signatures à annexer.', 'Employeur et personnes compétentes.', 'Signature ou validation obligatoire absente.'),
  ];

  return sections.flatMap((value) => [value, '']);
}

function section(number, title, rows, check, proof, annex, validation, blocker) {
  return [
    `## ${number}. ${title}`,
    '',
    markdownTable(rows),
    '',
    `À vérifier sur site : ${check}`,
    '',
    `Preuve à obtenir : ${proof}`,
    '',
    `Plan/photo à annexer : ${annex}`,
    '',
    `Validation requise : ${validation}`,
    '',
    `Point bloquant : ${blocker}`,
  ].join('\n');
}

function reflexSection(data) {
  const scenarios = `${data.specificRisks} ${data.emergencyScenarios}`.toLowerCase();
  const sheets = REFLEX_SHEETS.map(([number, title, actions]) => {
    const applicable = getApplicability(number, scenarios);
    return [
      `### Fiche ${number}. ${title}`,
      '',
      `Applicabilité : ${applicable}`,
      '',
      ...actions.map((action) => `- [ ] ${action}`),
      '',
      `À vérifier sur site : moyens et consignes adaptés à « ${title} ».`,
      '',
      'Preuve à obtenir : procédure testée ou fiche validée.',
      '',
      'Point bloquant : action critique impossible avec les moyens réels.',
    ].join('\n');
  }).join('\n\n');

  return [
    '## 19. Fiches réflexes opérationnelles',
    '',
    markdownTable([['Élément', 'Valeur'], ['Scénarios déclarés', data.emergencyScenarios], ['Risques spécifiques', data.specificRisks], ['Diffusion des fiches', MISSING]]),
    '',
    sheets,
    '',
    'À vérifier sur site : tester chaque fiche applicable.',
    '',
    'Preuve à obtenir : fiches datées et comptes rendus d’exercice.',
    '',
    'Plan/photo à annexer : emplacement des fiches opérationnelles.',
    '',
    'Validation requise : direction, prévention et spécialistes concernés.',
    '',
    'Point bloquant : scénario applicable sans consigne utilisable.',
  ].join('\n');
}

function getApplicability(number, scenarios) {
  if (number === '00') return 'Applicable.';
  const keywords = {
    '01': 'incend', '02': 'seveso', '03': 'bombe', '04': 'chim', '05': 'déverse',
    '06': 'inond', '07': 'tempête', '08': 'transport', '09': 'séisme', '10': 'gaz',
    '11': 'malaise', '12': 'chlore', '13': 'aliment', '14': 'pand', '15': 'courant',
    '16': 'terror', '17': 'amok', '18': 'otage', '19': 'fermeture', '20': 'extérieur',
    '21': 'agression', '22': 'contag',
  };
  return scenarios.includes(keywords[number]) ? 'Applicable.' : 'À confirmer.';
}

function normalizeFormData(formData) {
  const fields = [
    'companyName', 'siteName', 'buildingName', 'address', 'postalCode', 'city', 'country',
    'activityType', 'numberOfWorkers', 'visitors', 'externalCompanies', 'openingHours',
    'nightWork', 'cleaningHours', 'securityGuarding', 'emergencyManager',
    'deputyEmergencyManager', 'preventionAdvisor', 'receptionContact',
    'technicalServiceContact', 'securityContact', 'firstAiders', 'evacuationGuides',
    'fireTeam', 'assemblyPoint', 'pmrProcedure', 'safeWaitingArea', 'fireAlarmSystem',
    'fireDetectionPanelLocation', 'extinguishers', 'hydrants', 'smokeExtraction',
    'gasShutoff', 'electricityShutoff', 'waterShutoff', 'ventilationShutoff',
    'specificRisks', 'emergencyScenarios', 'availablePlans', 'firefighterFileLocation',
  ];

  return Object.fromEntries(fields.map((field) => [field, formatValue(formData?.[field])]));
}

function formatValue(value) {
  if (Array.isArray(value)) {
    const values = value.map(formatScalar).filter(Boolean);
    return values.length ? values.join(', ') : MISSING;
  }
  if (value && typeof value === 'object') {
    const values = Object.entries(value).map(([key, entry]) => `${formatScalar(key)} : ${formatScalar(entry)}`).filter((entry) => !entry.endsWith(' : '));
    return values.length ? values.join(', ') : MISSING;
  }
  return formatScalar(value) || MISSING;
}

function formatScalar(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function joinAddress(data) {
  const address = [data.address, [data.postalCode, data.city].filter((value) => value !== MISSING).join(' '), data.country]
    .filter((value) => value && value !== MISSING)
    .join(', ');
  return address || MISSING;
}

function markdownTable(rows) {
  const [header, ...body] = rows;
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.map((cell) => formatValue(cell)).join(' | ')} |`),
  ].join('\n');
}

function normalizeLanguage(language) {
  return String(language || 'fr').trim().toLowerCase().split(/[-_]/)[0];
}

export { REFLEX_SHEETS };
