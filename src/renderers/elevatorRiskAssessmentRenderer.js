import { getField } from './specializedRiskFields.js';
import { cleanSpecializedRiskMarkdown } from './specializedRiskAiEnrichment.js';

const MISSING = '[à compléter]';
const VERIFY = '[à vérifier sur site]';
const PROOF = '[preuve à obtenir]';
const VALIDATION = '[validation requise]';

const PREPARATORY_ITEMS = [
  ['Propriétaire', ['owner', 'elevatorOwner', 'proprietaire']],
  ['Gestionnaire', ['manager', 'elevatorManager', 'siteManager', 'gestionnaire']],
  ['Entreprise de maintenance', ['maintenanceCompany', 'elevatorMaintenanceCompany', 'entrepriseMaintenance']],
  ['Certification maintenance ISO 9001 si connue', ['maintenanceIso9001', 'certificationMaintenanceIso9001']],
  ['Adresse de l’ascenseur', ['elevatorAddress', 'adresseAscenseur', 'address', 'adresse']],
  ['Localisation dans le bâtiment', ['elevatorLocation', 'locationInBuilding', 'localisationAscenseur']],
  ['Marque', ['brand', 'elevatorBrand', 'marque']],
  ['Numéro de fabrication', ['serialNumber', 'fabricationNumber', 'elevatorSerialNumber', 'manufacturingNumber', 'numeroFabrication']],
  ['Année de construction', ['constructionYear', 'yearOfConstruction', 'anneeConstruction']],
  ['Type : électrique / hydraulique / vis sans fin / autre', ['elevatorType', 'typeAscenseur']],
  ['Charge nominale', ['ratedLoad', 'chargeNominale']],
  ['Nombre de personnes', ['personsCapacity', 'capacityPersons', 'personCapacity', 'nombrePersonnes']],
  ['Vitesse', ['speed', 'elevatorSpeed', 'vitesse']],
  ['Nombre d’arrêts', ['numberOfStops', 'stops', 'nombreArrets']],
  ['Environnement : habitation, bureaux, hôpital, maison de repos, industriel, commerce, autre', ['environment', 'environnement']],
  ['Utilisation normale / intensive', ['usageIntensity', 'utilisation']],
  ['Utilisateurs vulnérables : enfants, personnes âgées, PMR, autres handicaps', ['vulnerableUsers', 'utilisateursVulnerables']],
  ['Valeur historique : oui / non / inconnue', ['historicalValue', 'valeurHistorique']],
];

const EXPOSED_PERSONS = [
  'Utilisateurs', 'Travailleurs', 'Personnel d’entretien', 'Personnel de nettoyage',
  'Personnes âgées', 'Enfants', 'Personnes à mobilité réduite', 'Visiteurs',
  'Entreprises extérieures', 'Secours', 'Personnel de maintenance ascenseur',
];

const MAIN_RISKS = [
  ['Fonctionnement anormal des dispositifs de sécurité', 'Utilisateurs, personnel de maintenance', 'Essais, rapports et comportement des dispositifs', 'Mouvement dangereux, chute, coincement ou blessure grave'],
  ['Défaut de verrouillage des portes palières', 'Utilisateurs, enfants, personnel d’entretien', 'Impossibilité d’ouvrir hors présence de la cabine', 'Chute dans la gaine'],
  ['Défaut de contact de porte cabine', 'Utilisateurs', 'Arrêt ou démarrage avec porte non sécurisée', 'Coincement, heurt ou chute'],
  ['Absence ou défaut de porte cabine / rideau de sécurité', 'Utilisateurs, enfants, PMR', 'Protection de la baie de cabine', 'Contact, entraînement ou coincement'],
  ['Risque de contact avec parties mobiles', 'Maintenance, entretien, entreprises extérieures', 'Accès aux organes en mouvement', 'Écrasement, happement ou sectionnement'],
  ['Gaine non close ou parois discontinues', 'Utilisateurs, travailleurs, visiteurs', 'Continuité et résistance des parois', 'Chute ou contact avec la cabine'],
  ['Cabine avec parois non fermées', 'Utilisateurs', 'Fermeture et résistance des parois', 'Contact, coincement ou chute'],
  ['Risque de chute ou de coincement', 'Tous les utilisateurs', 'Accès, portes, espaces et mouvements', 'Blessure grave ou mortelle'],
  ['Risque de trébuchement à l’entrée de cabine', 'Utilisateurs, personnes âgées, PMR', 'Différence de niveau et état des seuils', 'Chute de plain-pied'],
  ['Précision d’arrêt insuffisante', 'Utilisateurs, PMR, matériel roulant', 'Nivelage à chaque palier et sous différentes charges', 'Chute, collision ou blocage'],
  ['Affaissement cabine hydraulique', 'Utilisateurs, maintenance', 'Dérive à l’arrêt et dispositifs anti-dérive', 'Différence de niveau, chute ou écrasement'],
  ['Éclairage insuffisant aux paliers', 'Utilisateurs, visiteurs', 'Niveau et continuité de l’éclairage', 'Trébuchement ou mauvaise perception'],
  ['Éclairage insuffisant cabine', 'Utilisateurs', 'Éclairage normal en service', 'Chute, panique ou erreur de commande'],
  ['Absence ou défaut éclairage secours', 'Utilisateurs', 'Autonomie et déclenchement de l’éclairage secours', 'Panique et difficulté d’assistance'],
  ['Absence ou défaut communication bidirectionnelle', 'Personne bloquée en cabine', 'Appel, réception, localisation et permanence', 'Enfermement prolongé sans assistance'],
  ['Enfermement prolongé', 'Utilisateurs, personnes vulnérables', 'Procédure d’alarme et délai d’intervention', 'Stress, malaise ou aggravation médicale'],
  ['Ventilation cabine insuffisante', 'Utilisateurs, personne bloquée', 'Renouvellement d’air en fonctionnement et à l’arrêt', 'Inconfort, malaise ou aggravation'],
  ['Défaut d’accès sûr à la cuvette', 'Maintenance, contrôle, secours', 'Moyens d’accès, espaces et consignation', 'Chute, écrasement ou électrisation'],
  ['Défaut d’accès sûr à la salle machines', 'Maintenance, contrôle, secours', 'Escaliers, échelles, garde-corps et accès', 'Chute ou intervention dangereuse'],
  ['Parties mobiles non protégées en salle machines', 'Maintenance, contrôle', 'Protecteurs et distances de sécurité', 'Happement, écrasement ou coupure'],
  ['Absence ou défaut interrupteur d’arrêt', 'Maintenance, contrôle', 'Présence, accessibilité et fonctionnement', 'Mouvement imprévu pendant intervention'],
  ['Défaut de parachute', 'Utilisateurs, maintenance', 'Essai et rapport du dispositif', 'Chute incontrôlée de la cabine'],
  ['Défaut limiteur de vitesse', 'Utilisateurs, maintenance', 'Essai, réglage et liaison au parachute', 'Survitesse et chute'],
  ['Défaut amortisseurs', 'Utilisateurs, maintenance', 'État et efficacité en cuvette', 'Choc violent en fin de course'],
  ['Mouvement incontrôlé de la cabine', 'Utilisateurs, maintenance', 'Dérive porte ouverte et protections associées', 'Écrasement, coincement ou chute'],
  ['Risque électrique', 'Maintenance, contrôle, entretien', 'Armoires, câbles, mise à la terre et consignation', 'Électrisation, électrocution ou incendie'],
  ['Amiante suspectée', 'Maintenance, entreprises extérieures', 'Matériaux suspects avant intervention', 'Exposition aux fibres d’amiante'],
  ['Défaut de signalisation', 'Utilisateurs, secours, maintenance', 'Consignes, capacité, contacts et interdictions', 'Erreur d’usage ou retard d’intervention'],
  ['Maintenance insuffisamment documentée', 'Tous les utilisateurs', 'Contrat, fréquence, traçabilité et suites données', 'Dégradation non détectée et défaillance'],
  ['Remarques ouvertes SECT', 'Tous les utilisateurs', 'Liste, criticité, délais et preuves de levée', 'Maintien d’un risque identifié'],
  ['Utilisation par personnes vulnérables', 'Enfants, personnes âgées, PMR, personnes handicapées', 'Usage réel, assistance et accessibilité', 'Collision, chute, enfermement ou panique'],
  ['Valeur historique éventuelle', 'Utilisateurs, maintenance', 'Compatibilité conservation / sécurité et avis compétent', 'Mesures insuffisantes ou altération patrimoniale'],
];

const RISK_MEASURES = [
  ['Faire tester chaque dispositif par l’acteur compétent et traiter les défauts signalés.', 'Rapport SECT et procès-verbal d’essais.'],
  ['Vérifier verrouillage positif, déverrouillage par outil spécial et contact de sécurité.', 'Rapport d’essai des serrures palières.'],
  ['Vérifier que le contact interdit tout mouvement avec la porte cabine non sécurisée.', 'Essai fonctionnel tracé.'],
  ['Faire évaluer la porte ou le rideau de sécurité et planifier la protection adaptée.', 'Rapport SECT et preuve de modernisation.'],
  ['Poser ou rétablir protecteurs et distances de sécurité avant intervention.', 'Photos des protecteurs et rapport de maintenance.'],
  ['Faire contrôler la fermeture, la résistance et les ouvertures de gaine.', 'Constat SECT et photos de la gaine.'],
  ['Vérifier la fermeture et la résistance des parois de cabine.', 'Photos et rapport de contrôle.'],
  ['Contrôler jeux, espaces et dispositifs anti-coincement à chaque accès.', 'Relevé de visite et essais des sécurités.'],
  ['Remettre les seuils en état et supprimer les obstacles ou différences dangereuses.', 'Photos avant/après et fiche d’intervention.'],
  ['Mesurer l’arrêt à chaque palier et prioriser les PMR si leur usage est probable.', 'Relevé des écarts de nivelage sous charges représentatives.'],
  ['Contrôler dérive et dispositif anti-dérive de l’ascenseur hydraulique.', 'Rapport de maintenance avec mesure de dérive.'],
  ['Mesurer et rétablir un éclairage sûr sur tous les paliers.', 'Mesures d’éclairement et preuve d’intervention.'],
  ['Vérifier éclairage normal, diffuseurs et commande en cabine.', 'Essai daté et photos.'],
  ['Vérifier autonomie, test périodique et remplacement en cas de défaut.', 'Preuve d’autonomie et registre des tests.'],
  ['Tester appel, dialogue, localisation et permanence ; afficher la procédure et les contacts maintenance.', 'Compte rendu d’appel bidirectionnel daté.'],
  ['Formaliser procédure personne bloquée, rôles de l’accueil et délai d’intervention.', 'Exercice tracé et liste des contacts à jour.'],
  ['Vérifier les ouvertures de ventilation, y compris lors d’une immobilisation.', 'Constat technique et notice constructeur.'],
  ['Sécuriser accès, échelle, interrupteur d’arrêt et traiter toute eau en cuvette.', 'Photos de la cuvette et rapport de maintenance.'],
  ['Réserver l’accès, vérifier éclairage, serrure, signalisation et zones de travail.', 'Plan d’accès et photos de la salle machines.'],
  ['Installer ou remettre en place les protections des parties mobiles.', 'Photos et validation de l’entreprise de maintenance.'],
  ['Tester présence, accessibilité et action de chaque interrupteur d’arrêt.', 'Rapport d’essai fonctionnel.'],
  ['Faire tester le parachute selon les modalités réglementaires.', 'Rapport officiel mentionnant le test.'],
  ['Faire contrôler réglage, liaison et fonctionnement du limiteur de vitesse.', 'Rapport de contrôle du limiteur.'],
  ['Contrôler état, position et efficacité des amortisseurs.', 'Rapport SECT ou maintenance documenté.'],
  ['Vérifier protections contre dérive et mouvement porte ouverte.', 'Essai et rapport SECT.'],
  ['Vérifier armoires, câbles, terre, protections et procédure de consignation.', 'Rapport électrique et procédure de consignation.'],
  ['Faire réaliser un repérage amiante avant tout travail susceptible d’exposer.', 'Inventaire amiante ou analyse d’échantillon.'],
  ['Afficher capacité, consignes, contacts et restrictions lisibles.', 'Photos datées de la signalisation.'],
  ['Obtenir contrat, rapports, remarques ouvertes et planification corrective.', 'Contrat et registre complet des interventions.'],
  ['Demander le rapport officiel SECT et les preuves de levée ou l’attestation applicable.', 'Rapport SECT et attestations de clôture.'],
  ['Adapter accès, commandes, signalisation et assistance aux utilisateurs vulnérables.', 'Évaluation d’accessibilité et mesures réalisées.'],
  ['Concilier conservation et sécurité avec avis compétents et mesures alternatives documentées.', 'Dossier historique, avis SECT et décision du gestionnaire.'],
];

const TECHNICAL_ZONES = [
  ['7.1 Cabine', ['Porte cabine', 'Rideau de sécurité', 'Commandes', 'Éclairage normal', 'Éclairage secours', 'Communication bidirectionnelle', 'Ventilation', 'Capacité affichée', 'État général', 'Précision d’arrêt', 'Accessibilité PMR']],
  ['7.2 Portes palières', ['Verrouillage positif', 'Circuit de sécurité', 'Ouverture par outil spécial', 'Protection des serrures', 'Distance seuil cabine / seuil palier', 'Risque d’ouverture inappropriée', 'État mécanique']],
  ['7.3 Gaine', ['Parois continues', 'Ouvertures', 'Parties mobiles accessibles', 'Éclairage gaine', 'Contrepoids', 'Protections entre ascenseurs', 'Cuvette', 'Eau en cuvette', 'Accès cuvette', 'Interrupteurs d’arrêt']],
  ['7.4 Salle machines / local technique', ['Accès réservé', 'Porte verrouillée', 'Éclairage', 'Parties mobiles', 'Zones de travail', 'Armoire de commande', 'Outillage spécial', 'Affichage / signalisation', 'Clé disponible', 'Risque chute lors de l’accès']],
  ['7.5 Dispositifs de sécurité', ['Parachute', 'Limiteur de vitesse', 'Fins de course', 'Verrouillages', 'Soupape rupture canalisation', 'Amortisseurs', 'Dispositifs anti-dérive', 'Dispositifs contre mouvement incontrôlé', 'Contacts électriques de sécurité']],
  ['7.6 Maintenance / contrôles', ['Contrat de maintenance', 'Entreprise compétente', 'Rapports disponibles', 'Remarques ouvertes', 'Interventions récentes', 'Modernisations réalisées', 'Suivi des non-conformités', 'Communication au gestionnaire', 'Interdiction éventuelle d’utilisation si risque grave']],
];

const DOCUMENTS = [
  'Rapport SECT d’analyse de risque', 'Rapport de contrôle périodique',
  'Attestation de régularisation', 'Contrat de maintenance', 'Rapports d’entretien',
  'Rapports de modernisation', 'Fiche technique ascenseur', 'Schémas électriques',
  'Dossier valeur historique', 'Preuve communication bidirectionnelle',
  'Preuve éclairage secours', 'Preuve tests dispositifs de sécurité',
  'Registre interventions', 'Liste remarques ouvertes',
  'Photos cabine / portes / gaine / local machines',
];

const TYPICAL_ACTIONS = [
  ['Demander le dernier rapport SECT', 'Rapport réglementaire absent ou ancien', 'Organisationnelle', 'Haute'],
  ['Lever les remarques ouvertes', 'Remarques ouvertes SECT', 'Technique / organisationnelle', 'Haute'],
  ['Vérifier la communication bidirectionnelle', 'Défaut d’alarme et enfermement', 'Technique / surveillance', 'Haute'],
  ['Vérifier l’éclairage secours', 'Défaut d’éclairage en panne', 'Technique / surveillance', 'Haute'],
  ['Vérifier la précision d’arrêt', 'Trébuchement et accessibilité', 'Technique / surveillance', 'Haute'],
  ['Vérifier les verrouillages portes', 'Ouverture sur gaine ou mouvement porte ouverte', 'Technique / surveillance', 'Haute'],
  ['Vérifier l’accès cuvette', 'Intervention technique dangereuse', 'Technique / organisationnelle', 'Haute'],
  ['Vérifier l’accès salle machines', 'Chute et accès non autorisé', 'Technique / organisationnelle', 'Haute'],
  ['Vérifier la signalisation', 'Information insuffisante', 'Information', 'Moyenne'],
  ['Sécuriser l’accès non autorisé', 'Accès aux zones techniques', 'Technique / organisationnelle', 'Haute'],
  ['Planifier la modernisation', 'Mesures techniques à mettre à niveau', 'Technique / organisationnelle', 'À déterminer'],
  ['Informer les utilisateurs si restriction', 'Restriction temporaire d’usage', 'Information / formation', 'Haute'],
  ['Interdire temporairement l’utilisation si un risque grave est confirmé', 'Risque grave confirmé par un acteur compétent', 'Organisationnelle', 'Immédiate'],
  ['Mettre à jour le dossier ascenseur', 'Traçabilité incomplète', 'Organisationnelle', 'Moyenne'],
];

/** Rend une aide déterministe à l’analyse des risques d’un ascenseur. */
export function renderElevatorRiskAssessmentMarkdown(formData = {}, language = 'fr') {
  const data = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {};
  const languageCode = normalizeLanguage(language);
  const sections = [
    '# Analyse de risques — Ascenseur',
    '',
    '**Aide au conseiller en prévention — document préparatoire à compléter et valider**',
    languageCode === 'fr' ? '' : '> Traduction à prévoir — version française générée.',
    '',
    '> Ce document ne remplace jamais une analyse réglementaire officielle réalisée par un SECT, un contrôle périodique, une attestation de régularisation, un rapport officiel de modernisation, la décision du propriétaire ou du gestionnaire, l’avis du conseiller en prévention ni l’avis du CPPT ou du comité compétent.',
    '',
    '> Référence de contexte : AR du 9 mars 2003 relatif à la sécurité des ascenseurs. L’analyse réglementaire des risques est réalisée par un SECT ; le propriétaire ou gestionnaire assure les suites requises et, en milieu professionnel, la concertation implique notamment le conseiller en prévention et le comité compétent.',
    '',
    identificationSection(data, languageCode),
    '',
    limitsAndStatusSection(data),
    '',
    preparatoryQuestionnaireSection(data),
    '',
    methodSection(),
    '',
    exposedPersonsSection(),
    '',
    mainRisksSection(data),
    '',
    technicalAnalysisSection(),
    '',
    vulnerableUsersSection(),
  ];

  if (historicalValueMayApply(data)) {
    sections.push('', historicalValueSection(data));
  }

  sections.push(
    '', documentsSection(),
    '', preventionMeasuresSection(data),
    '', paaPgpSection(),
    '', diuSection(),
    '', piuSection(data),
    '', actionPlanSection(data),
    '', validationsSection(),
    '', helpLimitsSection(),
    '', finalSections(),
  );

  return cleanSpecializedRiskMarkdown(sections.filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n').trim()) + '\n';
}

function identificationSection(data, languageCode) {
  return section('1. Identification', `${table(['Élément', 'Valeur'], [
    ['Entreprise / organisation', pick(data, ['companyName', 'enterpriseName', 'organisationName', 'organizationName', 'company', 'entreprise', 'organisation'])],
    ['Site / bâtiment', pick(data, ['siteName', 'buildingName', 'workplaceName', 'locationName', 'site', 'batiment'])],
    ['Adresse', address(data)],
    ['Propriétaire', pick(data, ['owner', 'elevatorOwner', 'proprietaire'])],
    ['Gestionnaire', pick(data, ['manager', 'elevatorManager', 'siteManager', 'gestionnaire'])],
    ['Personne de contact', pick(data, ['contactPerson', 'siteContact', 'contactName', 'personneContact', 'contact'])],
    ['Conseiller en prévention', pick(data, ['preventionAdvisor', 'preventionAdvisorName', 'conseillerPrevention'])],
    ['Responsable du site', pick(data, ['siteManager', 'manager', 'responsible'])],
    ['Service technique', pick(data, ['technicalServiceContact', 'technicalService', 'maintenanceContact'])],
    ['SECT connu', pick(data, ['sect', 'knownSect', 'sectName', 'sectConnu'])],
    ['Entreprise de maintenance', pick(data, ['maintenanceCompany', 'elevatorMaintenanceCompany', 'entrepriseMaintenance'])],
    ['Date de l’aide à l’analyse', pick(data, ['assessmentDate', 'dateAnalyse', 'dateAideAnalyse'])],
    ['Auteur de l’aide', pick(data, ['author', 'createdBy', 'preventionAdvisor', 'auteur'])],
    ['Contexte complémentaire', pick(data, ['additionalContext', 'scenario', 'comments', 'notes', 'context'])],
    ['Référence interne', pick(data, ['internalReference', 'referenceInterne', 'reference'])],
    ['Langue', value(data.language || data.langue || languageCode)],
  ])}\n\n> Ce document constitue une aide au conseiller en prévention. Il doit être complété, vérifié sur site et confronté au rapport du SECT, aux contrôles périodiques, aux documents de maintenance et aux constats réels.`);
}

function limitsAndStatusSection(data) {
  const statements = [
    'Ce document ne remplace pas l’analyse réglementaire d’un SECT.',
    'Ce document ne constitue pas une attestation de conformité.',
    'Ce document sert à préparer, comprendre, suivre et prioriser les points de prévention.',
    'Les éléments inconnus doivent être vérifiés sur site.',
    'Les risques graves doivent être traités immédiatement selon les conclusions du SECT.',
  ].map((item) => `- ${item}`).join('\n');
  return section('2. Limites et statut de l’analyse', `${statements}\n\n${table(['Élément', 'Information'], [
    ['Ascenseur existant / neuf / modernisé', pick(data, ['elevatorStatus', 'statutAscenseur'])],
    ['Date de mise en service connue', pick(data, ['commissioningDate', 'startDate', 'miseEnService', 'dateMiseEnService'])],
    ['Année de construction', pick(data, ['constructionYear', 'anneeConstruction'])],
    ['Date dernière analyse SECT', pick(data, ['lastSectAssessmentDate', 'dateDerniereAnalyseSect'])],
    ['Date dernier contrôle périodique', pick(data, ['lastPeriodicInspectionDate', 'dateDernierControlePeriodique'])],
    ['Rapport SECT disponible', pick(data, ['sectReportAvailable', 'rapportSectDisponible'])],
    ['Dernier contrôle périodique disponible', pick(data, ['lastPeriodicInspectionAvailable', 'periodicInspectionAvailable'])],
    ['Attestation de régularisation disponible', pick(data, ['regularizationCertificateAvailable', 'attestationRegularisationDisponible'])],
    ['Travaux de modernisation réalisés', pick(data, ['modernizationWorksDone', 'modernizationWorkCompleted', 'travauxModernisationRealises'])],
    ['Travaux ouverts', pick(data, ['openWorks', 'openWork', 'travauxOuverts'])],
    ['Remarques SECT ouvertes', pick(data, ['openSectRemarks', 'openInspectionRemarks'])],
    ['Risques principaux signalés', pick(data, ['mainRisks'])],
    ['Points à vérifier signalés', pick(data, ['pointsToCheck'])],
    ['Mesures prévues', pick(data, ['plannedMeasures'])],
    ['Preuves à collecter', pick(data, ['evidenceToCollect'])],
    ['Utilisation actuelle conforme à l’usage prévu', pick(data, ['currentUseMatchesIntendedUse', 'utilisationConformeUsagePrevu'], VERIFY)],
  ])}`);
}

function preparatoryQuestionnaireSection(data) {
  return section('3. Questionnaire préparatoire', table(
    ['Élément', 'Information connue', 'À vérifier', 'Commentaire'],
    PREPARATORY_ITEMS.map(([label, keys]) => [label, pick(data, keys), VERIFY, MISSING]),
  ));
}

function methodSection() {
  return section('4. Méthode d’analyse proposée', [
    'La démarche proposée reprend les étapes suivantes :',
    '',
    '- Détermination des limites : usage prévu, zones, phases de vie, personnes et conditions d’intervention.',
    '- Identification des dangers : situations dangereuses observées, déclarées ou documentées.',
    '- Estimation du risque : appréciation de la gravité, de la probabilité et de l’exposition.',
    '- Évaluation du risque : comparaison et hiérarchisation des risques estimés.',
    '- Réduction du risque : mesures techniques, organisationnelles, information, formation et surveillance.',
    '- Vérification après mesures : contrôle de réalisation, preuve et réévaluation du risque résiduel.',
    '',
    '**Risque = gravité x probabilité x exposition**',
    '',
    table(['Gravité', 'Probabilité', 'Exposition', 'Niveau de risque', 'Mesure attendue'], [
      ['1 — faible', '1 — improbable', '1 — rare', '1 à 4 — faible', 'Surveiller et maintenir les mesures'],
      ['2 — significative', '2 — peu probable', '2 — occasionnelle', '5 à 16 — modéré', 'Planifier une amélioration et obtenir les preuves'],
      ['3 — grave', '3 — probable', '3 — fréquente', '17 à 54 — élevé', 'Traiter prioritairement et réduire l’exposition'],
      ['4 — très grave / mortelle', '4 — très probable', '4 — continue', '55 à 64 — critique', 'Mesure immédiate ; arrêt si le risque grave est confirmé'],
    ]),
    '',
    `La méthode Kinney et cette cotation simplifiée sont indicatives. Toute cotation doit être justifiée et validée par les personnes compétentes. ${VALIDATION}`,
  ].join('\n'));
}

function exposedPersonsSection() {
  return section('5. Personnes exposées', table(
    ['Catégorie', 'Exposition possible', 'Situation critique', 'Mesure de prévention attendue'],
    EXPOSED_PERSONS.map((person) => [person, VERIFY, VERIFY, VALIDATION]),
  ));
}

function mainRisksSection(data) {
  const suppliedMeasures = pick(data, ['existingMeasures', 'mesuresExistantes'], VERIFY);
  return section('6. Analyse des risques principaux', `${table(
    ['Danger / situation dangereuse', 'Personnes exposées', 'Situation à vérifier', 'Risque potentiel', 'Mesures existantes', 'Mesures complémentaires proposées', 'Gravité', 'Probabilité', 'Exposition', 'Priorité', 'Preuve à obtenir', 'Destination possible : PAA / PGP / DIU / PIU', 'Statut'],
    MAIN_RISKS.map(([danger, persons, situation, potential], index) => [
      danger, persons, `${situation} — ${VERIFY}`, potential, `Protection associée : ${VERIFY}`,
      RISK_MEASURES[index][0],
      MISSING, MISSING, MISSING, MISSING, RISK_MEASURES[index][1], 'PAA / PGP / DIU / PIU selon la mesure', VALIDATION,
    ]),
  )}\n\nMesures existantes déclarées dans le formulaire : ${suppliedMeasures}`);
}

function technicalAnalysisSection() {
  return section('7. Analyse technique par zone', TECHNICAL_ZONES.map(([title, points]) => [
    `### ${title}`,
    '',
    table(['Point', 'Constat', 'Mesure attendue', 'Preuve', 'Statut'], points.map((point) => [
      point, VERIFY, MISSING, PROOF, VALIDATION,
    ])),
  ].join('\n')).join('\n\n'));
}

function vulnerableUsersSection() {
  const categories = ['PMR', 'Personnes âgées', 'Enfants', 'Personnes malvoyantes', 'Personnes avec handicap', 'Utilisateurs avec matériel roulant', 'Brancards si hôpital / maison de repos'];
  const criteria = ['Précision d’arrêt attendue', 'Largeur d’accès', 'Hauteur commandes', 'Signalisation sonore / visuelle', 'Risque de collision avec portes', 'Assistance éventuelle'];
  return section('8. Utilisateurs vulnérables et accessibilité', `${table(
    ['Catégorie', 'Exposition / difficulté possible', 'Adaptation ou assistance attendue', 'Statut'],
    categories.map((category) => [category, VERIFY, MISSING, VALIDATION]),
  )}\n\n${table(['Critère à analyser', 'Valeur / constat', 'Preuve', 'Statut'], criteria.map((criterion) => [criterion, VERIFY, PROOF, VALIDATION]))}`);
}

function historicalValueSection(data) {
  return section('9. Ascenseur de valeur historique', `${table(['Élément', 'Information'], [
    ['Valeur historique connue / inconnue', pick(data, ['historicalValue', 'valeurHistorique'], VERIFY)],
    ['Dossier disponible', pick(data, ['historicalFileAvailable', 'dossierValeurHistoriqueDisponible'])],
    ['Contraintes de conservation', pick(data, ['conservationConstraints', 'contraintesConservation'])],
    ['Mesures alternatives possibles', pick(data, ['alternativeMeasures', 'mesuresAlternatives'])],
    ['Nécessité d’avis compétent', VALIDATION],
    ['Maintien d’un niveau de sécurité équivalent', VERIFY],
  ])}\n\n> La valeur historique éventuelle ne supprime pas l’obligation de garantir un niveau de sécurité suffisant.`);
}

function documentsSection() {
  return section('10. Documents et preuves à demander', table(
    ['Document / preuve', 'Disponible', 'À demander', 'Responsable', 'Commentaire'],
    DOCUMENTS.map((document) => [document, MISSING, PROOF, MISSING, MISSING]),
  ));
}

function preventionMeasuresSection(data) {
  const responsible = pick(data, ['actionResponsible', 'responsableActions']);
  const deadline = pick(data, ['actionDeadline', 'delaiActions']);
  return section('11. Mesures de prévention proposées', table(
    ['Mesure', 'Origine du risque', 'Type : technique / organisationnelle / information / formation / surveillance', 'Priorité', 'Responsable', 'Délai', 'Preuve attendue', 'Destination possible : PAA / PGP / DIU / PIU', 'Statut'],
    TYPICAL_ACTIONS.map(([measure, origin, type, priority]) => [measure, origin, type, priority, responsible, deadline, PROOF, 'PAA / PGP / DIU / PIU selon la mesure', VALIDATION]),
  ));
}

function paaPgpSection() {
  return section('12. Points à intégrer au PAA / PGP', bulletList([
    'Modernisation', 'Levée des remarques SECT', 'Maintenance renforcée', 'Contrôle périodique',
    'Amélioration de l’accès technique', 'Signalisation', 'Communication bidirectionnelle',
    'Éclairage secours', 'Adaptation PMR', 'Traitement de la valeur historique',
    'Formation / information du personnel d’accueil ou de maintenance interne',
  ]));
}

function diuSection() {
  return section('13. Points à intégrer au DIU', bulletList([
    'Localisation ascenseur', 'Salle machines', 'Gaine', 'Cuvette', 'Coupures électriques',
    'Accès réservé', 'Contraintes d’intervention', 'Présence d’amiante suspectée',
    'Valeur historique', 'Plans / schémas', 'Consignes pour entreprises extérieures',
  ]));
}

function piuSection(data) {
  return section('14. Points utiles pour le PIU', `${bulletList([
    'Procédure personne bloquée en cabine', 'Contact maintenance', 'Contact SECT si connu',
    'Contact secours', 'Communication avec personne bloquée',
    'Interdiction de désincarcération par personnel non formé', 'Coupure électrique',
    'Accès secours', 'Gestion ascenseur en cas d’incendie',
    'Ascenseur PMR / évacuation non autorisée sauf dispositif spécifique',
  ])}\n\nContacts fournis : maintenance ${pick(data, ['maintenanceContact', 'contactMaintenance'])} ; SECT ${pick(data, ['sectContact', 'contactSect'])} ; secours ${pick(data, ['emergencyContact', 'contactSecours'])}.`);
}

function actionPlanSection(data) {
  const responsible = pick(data, ['actionResponsible', 'responsableActions']);
  const deadline = pick(data, ['actionDeadline', 'delaiActions']);
  return section('15. Plan d’action priorisé', table(
    ['N°', 'Action', 'Priorité', 'Responsable', 'Délai', 'Preuve', 'Destination PAA/PGP/DIU/PIU', 'Statut'],
    TYPICAL_ACTIONS.map(([measure, , , priority], index) => [index + 1, measure, priority, responsible, deadline, PROOF, 'À déterminer : PAA / PGP / DIU / PIU', VALIDATION]),
  ));
}

function validationsSection() {
  return section('16. Avis et validations', [
    '- Avis du conseiller en prévention : [à compléter]',
    '- Avis SECT : [à joindre si disponible]',
    '- Avis gestionnaire/propriétaire : [à compléter]',
    '- Avis CPPT / comité compétent : [à compléter]',
    '- Validation employeur : [à compléter]',
  ].join('\n'));
}

function helpLimitsSection() {
  return section('17. Limites de l’aide', 'Cette analyse constitue une aide à la préparation et au suivi de la prévention. Elle doit être confrontée aux rapports officiels, aux constats sur site et aux exigences applicables. Les décisions relatives à la conformité, à la modernisation et à la remise en service relèvent des acteurs compétents.');
}

function finalSections() {
  return [
    section('18. Documents à créer ou à mettre à jour', bulletList([
      'Dossier ascenseur', 'Rapport SECT', 'Dernier contrôle périodique', 'Contrat de maintenance',
      'Registre des interventions', 'Procédure personne bloquée', 'Liste des contacts d’urgence',
      'Plan d’accès au local technique', 'Preuves des tests de communication et d’éclairage secours',
    ])),
    section('19. Acteurs à consulter ou à impliquer', bulletList([
      'Conseiller en prévention', 'Gestionnaire ou propriétaire', 'Entreprise de maintenance',
      'SECT', 'Direction du site', 'Accueil', 'Service technique', 'CPPT si applicable',
    ])),
    section('20. Annexes nécessaires', bulletList([
      'Rapport SECT', 'Contrôle périodique', 'Contrat de maintenance',
      'Photos cabine, portes et local technique', 'Plaque signalétique', 'Preuves des tests',
      'Remarques ouvertes', 'Attestation de régularisation si disponible',
    ])),
    section('21. Limites d’intervention du conseiller en prévention niveau 3', [
      '- Ne remplace pas le SECT.',
      '- Ne valide pas la conformité de l’ascenseur.',
      '- Ne réalise pas le contrôle technique réglementaire.',
      '- Prépare le suivi prévention et les actions.',
    ].join('\n')),
    section('22. Points bloquants avant validation', bulletList([
      'Absence de rapport SECT', 'Absence du dernier contrôle périodique',
      'Communication bidirectionnelle non testée', 'Éclairage secours non vérifié',
      'Remarques ouvertes inconnues', 'Procédure personne bloquée absente',
      'Maintenance non documentée',
    ])),
    section('23. Conclusion', [
      'Priorités : obtenir le rapport SECT et le contrôle périodique, tester la communication bidirectionnelle et l’éclairage secours, connaître les remarques ouvertes et formaliser la procédure personne bloquée.',
      `Les actions retenues sont à intégrer au PAA/PGP, au DIU et au PIU selon leur portée : ${VALIDATION}.`,
      'Toute conclusion reste à confronter au SECT, à la maintenance, aux constats sur site et à la validation de l’employeur après avis des acteurs compétents.',
    ].join('\n\n')),
  ].join('\n\n');
}

function section(title, body) {
  return `## ${title}\n\n${body}`;
}

function bulletList(items) {
  return items.map((item) => `- ${item} : ${VERIFY} ${PROOF}`).join('\n');
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

function address(data) {
  const direct = pick(data, ['elevatorAddress', 'address', 'siteAddress', 'workplaceAddress', 'fullAddress', 'adresseComplete', 'adresse'], '');
  if (direct) return direct;
  const city = [value(data.postalCode, ''), value(data.city || data.ville, '')].filter(Boolean).join(' ');
  const parts = [value(data.street || data.rue, ''), city, value(data.country || data.pays, '')].filter(Boolean);
  return parts.length ? parts.join(', ') : MISSING;
}

function historicalValueMayApply(data) {
  const raw = data.historicalValue ?? data.valeurHistorique;
  if (raw === false || raw === 0) return false;
  return !/^(non|no|nee|nein|false|0)$/i.test(String(raw || '').trim());
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

function normalizeLanguage(language) {
  return String(language || 'fr').trim().toLowerCase().split(/[-_]/)[0];
}

export { DOCUMENTS, MAIN_RISKS, PREPARATORY_ITEMS };
