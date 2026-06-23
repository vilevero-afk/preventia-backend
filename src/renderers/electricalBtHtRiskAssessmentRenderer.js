import { getField } from './specializedRiskFields.js';
import { cleanSpecializedRiskMarkdown } from './specializedRiskAiEnrichment.js';
import {
  extractScenarioValue,
  getScenarioText,
  setFromScenario,
  splitScenarioList,
} from './specializedRiskScenario.js';

const MISSING = '[à vérifier sur site]';
const VERIFY = '[à vérifier sur site]';
const PROOF = '[preuve à obtenir]';
const VALIDATION = '[validation requise]';

const DOCUMENT_EVIDENCE = [
  'Schémas unifilaires',
  'Plans de situation',
  'Plans des tableaux',
  'Dossier technique',
  'PV RGIE',
  'Rapports de l’organisme agréé',
  'Rapports de thermographie',
  'Liste BA4/BA5',
  'Procédures de consignation',
  'Registre des interventions',
  'Notices des constructeurs',
  'Preuve d’entretien',
  'Preuve des tests différentiels',
  'Affichage des premiers soins',
  'Signalisation',
  'Liste des contacts d’urgence',
];

const GENERAL_RISKS = [
  ['Contact direct', 'Pièces actives accessibles ou enveloppe ouverte.', 'Électrisation, électrocution, brûlure.', 'Vérifier obturations, capots, enveloppes, verrouillage, accès limité et signalisation.', 'Photos des enveloppes et contrôle des obturations.'],
  ['Contact indirect', 'Masse mise accidentellement sous tension.', 'Électrisation, électrocution.', 'Vérifier continuité PE, liaisons équipotentielles, différentiels et conclusions du PV RGIE.', 'PV RGIE et preuves des tests différentiels.'],
  ['Arc électrique', 'Manœuvre, défaut ou intervention près de pièces actives.', 'Brûlure grave, projection, incendie.', 'Limiter les manœuvres, réserver l’accès BA4/BA5, définir EPI, consignation et intervention spécialisée.', 'Instructions de manœuvre, désignations BA4/BA5 et procédure de consignation.'],
  ['Décharge électrique', 'Décharge statique ou décharge d’un composant.', 'Choc, brûlure, mouvement réflexe.', 'Identifier les composants stockant l’énergie et appliquer une méthode de décharge contrôlée.', 'Notice constructeur et instruction d’intervention.'],
  ['Propagation du potentiel', 'Défaut de terre ou liaisons équipotentielles insuffisantes.', 'Tension de contact dangereuse à distance.', 'Contrôler prises de terre, conducteurs de protection et équipotentialité des masses.', 'Mesures de terre et rapport de contrôle.'],
  ['Énergie accumulée / condensateurs', 'Énergie résiduelle après coupure.', 'Décharge, arc électrique, brûlure.', 'Vérifier procédures de décharge, temps d’attente et notice constructeur.', 'Procédure de décharge et notice constructeur.'],
  ['Surtension', 'Foudre, commutation ou défaut du réseau.', 'Dégradation, incendie, indisponibilité.', 'Vérifier protections, parafoudres si nécessaires, historique des incidents et équipements sensibles.', 'Schéma des protections et historique des incidents.'],
  ['Surintensité', 'Surcharge ou court-circuit.', 'Échauffement, arc, incendie.', 'Vérifier calibres, sélectivité, échauffements, serrage et thermographie.', 'Note de sélectivité, relevés de charge et rapport thermographie.'],
  ['Baisse de tension / réapparition', 'Redémarrage non maîtrisé au retour de la tension.', 'Mouvement dangereux, dommage matériel.', 'Vérifier redémarrage intempestif, minima de tension et comportement des équipements de travail.', 'Essais fonctionnels et notices des équipements raccordés.'],
  ['Échauffement', 'Connexion desserrée, surcharge ou ventilation insuffisante.', 'Brûlure, dégradation, incendie.', 'Vérifier charge, ventilation, connexions, poussières et thermographie.', 'Rapport thermographie et relevé des charges.'],
  ['Brûlure', 'Contact chaud, arc ou projection de métal.', 'Lésion thermique.', 'Identifier les surfaces chaudes, limiter l’approche et définir les protections adaptées.', 'Constat photographique et instruction de travail.'],
  ['Incendie', 'Défaut électrique, échauffement ou arc.', 'Atteinte aux personnes et aux biens.', 'Écarter les combustibles, traiter les échauffements et coordonner coupure et moyens d’intervention.', 'Plan de coupure, rapport thermographie et consignes PIU.'],
  ['Explosion', 'Arc ou étincelle en atmosphère explosive.', 'Explosion, brûlure, projection.', 'Identifier les zones potentiellement ATEX et faire vérifier l’adéquation du matériel.', 'Document relatif à la protection contre les explosions, si applicable.'],
  ['Défaut de commande', 'Dysfonctionnement d’un organe ou circuit de commande.', 'Mise en marche ou arrêt non maîtrisé.', 'Vérifier organes de commande, arrêts d’urgence et circuits de commande.', 'Rapport d’essais des commandes et arrêts d’urgence.'],
  ['Défaut de protection', 'Protection absente, inadaptée ou mal réglée.', 'Non-déclenchement et aggravation du dommage.', 'Comparer réglages, pouvoir de coupure et caractéristiques des circuits protégés.', 'Schémas, réglages et note de calcul.'],
  ['Absence ou défaut de consignation', 'Intervention sans séparation ni vérification.', 'Remise sous tension, électrocution, arc.', 'Formaliser séparation, condamnation, VAT et information des entreprises extérieures.', 'Procédure signée, matériel de condamnation et enregistrements.'],
  ['Accès non autorisé', 'Accès d’une personne non qualifiée.', 'Contact électrique ou manœuvre dangereuse.', 'Organiser gestion des clés, liste des personnes autorisées et signalisation.', 'Registre des clés et liste d’autorisations.'],
  ['Défaut de signalisation', 'Tension, danger ou tableau non identifié.', 'Erreur de manœuvre ou d’intervention.', 'Identifier tensions, tableaux, circuits, coupures et restrictions d’accès.', 'Photos datées et plan de repérage.'],
  ['Absence de schéma', 'Circuit ou organe de coupure mal identifié.', 'Erreur, délai d’urgence, consignation incomplète.', 'Mettre à jour schémas unifilaires, plans des tableaux et repérage des circuits.', 'Schémas datés et validés par une personne compétente.'],
  ['Intervention d’une entreprise extérieure', 'Coordination et limites d’intervention insuffisantes.', 'Exposition croisée, remise sous tension.', 'Définir accueil, responsabilités, consignation partagée et échange des risques.', 'Permis de travail et preuve de coordination.'],
  ['Équipement de travail non conforme ou mal raccordé', 'Puissance ou protection non adaptée.', 'Choc, incendie, démarrage intempestif.', 'Vérifier puissance, protection, arrêt d’urgence et protection contre le redémarrage.', 'Notice, schéma de raccordement et essai fonctionnel.'],
];

const COMPETENCIES = [
  ['Accès aux armoires BT', 'Désignation et connaissance des risques BT', 'Personnel autorisé, BA4/BA5 selon la tâche'],
  ['Accès à la cabine HT', 'Formation BA4/BA5 spécifique à la cabine HT', 'Personnel expressément autorisé'],
  ['Manœuvre simple', 'Instruction écrite et limites de manœuvre', 'Personnes désignées'],
  ['Réarmement', 'Diagnostic préalable et procédure autorisée', 'Personnel désigné et compétent'],
  ['Consignation', 'Procédure, condamnation et vérification d’absence de tension', 'Personnel BA5 autorisé'],
  ['Intervention', 'Qualification adaptée à l’installation et à la tâche', 'Électricien ou société spécialisée'],
  ['Nettoyage', 'Méthode sûre et limites d’approche', 'Personnel formé ou société spécialisée'],
  ['Maintenance', 'Compétence technique documentée', 'Service spécialisé'],
  ['Contrôle', 'Compétence réglementaire requise', 'Organisme agréé si requis'],
  ['Accompagnement de l’organisme agréé', 'Connaissance du site et des installations', 'Personne habilitée désignée'],
];

/**
 * Rend une aide déterministe à l'analyse des risques électriques BT/HT.
 * Les langues autres que le français reçoivent la version française signalée comme telle.
 */
export function renderElectricalBtHtRiskAssessmentMarkdown(formData = {}, language = 'fr') {
  const input = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {};
  const data = resolveElectricalScenarioData(input);
  const translationNotice = normalizeLanguage(language) === 'fr'
    ? ''
    : '> Traduction à prévoir — version française générée.';

  return cleanSpecializedRiskMarkdown([
    '# Analyse de risques — Installations électriques BT/HT',
    '',
    '**Aide au conseiller en prévention — projet à vérifier, compléter et valider**',
    translationNotice,
    '',
    '> Cette analyse suit l’esprit du Code du bien-être au travail, notamment son article III.2-3. Elle doit débuter dès la conception, associer le futur utilisateur et intégrer les équipements de travail raccordés. Elle doit être mise à jour lors de la réception technique et de toute modification de l’installation ou de son usage.',
    '',
    '> Elle ne remplace jamais une réception RGIE, un contrôle par un organisme agréé, une analyse finale validée par l’employeur, l’avis du conseiller en prévention ni l’avis du CPPT ou du comité compétent.',
    '',
    identificationSection(data),
    '',
    scopeSection(data),
    '',
    evidenceSection(data),
    '',
    exposedPersonsSection(data),
    '',
    competenciesSection(data),
    '',
    generalRisksSection(data),
    '',
    lowVoltageSection(data),
    '',
    highVoltageSection(data),
    '',
    workEquipmentSection(data),
    '',
    preventionMeasuresSection(data),
    '',
    paaPgpSection(data),
    '',
    diuSection(data),
    '',
    piuSection(data),
    '',
    actionPlanSection(data),
    '',
    validationsSection(),
    '',
    limitsSection(),
    '', finalSections(),
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n').trim()) + '\n';
}

function identificationSection(data) {
  return section('1. Identification', table(
    ['Élément', 'Valeur'],
    [
      ['Entreprise', pick(data, ['companyName', 'enterpriseName', 'organisationName', 'organizationName', 'entreprise', 'company'])],
      ['Site / bâtiment', pick(data, ['siteName', 'buildingName', 'workplaceName', 'locationName', 'site', 'batiment'])],
      ['Adresse', joinAddress(data)],
      ['Personne de contact', pick(data, ['contactPerson', 'siteContact', 'contactName', 'personneContact', 'contact'])],
      ['Conseiller en prévention', pick(data, ['preventionAdvisor', 'preventionAdvisorName', 'conseillerPrevention'])],
      ['Responsable du site', pick(data, ['siteManager', 'manager', 'responsible'])],
      ['Service technique', pick(data, ['technicalServiceContact', 'technicalService', 'maintenanceContact'])],
      ['Type d’installation : basse tension / haute tension / mixte', pick(data, ['installationType', 'typeInstallation'])],
      ['Installation nouvelle / existante / modification', pick(data, ['installationStatus', 'statutInstallation'])],
      ['Stade : conception / réalisation / réception / exploitation / modification', pick(data, ['analysisStage', 'stage', 'projectStage', 'stade'])],
      ['Date de visite ou d’analyse', pick(data, ['assessmentDate', 'visitDate', 'dateAnalyse', 'dateVisite'])],
      ['Auteur de l’aide', pick(data, ['author', 'createdBy', 'preventionAdvisor', 'auteur'])],
      ['Synthèse du contexte', pick(data, ['contextSummary'], VERIFY)],
    ],
  ) + '\n\n> Limite importante : Ce document constitue une aide à l’analyse pour le conseiller en prévention. Il doit être vérifié, complété et validé par les personnes compétentes avant utilisation.');
}

function scopeSection(data) {
  const rows = [
    ['Armoires BT concernées', ['hasLowVoltageCabinet', 'lowVoltageCabinets', 'lowVoltageCabinet', 'armoiresBt']],
    ['Coffrets concernés', ['electricalEnclosures', 'coffrets']],
    ['Cabine HT concernée', ['hasHighVoltageCabin', 'highVoltageCabin', 'highVoltageCabinPresent', 'cabineHt']],
    ['Transformateur', ['hasTransformer', 'transformer', 'transformateur']],
    ['TGBT', ['hasMainLowVoltagePanel', 'mainLowVoltagePanel', 'mainLowVoltageBoard', 'tgbt']],
    ['Tableaux divisionnaires', ['distributionBoards', 'tableauxDivisionnaires']],
    ['Circuits spécifiques', ['specificCircuits', 'circuitsSpecifiques']],
    ['Équipements de travail raccordés', ['connectedWorkEquipment', 'workEquipment', 'equipementsRaccordes']],
    ['Zones concernées', ['concernedAreas', 'areas', 'zonesConcernees']],
    ['Plans disponibles', ['availablePlans', 'plansDisponibles']],
    ['PV RGIE disponible', ['rgieReportAvailable', 'rgieReport', 'pvRgieDisponible']],
    ['Dernier contrôle périodique disponible', ['periodicInspectionAvailable', 'periodicInspection', 'lastPeriodicInspection', 'dernierControlePeriodique']],
    ['Liste BA4/BA5 disponible', ['ba4Ba5ListAvailable', 'ba4Ba5List']],
    ['Procédure de consignation disponible', ['lockoutProcedureAvailable', 'lockoutProcedure', 'consignationProcedure']],
    ['Rapport thermographie disponible', ['thermographyReportAvailable', 'thermographyReport']],
    ['Remarques ouvertes du contrôle', ['openInspectionRemarks', 'openRemarks', 'remarquesControle']],
    ['Risques principaux signalés', ['mainRisks']],
    ['Points à vérifier signalés', ['pointsToCheck']],
    ['Mesures prévues', ['plannedMeasures']],
    ['Preuves à collecter', ['evidenceToCollect']],
  ].map(([label, keys]) => [label, pick(data, keys)]);
  return section('2. Périmètre de l’installation', table(['Élément', 'Information'], rows));
}

function evidenceSection(data) {
  const supplied = Array.isArray(data.documents) ? data.documents : [];
  const rows = DOCUMENT_EVIDENCE.map((name) => {
    const item = supplied.find((entry) => normalize(entry?.name || entry?.document).includes(normalize(name)));
    return [name, value(item?.available, MISSING), value(item?.requested, PROOF), value(item?.comment, MISSING)];
  });
  return section('3. Documents et preuves à consulter', table(
    ['Document / preuve', 'Disponible oui/non', 'À demander', 'Commentaire'],
    rows,
  ));
}

function exposedPersonsSection(data) {
  const supplied = splitScenarioList(pick(data, ['exposedPersons', 'personnesExposees'], ''));
  if (supplied.length) {
    return section('4. Personnes exposées', supplied.map((person) => `- ${person}`).join('\n'));
  }
  const populations = [
    'Personnel non électricien', 'Personnel d’entretien', 'Personnel BA4', 'Personnel BA5',
    'Entreprises extérieures', 'Nettoyage', 'Secours', 'Visiteurs', 'Occupants du bâtiment',
  ];
  return section('4. Personnes exposées', [
    ...populations.map((person) => `- ${person} : ${VERIFY}`),
    `- Informations fournies : ${pick(data, ['exposedPersons', 'personnesExposees'])}`,
  ].join('\n'));
}

function competenciesSection(data) {
  const rows = COMPETENCIES.map(([activity, expected, authorized]) => [
    activity, expected, authorized, PROOF, VERIFY,
  ]);
  const notes = pick(data, ['competencies', 'habilitations', 'ba4Ba5List']);
  return section('5. Compétences et habilitations', `${table(
    ['Activité', 'Compétence attendue', 'Personnes autorisées', 'Formation/preuve', 'Point à vérifier'],
    rows,
  )}\n\nInformations fournies : ${notes}`);
}

function generalRisksSection(data) {
  const suppliedMeasures = pick(data, ['existingMeasures', 'mesuresExistantes'], VERIFY);
  const rows = GENERAL_RISKS.map(([danger, situation, potential, measure, proof]) => [
    danger,
    VERIFY,
    situation,
    potential,
    `Dispositifs associés à ce danger : ${VERIFY}`,
    measure,
    pick(data, ['defaultPriority', 'prioriteParDefaut'], MISSING),
    proof,
    VALIDATION,
  ]);
  return section('6. Analyse des risques généraux électriques', `${table(
    ['Danger / situation dangereuse', 'Personnes exposées', 'Situation à vérifier', 'Risque potentiel', 'Mesures existantes', 'Mesures complémentaires proposées', 'Priorité', 'Preuve à obtenir', 'Statut'],
    rows,
  )}\n\nMesures existantes déclarées dans le formulaire : ${suppliedMeasures}`);
}

function lowVoltageSection(data) {
  const site = pick(data, ['siteName'], 'le site analysé');
  const tgbtValue = pick(data, ['tgbt', 'hasMainLowVoltagePanel'], '');
  const boardsValue = pick(data, ['distributionBoards'], '');
  const tgbt = tgbtValue ? describeAsset('le TGBT', tgbtValue) : 'le TGBT';
  const boards = boardsValue ? describeAsset('les tableaux divisionnaires', boardsValue) : 'les tableaux divisionnaires';
  const technicalService = pick(data, ['technicalServiceContact', 'technicalService'], 'service technique');
  const siteDescription = /^site\b/i.test(site) ? `${site[0].toLowerCase()}${site.slice(1)}` : `site ${site}`;
  const authorizedService = /service technique/i.test(technicalService)
    ? technicalService
    : `service technique (${technicalService})`;
  const thermography = pick(data, ['thermographyReportAvailable', 'thermographyReport'], '');
  const items = [
    ['Accès aux armoires et coffrets', `${tgbt} et ${boards} du ${siteDescription} doivent rester accessibles uniquement au ${authorizedService} et aux intervenants autorisés. La liste des personnes BA4/BA5 doit être demandée et reliée à la procédure de consignation.`],
    ['Fermeture / verrouillage', 'Maintenir les armoires et coffrets fermés à clé. Contrôler la gestion des clés.'],
    ['Signalisation', 'Afficher la tension et le pictogramme de danger électrique.'],
    ['Identification des tableaux', 'Afficher un nom unique et lisible sur chaque tableau.'],
    ['État général', 'Contrôler enveloppes, portes, obturations et contacts accessibles.'],
    ['Protections', 'Vérifier l’adéquation et le réglage des relais d’intensité et autres protections.'],
    ['Différentiels', 'Tester les dispositifs différentiels. Conserver la preuve du test.'],
    ['Borniers', 'Contrôler les borniers et leur protection contre le contact direct.'],
    ['Connexions', 'Contrôler le serrage des connexions avec une méthode adaptée.'],
    ['Thermographie', thermography && !isUnavailable(thermography)
      ? `Le statut fourni est : ${thermography}. Vérifier la portée et la date du rapport, notamment pour ${tgbt}, ${boards} et les circuits fortement sollicités.`
      : `Aucun rapport de thermographie n’est disponible dans les données fournies. Une campagne de thermographie est à planifier en priorité sur ${tgbt}, ${boards} et les circuits fortement sollicités.`],
    ['Propreté / poussières', 'Faire réaliser le dépoussiérage par du personnel compétent.'],
    ['Consignation', 'Consigner avant intervention. Séparer, condamner et vérifier l’absence de tension.'],
    ['Interventions', 'Réserver les interventions au personnel autorisé et qualifié.'],
    ['Entretien', 'Confier l’entretien et les appareils de mesure à un service spécialisé.'],
    ['Contrôles périodiques', 'Conserver les rapports. Lever rapidement les remarques applicables.'],
    ['Actions proposées', 'Prioriser verrouillage, protection des contacts, signalisation, serrage, tests différentiels et thermographie.'],
  ];
  return specificSection('7. Analyse spécifique basse tension', items, pick(data, ['lowVoltageObservations', 'observationsBt']));
}

function highVoltageSection(data) {
  const cabin = pick(data, ['hasHighVoltageCabin', 'highVoltageCabin'], '');
  const transformer = pick(data, ['hasTransformer', 'transformer'], '');
  if (!cabin || isUnavailable(cabin) || isUnknown(cabin)) {
    return section('8. Analyse spécifique haute tension', [
      'Cabine HT non connue à ce stade. L’existence d’une cabine HT ou d’un transformateur doit être confirmée avant validation.',
      '',
      'Si une cabine HT est présente, appliquer les exigences d’accès réservé, BA4/BA5 spécifique, signalisation, contrôle par organisme agréé, entretien spécialisé et surveillance.',
      '',
      `Information cabine fournie : ${cabin || VERIFY}. Information transformateur fournie : ${transformer || VERIFY}.`,
    ].join('\n'));
  }
  const items = [
    ['Accès au local HT', 'Réserver l’accès au personnel qualifié. Rendre le local inaccessible aux personnes non autorisées.'],
    ['Formation BA4/BA5 spécifique cabine', 'Documenter une formation adaptée à la cabine HT et aux manœuvres autorisées.'],
    ['Verrouillage', 'Maintenir le local fermé. Maîtriser les clés et autorisations.'],
    ['Signalisation', 'Afficher la tension, le pictogramme, le distributeur et les contacts d’urgence.'],
    ['Tensions de service', 'Identifier clairement les tensions présentes.'],
    ['Transformateur', 'Vérifier l’état, la protection, la ventilation et les accès.'],
    ['Liquide diélectrique si applicable', 'Identifier le produit, les fuites possibles et les mesures environnementales et incendie.'],
    ['Contacts urgence', 'Afficher des contacts actuels et testés.'],
    ['Affichage premiers soins', 'Afficher les instructions de premiers soins adaptées au risque électrique.'],
    ['Entretien spécialisé', 'Faire réaliser le nettoyage complet et l’entretien par une société spécialisée. Prévoir le resserrage des connexions ou une thermographie adaptée.'],
    ['Contrôle organisme agréé', 'Prévoir le contrôle avant mise en service, annuellement et après modification notable.'],
    ['Visite mensuelle de surveillance', 'Faire réaliser et tracer la surveillance mensuelle par du personnel habilité.'],
    ['Interdiction d’intervention par personnel non habilité', 'Interdire tout travail HT au personnel non autorisé.'],
    ['Mesures conservatoires', 'Donner rapidement suite aux remarques. Prendre des mesures conservatoires immédiates en cas de danger.'],
    ['Actions proposées', 'Prioriser l’accès, la signalisation, le contrôle agréé, la surveillance et l’entretien spécialisé.'],
  ];
  return specificSection('8. Analyse spécifique haute tension', items, pick(data, ['highVoltageObservations', 'observationsHt']));
}

function workEquipmentSection(data) {
  const equipment = normalizeRows(data.workEquipment || data.connectedWorkEquipment || data.equipementsRaccordes);
  const rows = equipment.length ? equipment.map((item) => [
    item.name || item.equipment || item.equipement || MISSING,
    item.power || item.puissance || MISSING,
    item.suitableProtection || item.protectionAdaptee || VERIFY,
    item.emergencyStop || item.arretUrgence || VERIFY,
    item.minimumVoltageProtection || item.protectionMinimaTension || VERIFY,
    item.risk || item.risque || VERIFY,
    item.proposedMeasure || item.mesureProposee || MISSING,
    item.proof || item.preuve || PROOF,
  ]) : [[MISSING, MISSING, VERIFY, VERIFY, VERIFY, VERIFY, MISSING, PROOF]];
  return section('9. Équipements de travail raccordés', `${table(
    ['Équipement', 'Puissance connue', 'Protection adaptée', 'Arrêt d’urgence', 'Protection minima de tension', 'Risque identifié', 'Mesure proposée', 'Preuve à obtenir'],
    rows,
  )}\n\n> L’analyse doit tenir compte des équipements de travail raccordés et de leur puissance. Les non-conformités des équipements peuvent nécessiter une adaptation de l’installation électrique.`);
}

function preventionMeasuresSection(data) {
  const rows = preventionActions(data).map((action) => [
    action.measure, action.origin, action.priority, action.responsible,
    action.deadline, action.proof, action.destination, action.status,
  ]);
  return section('10. Mesures de prévention proposées', table(
    ['Mesure', 'Origine du risque', 'Priorité', 'Responsable', 'Délai', 'Preuve attendue', 'Destination possible : PAA / PGP / DIU / PIU', 'Statut'],
    rows,
  ));
}

function paaPgpSection(data) {
  return section('11. Points à intégrer au PAA / PGP', `${bulletList([
    'Planifier les contrôles réglementaires et techniques.',
    'Planifier l’entretien spécialisé.',
    'Actualiser les formations et désignations BA4/BA5.',
    'Mettre en conformité la signalisation.',
    'Contrôler le verrouillage des armoires, coffrets et locaux.',
    'Programmer la thermographie.',
    'Mettre à jour les schémas.',
    'Créer ou réviser les procédures de consignation.',
    'Lever les remarques de l’organisme agréé.',
    'Contrôler les accès.',
    'Afficher les instructions de premiers soins.',
    'Organiser des exercices ou une sensibilisation.',
  ])}\n\nÉléments fournis dans le scénario : ${pick(data, ['paaPgpLinks'], VERIFY)}`);
}

function diuSection(data) {
  return section('12. Points à intégrer au DIU', `${bulletList([
    'Localisation des armoires et de la cabine.',
    'Localisation et fonction des coupures.',
    'Restrictions d’accès.',
    'Présence de haute tension.',
    'Présence et caractéristiques du transformateur.',
    'Contraintes de consignation.',
    'Zones à risque électrique.',
    'Plans et schémas à tenir à jour.',
    'Consignes applicables aux entreprises extérieures.',
  ])}\n\nÉléments fournis dans le scénario : ${pick(data, ['diuLinks'], VERIFY)}`);
}

function piuSection(data) {
  return section('13. Points utiles pour le PIU', `${bulletList([
    'Localisation de la coupure générale.',
    'Accès au local HT.',
    'Accès au TGBT.',
    'Contacts du distributeur.',
    'Contacts d’urgence internes.',
    'Risque d’incendie électrique.',
    'Consignes aux secours.',
    'Localisation du dossier technique.',
    'Personne habilitée à contacter.',
  ])}\n\nÉléments fournis dans le scénario : ${pick(data, ['piuLinks'], VERIFY)}`);
}

function actionPlanSection(data) {
  const rows = preventionActions(data).map((action, index) => [
    index + 1, action.measure, action.priority, action.responsible,
    action.deadline, action.proof, action.status,
  ]);
  return section('14. Plan d’action priorisé', table(
    ['N°', 'Action', 'Priorité', 'Responsable', 'Délai', 'Preuve', 'Statut'],
    rows,
  ));
}

function validationsSection() {
  return section('15. Avis et validations', [
    '- Avis du conseiller en prévention : [à compléter]',
    '- Avis CPPT / comité compétent : [à compléter]',
    '- Avis organisme agréé : [si applicable]',
    '- Validation employeur : [à compléter]',
  ].join('\n'));
}

function limitsSection() {
  return section('16. Limites', [
    'Cette analyse est une aide à la décision. Elle doit être adaptée au site, complétée par les constats réels, confrontée aux rapports de contrôle et validée par les personnes compétentes.',
    '',
    `Réception RGIE : ${PROOF}. Contrôle par organisme agréé : ${PROOF}. Avis du conseiller en prévention et du CPPT : ${VALIDATION}. Validation finale de l’employeur : ${VALIDATION}.`,
  ].join('\n'));
}

function finalSections() {
  return [
    section('17. Documents à créer ou à mettre à jour', bulletList([
      'Schémas unifilaires', 'Plans des tableaux', 'Liste BA4/BA5', 'Procédure de consignation',
      'Registre des interventions', 'Liste des contacts d’urgence', 'Procédure de coupure générale',
      'Dossier technique électrique',
    ])),
    section('18. Acteurs à consulter ou à impliquer', bulletList([
      'Conseiller en prévention', 'Service technique', 'Direction du site', 'Organisme agréé',
      'Entreprise spécialisée en électricité', 'Entreprises extérieures concernées', 'CPPT si applicable',
    ])),
    section('19. Annexes nécessaires', bulletList([
      'PV RGIE', 'Dernier contrôle périodique', 'Photos des armoires et du TGBT',
      'Rapport de thermographie', 'Liste BA4/BA5', 'Schémas', 'Plans de coupure', 'Fiches techniques',
    ])),
    section('20. Limites d’intervention du conseiller en prévention niveau 3', [
      '- Ne réalise pas une réception RGIE.',
      '- Ne valide pas la conformité électrique.',
      '- Ne réalise pas de mesures électriques spécialisées.',
      '- Formule une aide à l’identification des risques et au suivi des actions.',
    ].join('\n')),
    section('21. Points bloquants avant validation', bulletList([
      'Absence de PV RGIE', 'Absence de liste BA4/BA5', 'Absence de procédure de consignation',
      'Remarques ouvertes inconnues', 'Accès aux armoires non maîtrisé',
      'Absence de preuve de test différentiel', 'Absence de plan de coupure',
    ])),
    section('22. Conclusion', [
      `L’analyse reste à compléter sur site : ${VERIFY}.`,
      'Priorités : obtenir le PV RGIE, maîtriser les accès, formaliser la consignation et les désignations BA4/BA5, planifier la thermographie et mettre à jour les schémas.',
      `Les actions retenues sont à intégrer au PAA/PGP, au DIU et au PIU selon leur portée : ${VALIDATION}.`,
    ].join('\n\n')),
  ].join('\n\n');
}

function specificSection(title, items, observations) {
  const content = items.flatMap(([subtitle, sentence]) => [
    `### ${subtitle}`,
    '',
    `${sentence} ${VERIFY} ${PROOF} ${VALIDATION}`,
    '',
  ]);
  content.push(`Observations fournies : ${observations || MISSING}`);
  return section(title, content.join('\n').trim());
}

function preventionActions(data) {
  const responsible = pick(data, ['actionResponsible', 'responsableActions', 'responsibilities']);
  const deadline = pick(data, ['actionDeadline', 'delaiActions', 'deadlines']);
  return [
    ['Sécuriser les accès et le verrouillage BT/HT.', 'Accès non autorisé', 'Immédiate', 'PAA / PGP / DIU / PIU'],
    ['Lever les remarques ouvertes des contrôles.', 'Défaut de protection ou de conformité', 'Haute', 'PAA / PGP'],
    ['Mettre à jour les schémas et l’identification.', 'Erreur de manœuvre ou de consignation', 'Haute', 'PAA / PGP / DIU / PIU'],
    ['Formaliser la consignation et les autorisations.', 'Travaux électriques', 'Haute', 'PAA / PGP / DIU'],
    ['Vérifier les désignations et formations BA4/BA5.', 'Compétence insuffisante', 'Haute', 'PAA / PGP'],
    ['Planifier entretien, serrage et thermographie.', 'Échauffement et incendie', 'Moyenne', 'PAA / PGP'],
    ['Tester les différentiels et protections.', 'Contact indirect et défaut de protection', 'Haute', 'PAA / PGP'],
    ['Compléter la signalisation et les consignes d’urgence.', 'Défaut de signalisation', 'Moyenne', 'PAA / PIU'],
  ].map(([measure, origin, priority, destination]) => ({
    measure,
    origin,
    priority,
    responsible,
    deadline,
    proof: PROOF,
    destination,
    status: VALIDATION,
  }));
}

function section(title, body) {
  return `## ${title}\n\n${body}`;
}

function bulletList(items) {
  return items.map((item) => `- ${item} ${VERIFY} ${PROOF}`).join('\n');
}

function table(headers, rows) {
  return [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => escapeCell(value(cell))).join(' | ')} |`),
  ].join('\n');
}

function pick(data, keys, fallback = MISSING) {
  return getField(data, keys, fallback);
}

function joinValues(data, keys) {
  const values = keys.map((key) => value(data?.[key], '')).filter(Boolean);
  return values.length ? [...new Set(values)].join(' — ') : MISSING;
}

function joinAddress(data) {
  const direct = pick(data, ['address', 'siteAddress', 'workplaceAddress', 'fullAddress', 'adresseComplete'], '');
  if (direct) return direct;
  const city = [value(data.postalCode, ''), value(data.city || data.ville, '')].filter(Boolean).join(' ');
  const parts = [value(data.address || data.adresse, ''), city, value(data.country || data.pays, '')].filter(Boolean);
  return parts.length ? parts.join(', ') : MISSING;
}

function normalizeRows(input) {
  if (typeof input === 'string') return splitScenarioList(input).map((item) => ({ name: item }));
  if (!Array.isArray(input)) return [];
  return input.map((item) => typeof item === 'object' && item !== null ? item : { name: item });
}

function value(input, fallback = MISSING) {
  if (input === null || input === undefined || input === '') return fallback;
  if (typeof input === 'boolean') return input ? 'oui' : 'non';
  if (Array.isArray(input)) {
    const values = input.map((item) => value(item, '')).filter(Boolean);
    return values.length ? values.join(', ') : fallback;
  }
  if (typeof input === 'object') {
    const values = Object.entries(input).map(([key, item]) => `${key} : ${value(item, MISSING)}`);
    return values.length ? values.join('; ') : fallback;
  }
  return String(input).replace(/\r?\n/g, ' ').trim() || fallback;
}

function escapeCell(input) {
  return String(input).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function normalize(input) {
  return String(input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeLanguage(language) {
  return String(language || 'fr').trim().toLowerCase().split(/[-_]/)[0];
}

function resolveElectricalScenarioData(input) {
  const data = { ...input };
  const scenario = getScenarioText(input);

  setFromScenario(data, 'siteName', ['siteName', 'buildingName', 'workplaceName'], scenario, ['Site / bâtiment', 'Site']);
  if (!data.siteName) data.siteName = extractScenarioValue(scenario, ['Site administratif']);
  setFromScenario(data, 'technicalServiceContact', ['technicalServiceContact', 'technicalService'], scenario, ['Service technique']);
  setFromScenario(data, 'analysisStage', ['analysisStage', 'stage'], scenario, ['Stade de l’analyse', 'Stade']);
  setFromScenario(data, 'lowVoltageCabinets', ['hasLowVoltageCabinet', 'lowVoltageCabinets'], scenario, ['Armoires basse tension']);
  setFromScenario(data, 'highVoltageCabin', ['hasHighVoltageCabin', 'highVoltageCabin'], scenario, ['Cabine haute tension']);
  setFromScenario(data, 'transformer', ['hasTransformer', 'transformer'], scenario, ['Transformateur']);
  setFromScenario(data, 'tgbt', ['hasMainLowVoltagePanel', 'tgbt'], scenario, ['TGBT']);
  setFromScenario(data, 'distributionBoards', ['distributionBoards'], scenario, ['Tableaux divisionnaires']);
  setFromScenario(data, 'rgieReport', ['rgieReportAvailable', 'rgieReport'], scenario, ['PV RGIE']);
  setFromScenario(data, 'periodicInspection', ['periodicInspectionAvailable', 'periodicInspection'], scenario, ['Contrôle périodique']);
  setFromScenario(data, 'ba4Ba5List', ['ba4Ba5ListAvailable', 'ba4Ba5List'], scenario, ['Liste BA4/BA5']);
  setFromScenario(data, 'consignationProcedure', ['lockoutProcedureAvailable', 'lockoutProcedure', 'consignationProcedure'], scenario, ['Procédure de consignation']);
  setFromScenario(data, 'thermographyReport', ['thermographyReportAvailable', 'thermographyReport'], scenario, ['Rapport de thermographie']);
  setFromScenario(data, 'openInspectionRemarks', ['openInspectionRemarks', 'openRemarks'], scenario, ['Remarques de contrôle ouvertes']);
  setFromScenario(data, 'connectedWorkEquipment', ['connectedWorkEquipment', 'workEquipment'], scenario, ['Équipements raccordés']);
  setFromScenario(data, 'exposedPersons', ['exposedPersons'], scenario, ['Personnes exposées']);
  setFromScenario(data, 'concernedAreas', ['concernedAreas'], scenario, ['Zones concernées']);
  setFromScenario(data, 'mainRisks', ['mainRisks'], scenario, ['Risques identifiés']);
  setFromScenario(data, 'existingMeasures', ['existingMeasures'], scenario, ['Mesures existantes']);
  setFromScenario(data, 'pointsToCheck', ['pointsToCheck'], scenario, ['Points à vérifier']);
  setFromScenario(data, 'plannedMeasures', ['plannedMeasures'], scenario, ['Mesures à prévoir']);
  setFromScenario(data, 'priorities', ['priorities'], scenario, ['Priorités']);
  setFromScenario(data, 'actionResponsible', ['actionResponsible', 'responsableActions'], scenario, ['Responsables']);
  setFromScenario(data, 'actionDeadline', ['actionDeadline', 'delaiActions'], scenario, ['Délais']);
  setFromScenario(data, 'evidenceToCollect', ['evidenceToCollect'], scenario, ['Preuves à obtenir']);
  setFromScenario(data, 'paaPgpLinks', ['paaPgpLinks'], scenario, ['Liens PAA / PGP']);
  setFromScenario(data, 'diuLinks', ['diuLinks'], scenario, ['Liens DIU']);
  setFromScenario(data, 'piuLinks', ['piuLinks'], scenario, ['Liens PIU']);
  data.contextSummary = buildElectricalContextSummary(data);

  return data;
}

function buildElectricalContextSummary(data) {
  const site = pick(data, ['siteName'], 'Le site analysé');
  const tgbt = pick(data, ['tgbt'], '');
  const boards = pick(data, ['distributionBoards'], '');
  const areas = pick(data, ['concernedAreas'], '');
  const cabin = pick(data, ['highVoltageCabin'], '');
  const priorities = pick(data, ['priorities'], 'le PV RGIE, la maîtrise des accès, la liste BA4/BA5, la consignation et la thermographie');
  const sentences = [];
  const assets = [];
  if (tgbt) assets.push(describeAsset('TGBT', tgbt));
  if (boards) assets.push(describeAsset('tableaux divisionnaires', boards));
  sentences.push(`${site} ${assets.length ? `dispose de ${assets.join(' et ')}` : 'fait l’objet de la présente analyse électrique'}.`);
  if (areas) sentences.push(`Les zones concernées sont : ${areas}.`);
  if (cabin && (isUnavailable(cabin) || isUnknown(cabin))) sentences.push('Aucune cabine haute tension n’est connue à ce stade et ce point reste à confirmer sur site.');
  sentences.push(`Les priorités portent sur ${priorities}.`);
  return sentences.slice(0, 5).join(' ');
}

function describeAsset(label, value) {
  const text = String(value).trim();
  const bareLabel = String(label).replace(/^(?:le|la|les|un|une)\s+/i, '');
  if (normalize(text).includes(normalize(bareLabel))) return text;
  if (/^(present|présent|oui)\b/i.test(text)) return `${label} ${text.replace(/^(present|présent|oui)\s*[:—-]?\s*/i, '')}`.trim();
  return `${label} ${text}`.trim();
}

function isUnavailable(value) {
  return /\b(non disponible|absent|aucun|pas de|non fourni|non connue?)\b/i.test(String(value || ''));
}

function isUnknown(value) {
  return /\b(inconnu|inconnue|à vérifier|a verifier|non connu|non connue)\b/i.test(String(value || ''));
}

export { GENERAL_RISKS, DOCUMENT_EVIDENCE };
