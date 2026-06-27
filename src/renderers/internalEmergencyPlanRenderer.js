const COMPLETE = '[à compléter]';
const VERIFY = '[à vérifier sur site]';
const NOT_APPLICABLE = '[non applicable à confirmer]';
const VALIDATE = '[validation requise]';
const IMPORT = '[à compléter / à importer]';
const PIU_RELEVANT = 'Pertinente pour le PIU';
const PIU_CONDITIONAL = 'Pertinente sous condition';
const PIU_NOT_RELEVANT = 'Non pertinente pour le PIU';
const PIU_PARTS = [
  'scénarios d’urgence',
  'alerte',
  'évacuation',
  'confinement',
  'premiers secours',
  'accueil des secours',
  'moyens d’intervention',
  'rôles et responsabilités',
  'information visiteurs/sous-traitants',
  'exercices',
  'annexes PIU',
];

const EMERGENCY_PATTERNS = [
  ['situation d’urgence', ['scénarios d’urgence', 'rôles et responsabilités']],
  ['procédure d’alerte', ['alerte']],
  ['alerte', ['alerte']],
  ['évacuation', ['évacuation']],
  ['confinement', ['confinement']],
  ['mise à l’abri', ['confinement']],
  ['premiers secours', ['premiers secours']],
  ['secours', ['accueil des secours']],
  ['accident grave', ['scénarios d’urgence', 'premiers secours']],
  ['malaise', ['scénarios d’urgence', 'premiers secours']],
  ['incendie', ['scénarios d’urgence', 'évacuation', 'moyens d’intervention']],
  ['explosion', ['scénarios d’urgence', 'évacuation']],
  ['fuite de gaz', ['scénarios d’urgence', 'évacuation']],
  ['déversement', ['scénarios d’urgence', 'confinement']],
  ['exposition accidentelle', ['scénarios d’urgence', 'premiers secours']],
  ['violence grave', ['scénarios d’urgence', 'alerte']],
  ['menace', ['scénarios d’urgence', 'alerte']],
  ['panne critique', ['scénarios d’urgence', 'moyens d’intervention']],
  ['sauvetage', ['scénarios d’urgence', 'accueil des secours']],
  ['accident majeur', ['scénarios d’urgence', 'confinement']],
  ['personne bloquée', ['scénarios d’urgence', 'alerte']],
  ['communication bidirectionnelle', ['alerte', 'moyens d’intervention']],
  ['coupure générale', ['moyens d’intervention', 'accueil des secours']],
  ['tgbt', ['moyens d’intervention', 'accueil des secours']],
  ['point de rassemblement', ['évacuation']],
  ['visiteur', ['information visiteurs/sous-traitants']],
  ['sous-traitant', ['information visiteurs/sous-traitants']],
  ['personne vulnérable', ['évacuation', 'premiers secours']],
];

const NON_OPERATIONAL_PATTERNS = [
  'pv rgie',
  'rapport sect',
  'sect manquant',
  'thermographie',
  'contrôle périodique',
  'controle périodique',
  'formation ba4',
  'formation ba5',
  'ba4/ba5',
  'planifier',
  'à planifier',
  'a planifier',
  'à obtenir',
  'a obtenir',
  'registre',
  'preuve',
  'validation',
  'rapport',
  'attestation',
];

const CONDITIONAL_PATTERNS = [
  'si ',
  'sous condition',
  'à confirmer',
  'a confirmer',
  'selon',
  'le cas échéant',
  'si présent',
  'si applicable',
];

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
  const piuContext = buildPiuContext(formData, data);
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
    piuAnalysisSection(piuContext),
    '',
    tableOfContents(),
    '',
    ...buildChapters(data, piuContext),
  ].filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function buildChapters(data, piuContext) {
  const address = joinAddress(data);
  const operationalScenarios = piuOperationalScenarios(piuContext);
  const operationalProcedures = piuOperationalProcedures(piuContext);
  const piuAnnexes = piuAnnexesToPlan(piuContext);
  const reorientedItems = piuReorientedItems(piuContext);
  const chapters = [
    chapter(1, tables([
      [['Élément', 'Information'], ['Entreprise', data.companyName], ['Dénomination du bâtiment', firstKnown(data.siteName, data.buildingName)], ['Adresse complète', address], ['Téléphone', data.generalPhone], ['Email général', data.generalEmail], ['Coordonnées GPS', VERIFY], ['Accès principal', VERIFY]],
    ]), checklist(['Confirmer la dénomination.', 'Vérifier l’adresse depuis la voie publique.', 'Identifier l’accès principal.'])),

    chapter(2, tables([
      [['Étape', 'Nom', 'Date', 'Statut'], ['Rédaction', data.preventionAdvisor, COMPLETE, VALIDATE], ['Vérification sur site', COMPLETE, COMPLETE, VALIDATE], ['Approbation employeur', COMPLETE, COMPLETE, VALIDATE], ['Révision prévue', COMPLETE, COMPLETE, VALIDATE]],
    ])),

    chapter(3, tables([
      [['Fonction', 'Titulaire', 'Téléphone', 'Disponibilité'], ['Responsable du bâtiment', data.siteManager, COMPLETE, VERIFY], ['Conseiller en prévention', data.preventionAdvisor, COMPLETE, VERIFY], ['Service technique', data.technicalServiceContact, data.generalPhone, VERIFY], ['Responsable évacuation', data.emergencyManager, COMPLETE, VERIFY], ['Accueil', data.siteContact, data.generalPhone, VERIFY], ['Secouristes', COMPLETE, COMPLETE, VERIFY]],
    ])),

    chapter(4, tables([
      [['Élément', 'Information'], ['Activité du site', data.activityDescription], ['Effectif maximal', data.numberOfWorkers], ['Horaires', data.workingHours], ['Visiteurs', data.visitorsPresence], ['Entreprises extérieures', data.externalCompaniesPresence], ['Risques particuliers', VERIFY], ['Accessibilité PMR', VERIFY]],
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
      [['Population', 'Source de comptage', 'Responsable', 'Résultat'], ['Travailleurs', data.numberOfWorkers, COMPLETE, COMPLETE], ['Visiteurs', data.visitorsPresence, data.siteContact, COMPLETE], ['Entreprises extérieures', data.externalCompaniesPresence, data.siteContact, COMPLETE], ['Personnes manquantes', 'Informer les secours.', data.emergencyManager, COMPLETE]],
    ])),

    chapter(12, tables([
      [['Élément', 'Information'], ['Accès véhicules de secours', VERIFY], ['Point d’accueil', data.siteContact], ['Responsable accueil', data.siteContact], ['Clés ou badges', VERIFY], ['Obstacles et gabarit', VERIFY], ['Itinéraire vers le sinistre', VERIFY], ['Accès hors horaires', data.workingHours]],
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

    chapter(16, field('Informations issues des analyses de risques incendie', IMPORT), operationalProcedures, tables([
      [['Moyen ou action', 'Information'], ['Centrale incendie / alarme', data.fireAlarmSystem], ['Détection', VERIFY], ['Extincteurs', VERIFY], ['Désenfumage', VERIFY], ['Coupure gaz', data.gasShutoff], ['Coupure électricité', data.electricityShutoff], ['Coupure eau', data.waterShutoff], ['Coupure ventilation', data.ventilationShutoff]],
    ]), checklist(['Donner l’alarme.', 'Appeler le 112.', 'Évacuer.', 'Fermer les portes.', 'Ne combattre un départ de feu que sans danger.', 'Accueillir les pompiers.'])),

    reflexChapter(data, piuContext),

    chapter(18, field('Éléments issus des analyses de risques', IMPORT), piuAnnexes, tables([
      [['Élément du dossier', 'Information ou statut'], ['Emplacement du dossier', data.firefighterFileLocation], ['Coordonnées du bâtiment', address], ['Liste des contacts', COMPLETE], ['Plans disponibles', data.availablePlans], ['Plans des coupures', VERIFY], ['Risques particuliers', VERIFY], ['Clés et badges', VERIFY], ['Date de mise à jour', COMPLETE]],
    ])),

    chapter(19, tables([
      [['Plan', 'Disponible', 'Date', 'Vérifié sur site'], ['Plan de situation', data.availablePlans, COMPLETE, VERIFY], ['Plan d’accès secours', VERIFY, COMPLETE, VERIFY], ['Plans d’évacuation', VERIFY, COMPLETE, VERIFY], ['Plan des moyens incendie', VERIFY, COMPLETE, VERIFY], ['Plan des coupures', VERIFY, COMPLETE, VERIFY], ['Plan des zones à risques', NOT_APPLICABLE, COMPLETE, VERIFY]],
    ])),

    chapter(20, field('Mise à l’abri', 'Procédure opérationnelle à compléter.'), operationalScenarios, tables([
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

    chapter(25, field('Actions issues des analyses de risques', IMPORT), reorientedItems, tables([
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

function reflexChapter(data, piuContext) {
  const retainedScenarios = piuContext.operationalItems.map((item) => item.element);
  const scenarioValue = retainedScenarios.length ? retainedScenarios : data.emergencyScenarios;
  const scenarioText = formatValue(scenarioValue).toLowerCase();
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
    field('Points issus des analyses de risques', retainedScenarios.length ? 'Scénarios retenus après classification PIU.' : IMPORT),
    field('Scénarios fournis', scenarioValue),
    sheets,
  );
}

export function classifyRiskAnalysesForPiu(analyses = [], formData = {}) {
  return normalizeRiskAnalyses(analyses).map((analysis, index) => {
    const text = analysisText(analysis);
    const lower = normalizeText(text);
    const matches = matchingEmergencyPatterns(lower);
    const nonOperationalMatches = matchingNonOperationalPatterns(lower);
    const parts = unique(matches.flatMap(([, matchedParts]) => matchedParts)).filter((part) => PIU_PARTS.includes(part));
    const hasEmergency = matches.length > 0;
    const hasOnlyNonOperational = !hasEmergency && nonOperationalMatches.length > 0;
    const condition = conditionForAnalysis(lower, formData, analysis);
    const decision = analysisDecision({ hasEmergency, hasOnlyNonOperational, condition, analysis });
    const snippets = extractOperationalItems(analysis);
    const excluded = extractExcludedItems(analysis);

    return {
      reference: clean(analysis.reference) || `AR-${String(index + 1).padStart(4, '0')}`,
      title: analysisTitle(analysis, index),
      decision,
      condition,
      conditionConfirmed: decision !== PIU_CONDITIONAL || conditionConfirmed(condition, formData, analysis),
      why: whyForDecision(decision, matches, nonOperationalMatches),
      parts: parts.length ? parts : partsForDecision(decision),
      operationalItems: snippets,
      excludedItems: excluded,
      source: analysis,
    };
  });
}

function buildPiuContext(formData, data) {
  const input = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {};
  const importedAnalyses = Array.isArray(input.importedRiskAnalyses) ? input.importedRiskAnalyses : [];
  const importedItems = Array.isArray(input.importedPiuItems) ? input.importedPiuItems : [];
  const analysesSource = importedAnalyses.length ? importedAnalyses : importedItems.map(itemToAnalysis);
  const classifications = classifyRiskAnalysesForPiu(analysesSource, input);
  const usableClassifications = classifications.filter((classification) =>
    classification.decision === PIU_RELEVANT ||
    (classification.decision === PIU_CONDITIONAL && classification.conditionConfirmed),
  );
  const importedItemFiltering = filterImportedPiuItems(importedItems, classifications);
  const operationalItems = uniqueObjects(
    [
      ...usableClassifications.flatMap((classification) =>
        classification.operationalItems.map((item) => ({
          ...item,
          analysisTitle: classification.title,
        })),
      ),
      ...importedItemFiltering.kept,
    ],
    (item) => normalizeText(item.element),
  );
  const excludedItems = uniqueObjects([
    ...classifications.flatMap((classification) =>
      classification.excludedItems.map((item) => ({
        ...item,
        analysisTitle: classification.title,
      })),
    ),
    ...importedItemFiltering.excluded,
  ], (item) => `${normalizeText(item.element)}:${item.destination}`);

  if (!operationalItems.length && data.emergencyScenarios !== COMPLETE) {
    String(data.emergencyScenarios).split(',').map((scenario) => clean(scenario)).filter(Boolean).forEach((scenario) => {
      operationalItems.push({
        element: scenario,
        why: 'Scénario fourni dans le formulaire.',
        parts: ['scénarios d’urgence'],
        analysisTitle: 'Formulaire PIU',
      });
    });
  }

  return {
    classifications,
    usableClassifications,
    operationalItems,
    excludedItems,
    importedKeptItems: importedItemFiltering.kept,
  };
}

function piuAnalysisSection(context) {
  const rows = context.classifications.length
    ? context.classifications.map((classification) => [
      classification.title,
      classification.decision,
      classification.condition || '',
      classification.why,
      classification.parts.join(', '),
    ])
    : [[
      'Aucune analyse importée',
      PIU_CONDITIONAL,
      'Importer ou confirmer les analyses applicables.',
      'Le PIU reste un modèle à compléter.',
      'annexes PIU',
    ]];

  return [
    '## Analyses de risques utilisées pour le PIU',
    '',
    markdownTable([
      ['Analyse de risques', 'Décision', 'Condition éventuelle', 'Pourquoi', 'Parties du PIU alimentées'],
      ...rows.map((row) => row.map((cell) => truncateCell(cell, 120))),
    ]),
  ].join('\n');
}

function piuOperationalScenarios(context) {
  if (!context.operationalItems.length) return field('Scénarios d’urgence retenus', IMPORT);
  return [
    '- Scénarios d’urgence retenus :',
    ...context.operationalItems.slice(0, 12).map((item) => `  - ${truncateCell(item.element, 120)}`),
  ].join('\n');
}

function piuOperationalProcedures(context) {
  const items = context.operationalItems.filter((item) =>
    item.parts.some((part) => ['scénarios d’urgence', 'alerte', 'évacuation', 'moyens d’intervention'].includes(part)),
  );
  if (!items.length) return field('Procédures issues des analyses retenues', IMPORT);
  return markdownTable([
    ['Situation opérationnelle', 'Action PIU courte', 'Source'],
    ...items.slice(0, 10).map((item) => [
      truncateCell(item.element, 90),
      operationalActionForItem(item),
      truncateCell(item.analysisTitle, 70),
    ]),
  ]);
}

function piuAnnexesToPlan(context) {
  const annexes = context.excludedItems.filter((item) => item.destination === 'annexe');
  if (!annexes.length) return field('Annexes PIU à prévoir', IMPORT);
  return markdownTable([
    ['Annexe à prévoir', 'Raison'],
    ...annexes.slice(0, 8).map((item) => [truncateCell(item.element, 90), truncateCell(item.reason, 90)]),
  ]);
}

function piuReorientedItems(context) {
  if (!context.excludedItems.length) {
    return field('Éléments écartés du PIU et réorientés', 'Aucun élément importé écarté à ce stade.');
  }
  return [
    '### Éléments écartés du PIU et réorientés',
    '',
    markdownTable([
      ['Élément', 'Raison de l’écart', 'Destination recommandée'],
      ...context.excludedItems.slice(0, 20).map((item) => [
        truncateCell(item.element, 90),
        truncateCell(item.reason, 90),
        item.destination,
      ]),
    ]),
  ].join('\n');
}

function normalizeRiskAnalyses(analyses) {
  return (Array.isArray(analyses) ? analyses : []).filter(Boolean).map((analysis) =>
    typeof analysis === 'object' && !Array.isArray(analysis) ? analysis : { title: formatValue(analysis) },
  );
}

function itemToAnalysis(item, index) {
  const text = importedItemText(item);
  return {
    reference: typeof item === 'object' && item ? item.reference : undefined,
    documentType: 'Élément PIU importé',
    title: text || `Élément PIU importé ${index + 1}`,
    markdown: text,
  };
}

function analysisTitle(analysis, index) {
  return firstKnown(
    clean(analysis.documentType),
    clean(analysis.title),
    clean(analysis.reference),
    `Analyse de risques ${index + 1}`,
  );
}

function analysisText(analysis) {
  return [
    analysis.reference,
    analysis.documentType,
    analysis.title,
    analysis.markdown,
    analysis.riskProfile,
  ].map(rawTextValue).join('\n');
}

function matchingEmergencyPatterns(lower) {
  return EMERGENCY_PATTERNS.filter(([pattern]) => lower.includes(normalizeText(pattern)));
}

function matchingNonOperationalPatterns(lower) {
  return NON_OPERATIONAL_PATTERNS.filter((pattern) => lower.includes(normalizeText(pattern)));
}

function conditionForAnalysis(lower, formData, analysis) {
  if (!CONDITIONAL_PATTERNS.some((pattern) => lower.includes(normalizeText(pattern)))) return '';
  const confirmed = conditionConfirmed('', formData, analysis);
  return confirmed ? 'Condition confirmée dans les données fournies.' : 'À intégrer seulement si le cas est confirmé.';
}

function conditionConfirmed(condition, formData, analysis) {
  const text = normalizeText([
    condition,
    analysisText(analysis || {}),
    formData?.riskProfile,
    formData?.companyProfile,
  ].map(formatValue).join(' '));
  return /confirm|présent|present|applicable|oui|existe|modéré|modere|élevé|eleve|critique/.test(text);
}

function analysisDecision({ hasEmergency, hasOnlyNonOperational, condition }) {
  if (hasEmergency && condition) return PIU_CONDITIONAL;
  if (hasEmergency) return PIU_RELEVANT;
  if (hasOnlyNonOperational) return PIU_NOT_RELEVANT;
  return PIU_NOT_RELEVANT;
}

function whyForDecision(decision, matches, nonOperationalMatches) {
  if (decision === PIU_NOT_RELEVANT) {
    if (nonOperationalMatches.length) return 'Éléments de preuve, contrôle ou action prévention sans conduite d’urgence.';
    return 'Aucun scénario d’urgence opérationnel exploitable pour le PIU.';
  }
  const labels = matches.map(([pattern]) => pattern).slice(0, 3).join(', ');
  return `Contient des éléments opérationnels : ${labels}.`;
}

function partsForDecision(decision) {
  return decision === PIU_NOT_RELEVANT ? ['annexes PIU'] : ['scénarios d’urgence'];
}

function extractOperationalItems(analysis) {
  return extractMeaningfulLines(analysisText(analysis))
    .filter((line) => isOperationalEmergency(line) && !isNonOperationalItem(line))
    .map((line) => ({
      element: normalizeLine(line),
      why: 'Situation d’urgence opérationnelle.',
      parts: partsForText(line),
      destination: 'PIU',
    }))
    .slice(0, 12);
}

function extractExcludedItems(analysis) {
  return extractMeaningfulLines(analysisText(analysis))
    .filter((line) => isNonOperationalItem(line) || !isOperationalEmergency(line))
    .filter((line) => isLikelyActionOrEvidence(line))
    .map((line) => ({
      element: normalizeLine(line),
      reason: isNonOperationalItem(line)
        ? 'Élément de preuve, contrôle ou action prévention.'
        : 'Pas une situation d’urgence opérationnelle.',
      destination: destinationForExcludedItem(line),
    }))
    .slice(0, 12);
}

function filterImportedPiuItems(items, classifications) {
  const relevantText = normalizeText(classifications
    .filter((classification) => classification.decision !== PIU_NOT_RELEVANT)
    .map((classification) => analysisText(classification.source))
    .join(' '));

  return (Array.isArray(items) ? items : []).reduce((result, item) => {
    const element = importedItemText(item);
    if (!element) return result;
    const matchesRelevantAnalysis = !classifications.length || relevantText.includes(firstKeyword(element));
    if (isOperationalEmergency(element) && matchesRelevantAnalysis && !isNonOperationalItem(element)) {
      result.kept.push({ element, parts: partsForText(element), analysisTitle: 'Élément PIU importé' });
    } else {
      result.excluded.push({
        element,
        reason: isOperationalEmergency(element)
          ? 'Aucune analyse pertinente confirmée ne permet de l’utiliser.'
          : 'Pas une situation d’urgence opérationnelle.',
        destination: destinationForExcludedItem(element),
      });
    }
    return result;
  }, { kept: [], excluded: [] });
}

function importedItemText(item) {
  if (typeof item === 'string') return clean(item);
  if (!item || typeof item !== 'object') return '';
  return clean(firstKnown(item.title, item.element, item.label, item.description, item.action, item.text));
}

function extractMeaningfulLines(text) {
  return String(text || '')
    .split(/\r?\n|[.;]/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length >= 6)
    .filter((line) => line.length <= 220);
}

function isOperationalEmergency(text) {
  const lower = normalizeText(text);
  return matchingEmergencyPatterns(lower).length > 0;
}

function isNonOperationalItem(text) {
  const lower = normalizeText(text);
  return matchingNonOperationalPatterns(lower).length > 0;
}

function isLikelyActionOrEvidence(text) {
  const lower = normalizeText(text);
  return isNonOperationalItem(text) || /pgp|paa|annexe|registre|action|preuve|rapport|pv|formation|contrôle|controle/.test(lower);
}

function destinationForExcludedItem(text) {
  const lower = normalizeText(text);
  if (/pv|rapport|plan|preuve|attestation|sect/.test(lower)) return 'annexe';
  if (/registre|validation|contrôle|controle/.test(lower)) return 'registre de suivi';
  if (/danger|risque|exposition/.test(lower)) return 'analyse de risques';
  return 'PGP';
}

function partsForText(text) {
  const lower = normalizeText(text);
  const parts = unique(matchingEmergencyPatterns(lower).flatMap(([, matchedParts]) => matchedParts));
  return parts.length ? parts : ['scénarios d’urgence'];
}

function operationalActionForItem(item) {
  const text = normalizeText(item.element);
  if (text.includes('coupure')) return 'Identifier la coupure. Informer les secours.';
  if (text.includes('incendie')) return 'Alerter. Évacuer. Accueillir les secours.';
  if (text.includes('malaise') || text.includes('accident')) return 'Protéger. Appeler le 112. Alerter un secouriste.';
  if (text.includes('gaz')) return 'Évacuer la zone. Appeler le 112 depuis un lieu sûr.';
  return 'Alerter. Protéger les personnes. Suivre la fiche réflexe.';
}

function firstKeyword(text) {
  return normalizeText(text).split(/\s+/).find((word) => word.length >= 6) || normalizeText(text);
}

function normalizeLine(line) {
  return truncateCell(line.replace(/\s+/g, ' ').trim(), 140);
}

function truncateCell(value, maxLength) {
  const text = formatValue(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;
}

function clean(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text === COMPLETE ? '' : text;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueObjects(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const aliases = {
    companyName: ['companyName'],
    siteName: ['siteName'],
    buildingName: ['buildingName'],
    address: ['address'],
    postalCode: ['postalCode'],
    city: ['city'],
    country: ['country'],
    preventionAdvisor: ['preventionAdvisor'],
    siteManager: ['siteManager', 'responsibleSite'],
    siteContact: ['siteContact', 'receptionContact', 'frontDeskContact'],
    technicalServiceContact: ['technicalServiceContact', 'technicalService'],
    generalPhone: ['generalPhone', 'phone', 'sitePhone'],
    generalEmail: ['generalEmail', 'email', 'siteEmail'],
    activityDescription: ['activityDescription', 'activities', 'mainActivities'],
    numberOfWorkers: ['numberOfWorkers', 'workersCount', 'effectif'],
    visitorsPresence: ['visitorsPresence', 'presenceOfVisitors'],
    externalCompaniesPresence: ['externalCompaniesPresence', 'thirdPartiesPresence', 'presenceOfThirdParties'],
    workingHours: ['workingHours', 'openingHours'],
    emergencyManager: ['emergencyManager'],
    assemblyPoint: ['assemblyPoint'],
    pmrProcedure: ['pmrProcedure'],
    firefighterFileLocation: ['firefighterFileLocation'],
    fireAlarmSystem: ['fireAlarmSystem'],
    gasShutoff: ['gasShutoff'],
    electricityShutoff: ['electricityShutoff'],
    waterShutoff: ['waterShutoff'],
    ventilationShutoff: ['ventilationShutoff'],
    emergencyScenarios: ['emergencyScenarios'],
    availablePlans: ['availablePlans'],
  };
  return Object.fromEntries(Object.entries(aliases).map(([name, keys]) => [name, formatValue(firstInput(input, keys))]));
}

function firstKnown(...values) {
  return values.find((value) => value && value !== COMPLETE) || COMPLETE;
}

function firstInput(input, keys) {
  for (const key of keys) {
    if (input[key] !== null && input[key] !== undefined && input[key] !== '') return input[key];
  }
  return undefined;
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

function rawTextValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(rawTextValue).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => `${key} : ${rawTextValue(entry)}`).join('\n');
  }
  return String(value).replace(/\|/g, '\\|').trim();
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function normalizeLanguage(language) {
  return String(language || 'fr').trim().toLowerCase().split(/[-_]/)[0];
}

export { CHAPTER_TITLES, REFLEX_SHEETS };
