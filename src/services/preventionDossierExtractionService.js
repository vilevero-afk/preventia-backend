import crypto from 'node:crypto';

const ALLOWED_DESTINATIONS = new Set([
  'piu',
  'pgp',
  'evidence',
  'validationPoint',
  'annex',
  'info',
  'ignoredTechnical',
]);

const LIMITS = {
  piu: 15,
  pgp: 30,
  evidence: 20,
  validationPoint: 15,
  annex: 15,
  ignoredTechnical: 50,
};

const TECHNICAL_EXCLUSIONS = [
  'additionalInformation',
  'documentType',
  'activity',
  'concernedTasks',
  'includedLocations',
  'exposedWorkers',
  'documentObjective',
  'fireRisk',
  'sector',
  'visitDate',
  'youngWorkers',
  'safetyDataSheetsAvailable',
  'jobObservationDone',
  'vehiclePedestrianTraffic',
  'dangerousMachines',
  'dangerousProducts',
  'writtenInstructions',
  'periodicControls',
  'availableEvidence',
  'Famille de danger',
  'Danger précis',
  'Scénario plausible',
  'Référence ou domaine réglementaire',
  'Livre Ier',
  'Livre III',
  'Livre IX',
  'Code belge du bien-être',
  'Méthode de cotation',
  'Tableau principal d’analyse',
  'Analyse des risques résiduels',
  'Conclusion',
  'Mention de validation',
  'PAA seul',
  'PGP seul',
  'CPPT seul',
];

const PIU_TERMS = [
  'alerte incendie',
  'évacuation',
  'evacuation',
  'point de rassemblement',
  'accueil secours',
  'accueil des secours',
  'accueil pompiers',
  'accès pompiers',
  'acces pompiers',
  'mise à l’abri',
  'mise a l abri',
  'accident',
  'malaise',
  'fuite gaz',
  'fuite de gaz',
  'déversement dangereux',
  'deversement dangereux',
  'confinement',
  'urgence',
  'personne bloquée',
  'personne bloquee',
  'appel secours ascenseur',
  'coupure électrique d’urgence',
  'coupure electrique d urgence',
];

const PGP_VERBS = [
  'vérifier',
  'verifier',
  'contrôler',
  'controler',
  'planifier',
  'formaliser',
  'mettre à jour',
  'mettre a jour',
  'obtenir',
  'centraliser',
  'dégager',
  'degager',
  'rendre',
  'rendre accessible',
  'supprimer',
  'sensibiliser',
  'former',
  'informer',
  'organiser',
  'corriger',
  'lever',
  'sécuriser',
  'securiser',
  'signaler',
  'valider',
  'consigner',
  'identifier',
  'afficher',
  'installer',
  'remplacer',
  'entretenir',
  'tester',
  'documenter',
  'séparer',
  'separer',
  'fournir',
  'réduire',
  'reduire',
  'adapter',
  'assurer',
  'établir',
  'etablir',
  'transmettre',
  'limiter',
  'interdire',
];

const EVIDENCE_TERMS = [
  'rapport',
  'photo',
  'fds',
  'fiche de données de sécurité',
  'fiche de donnees de securite',
  'plan à joindre',
  'plan a joindre',
  'registre',
  'attestation',
  'pv rgie',
  'rapport sect',
  'thermographie',
  'schéma',
  'schema',
];

const VALIDATION_TERMS = [
  'avis cppt',
  'avis service externe',
  'avis expert',
  'validation employeur',
  'visite terrain',
  'preuve manquante bloquante',
  'responsabilité à confirmer',
  'responsabilite a confirmer',
  'délai à confirmer',
  'delai a confirmer',
  'bloquant',
  'obligatoire avant validation',
];

const AI_SYSTEM_PROMPT = `Tu extrais des candidats incrémentaux pour un dossier prévention belge. Tu ne valides rien. Tu proposes uniquement des éléments courts à faire valider dans Flutter. Réponds en JSON strict.`;

const AI_USER_PROMPT = `Retourne ce schéma:
{
  "items": [
    {
      "destination": "piu|pgp|evidence|validationPoint|annex|info|ignoredTechnical",
      "title": "",
      "description": "",
      "risk": "",
      "priority": "",
      "responsible": "",
      "deadline": "",
      "evidence": "",
      "confidence": 0.0,
      "reason": "",
      "tags": []
    }
  ],
  "ignoredItems": [],
  "warnings": []
}

Règles:
- PIU seulement pour une urgence opérationnelle réelle.
- PGP pour actions concrètes de prévention.
- Evidence pour preuve à obtenir, false par défaut sauf preuve bloquante.
- Exclure les en-têtes, champs techniques, pagination et texte descriptif.
- Ne jamais écrire "validé".`;

const PGP_RULES = [
  rule('fire-clear-evacuation-routes', ['issues encombrées', 'issues encombrees', 'voies d’évacuation encombrées', 'voies evacuation encombrees', 'dégager voies', 'degager voies', 'maintenir les issues libres'], 'Dégager les voies d’évacuation', 'Dégager les voies d’évacuation, maintenir les issues libres et contrôler l’absence de stockage.', 'Obstruction des voies d’évacuation', 'organisationnelle', ['incendie', 'évacuation']),
  rule('fire-extinguishers-accessible', ['extincteurs masqués', 'extincteurs masques', 'extincteurs accessibles', 'moyens d’extinction visibles', 'moyens extinction accessibles', 'dévidoirs accessibles', 'devidoirs accessibles'], 'Rendre les extincteurs accessibles', 'Rendre les moyens d’extinction visibles et accessibles, puis contrôler leur dégagement.', 'Moyens d’extinction inaccessibles', 'contrôle', ['incendie', 'extinction']),
  rule('fire-doors', ['portes coupe-feu calées', 'portes coupe feu calees', 'portes coupe-feu', 'fermeture automatique des portes coupe-feu', 'supprimer les cales'], 'Vérifier les portes coupe-feu', 'Supprimer les cales, vérifier la fermeture automatique et sensibiliser le personnel.', 'Compartimentage incendie', 'contrôle', ['incendie', 'coupe-feu']),
  rule('fire-evacuation-drill', ['exercice évacuation', 'exercice evacuation', 'planifier un exercice d’évacuation', 'organiser un exercice d’évacuation'], 'Planifier un exercice d’évacuation', 'Organiser un exercice d’évacuation et conserver le retour d’expérience.', 'Préparation à l’évacuation', 'formation', ['incendie', 'évacuation']),
  rule('fire-visitors-info', ['visiteurs', 'intérimaires', 'interimaires', 'sous-traitants'], 'Informer les visiteurs et intervenants', 'Informer visiteurs, intérimaires et sous-traitants des consignes incendie applicables.', 'Information des personnes externes', 'information', ['incendie', 'information']),
  rule('fire-firefighter-access', ['accès pompiers encombrés', 'acces pompiers encombre', 'dégager les accès pompiers', 'degager les acces pompiers'], 'Dégager les accès pompiers', 'Dégager les accès pompiers et contrôler leur disponibilité permanente.', 'Accès secours entravé', 'organisationnelle', ['incendie', 'secours']),
  rule('fire-no-parking', ['stationnement accès pompiers', 'stationnement acces pompiers', 'zones interdites au stationnement'], 'Marquer les zones interdites au stationnement', 'Marquer les zones interdites au stationnement devant les accès et moyens de secours.', 'Accès secours entravé', 'signalisation', ['incendie', 'secours']),
  rule('fire-firefighter-file', ['dossier intervention pompiers', 'dossier pompiers'], 'Mettre à jour le dossier intervention pompiers', 'Mettre à jour les plans et informations utiles au dossier intervention pompiers.', 'Information secours incomplète', 'documentaire', ['incendie', 'secours']),

  rule('electrical-rgie', ['pv rgie', 'contrôle rgie', 'controle rgie', 'rapport rgie'], 'Obtenir ou vérifier le PV RGIE', 'Obtenir le PV RGIE applicable et intégrer les remarques dans le plan d’action.', 'Conformité électrique', 'documentaire', ['électrique', 'rgie']),
  rule('electrical-periodic-controls', ['contrôles périodiques électriques', 'controles periodiques electriques', 'contrôles périodiques', 'controles periodiques'], 'Planifier les contrôles périodiques électriques', 'Planifier les contrôles périodiques applicables aux installations électriques.', 'Contrôles électriques à suivre', 'contrôle', ['électrique']),
  rule('electrical-schematics', ['schémas électriques', 'schemas electriques', 'plans de coupure'], 'Mettre à jour les schémas électriques', 'Mettre à jour les schémas électriques et les plans de coupure utiles aux interventions.', 'Documentation électrique incomplète', 'documentaire', ['électrique']),
  rule('electrical-circuits', ['identifier les circuits', 'circuits et tableaux', 'tableaux électriques non identifiés', 'tableaux electriques non identifies'], 'Identifier les circuits et tableaux électriques', 'Identifier les circuits, tableaux et départs afin de faciliter les interventions autorisées.', 'Repérage électrique insuffisant', 'technique', ['électrique']),
  rule('electrical-signage', ['signalisation danger électrique', 'signalisation danger electrique', 'danger électrique'], 'Vérifier la signalisation danger électrique', 'Vérifier la présence et la lisibilité de la signalisation danger électrique.', 'Signalisation électrique insuffisante', 'signalisation', ['électrique']),
  rule('electrical-cabinets-condition', ['état des armoires électriques', 'etat des armoires electriques', 'armoires électriques détériorées', 'armoires electriques deteriorees'], 'Contrôler l’état des armoires électriques', 'Contrôler l’état, la fermeture et l’intégrité des armoires électriques.', 'Armoires électriques détériorées', 'contrôle', ['électrique']),
  rule('electrical-cabinets-clearance', ['armoires encombrées', 'armoires encombrees', 'encombrement devant les armoires', 'devant les armoires électriques'], 'Vérifier l’absence d’encombrement devant les armoires', 'Dégager les armoires électriques et maintenir un accès libre aux tableaux.', 'Accès aux armoires électriques entravé', 'organisationnelle', ['électrique']),
  rule('electrical-room-access', ['accès locaux électriques', 'acces locaux electriques', 'accès aux locaux électriques', 'cabine ht'], 'Vérifier l’accès aux locaux électriques', 'Vérifier l’accès autorisé aux locaux électriques et à la cabine HT le cas échéant.', 'Accès local électrique', 'organisationnelle', ['électrique']),
  rule('electrical-cutoff', ['coupure électrique', 'coupure electrique', 'coupure tgbt', 'coupure générale électrique'], 'Formaliser la procédure de coupure électrique', 'Formaliser la procédure de coupure électrique et les rôles des personnes autorisées.', 'Coupure électrique non formalisée', 'procédure', ['électrique']),
  rule('electrical-ba4-ba5', ['ba4/ba5', 'ba4', 'ba5'], 'Vérifier les habilitations BA4/BA5', 'Identifier les personnes autorisées et vérifier les formations ou habilitations BA4/BA5.', 'Interventions électriques', 'formation', ['électrique', 'ba4-ba5']),
  rule('electrical-loto', ['consignation', 'loto'], 'Vérifier la consignation électrique', 'Vérifier la procédure de consignation/LOTO et les moyens disponibles pour les interventions.', 'Consignation électrique', 'procédure', ['électrique']),
  rule('electrical-nonconformities', ['non-conformités du rapport', 'non conformités du rapport', 'remarques du rapport de contrôle', 'remarques rapport controle'], 'Corriger les non-conformités électriques', 'Corriger les non-conformités et remarques issues du rapport de contrôle électrique.', 'Non-conformités électriques', 'correction', ['électrique']),

  rule('elevator-sect', ['rapport sect', 'rapport de contrôle ascenseur', 'rapport controle ascenseur'], 'Obtenir ou vérifier le rapport SECT', 'Obtenir le rapport SECT ascenseur et intégrer les remarques dans le plan d’action.', 'Contrôle ascenseur', 'documentaire', ['ascenseur', 'sect']),
  rule('elevator-periodic-control', ['contrôle périodique ascenseur', 'controle periodique ascenseur', 'contrôle périodique', 'controle periodique'], 'Planifier le contrôle périodique ascenseur', 'Planifier le contrôle périodique de l’ascenseur avec l’organisme compétent.', 'Contrôle ascenseur', 'contrôle', ['ascenseur']),
  rule('elevator-remarks', ['remarques du rapport', 'lever les remarques'], 'Lever les remarques du rapport ascenseur', 'Lever les remarques du rapport de contrôle ascenseur et documenter le suivi.', 'Remarques de contrôle ascenseur', 'correction', ['ascenseur']),
  rule('elevator-maintenance', ['contrat de maintenance', 'maintenance ascenseur'], 'Vérifier le contrat de maintenance ascenseur', 'Vérifier le contrat de maintenance et les modalités d’intervention ascenseur.', 'Maintenance ascenseur', 'documentaire', ['ascenseur']),
  rule('elevator-instructions', ['consignes ascenseur', 'afficher les consignes'], 'Afficher les consignes ascenseur', 'Afficher les consignes ascenseur et les contacts utiles pour les usagers.', 'Information usagers ascenseur', 'signalisation', ['ascenseur']),
  rule('elevator-emergency-call', ['appel urgence', 'appel d’urgence', 'appel de secours', 'appel secours'], 'Tester l’appel d’urgence ascenseur', 'Tester l’appel d’urgence ascenseur et conserver la preuve du contrôle.', 'Alerte ascenseur', 'contrôle', ['ascenseur']),
  rule('elevator-lighting', ['éclairage cabine', 'eclairage cabine'], 'Vérifier l’éclairage cabine', 'Vérifier l’éclairage cabine et corriger les défauts constatés.', 'Éclairage cabine', 'contrôle', ['ascenseur']),
  rule('elevator-load-signage', ['charge maximale', 'signalisation charge'], 'Vérifier la signalisation de charge maximale', 'Vérifier la lisibilité de la charge maximale et des consignes associées.', 'Signalisation ascenseur', 'signalisation', ['ascenseur']),
  rule('elevator-trapped-person', ['personne bloquée', 'personne bloquee', 'bloquée en cabine', 'bloquee en cabine'], 'Organiser la procédure personne bloquée', 'Organiser la procédure personne bloquée et informer l’accueil ou le service technique.', 'Personne bloquée en cabine', 'procédure', ['ascenseur']),

  rule('chemical-sds', ['fds', 'fiches de données de sécurité', 'fiches de donnees de securite'], 'Centraliser les FDS', 'Centraliser les fiches de données de sécurité et vérifier leur disponibilité pour les utilisateurs.', 'Produits dangereux', 'documentaire', ['produits dangereux', 'fds']),
  rule('chemical-clp', ['clp', 'étiquetage clp', 'etiquetage clp'], 'Vérifier l’étiquetage CLP', 'Vérifier l’étiquetage CLP des produits dangereux et corriger les contenants non conformes.', 'Étiquetage produits dangereux', 'contrôle', ['produits dangereux', 'clp']),
  rule('chemical-incompatibilities', ['incompatibilités', 'incompatibilites', 'produits incompatibles'], 'Séparer les produits incompatibles', 'Séparer les produits incompatibles et clarifier les règles de stockage.', 'Stockage produits incompatibles', 'organisationnelle', ['produits dangereux']),
  rule('chemical-retention', ['rétention', 'retention'], 'Vérifier la rétention des produits dangereux', 'Installer ou vérifier les dispositifs de rétention adaptés aux produits stockés.', 'Déversement de produits dangereux', 'technique', ['produits dangereux']),
  rule('chemical-ventilation', ['ventilation local produits', 'local ventilé', 'local ventile', 'ventiler le local'], 'Vérifier la ventilation du local', 'Vérifier la ventilation du local de stockage et corriger les insuffisances.', 'Exposition aux vapeurs chimiques', 'technique', ['produits dangereux']),
  rule('chemical-quantities', ['quantités stockées', 'quantites stockees'], 'Limiter les quantités stockées', 'Limiter les quantités de produits dangereux stockées au besoin opérationnel.', 'Stockage excessif de produits dangereux', 'organisationnelle', ['produits dangereux']),
  rule('chemical-spill-instructions', ['consignes de déversement', 'consignes deversement'], 'Afficher les consignes de déversement', 'Afficher les consignes de déversement et les moyens de première intervention.', 'Déversement de produits dangereux', 'signalisation', ['produits dangereux']),
  rule('chemical-ppe', ['epi adaptés produits', 'epi adaptes produits'], 'Fournir les EPI adaptés aux produits', 'Fournir les EPI adaptés aux produits dangereux et former les utilisateurs.', 'Exposition chimique', 'epi', ['produits dangereux', 'epi']),
  rule('chemical-inventory', ['inventaire produits', 'inventaire des produits'], 'Mettre à jour l’inventaire produits', 'Mettre à jour l’inventaire des produits dangereux présents sur site.', 'Inventaire produits incomplet', 'documentaire', ['produits dangereux']),

  rule('machine-ce-file', ['conformité ce', 'conformite ce', 'dossier technique machine'], 'Vérifier la conformité CE ou le dossier technique', 'Vérifier la conformité CE ou le dossier technique des machines concernées.', 'Conformité machine', 'documentaire', ['machines']),
  rule('machine-guards', ['protections et carters', 'carters', 'protecteurs machine'], 'Contrôler les protections et carters', 'Contrôler la présence, l’état et l’efficacité des protections et carters.', 'Contact avec éléments dangereux', 'contrôle', ['machines']),
  rule('machine-emergency-stop', ['arrêt d’urgence', 'arret d urgence'], 'Tester l’arrêt d’urgence', 'Tester les arrêts d’urgence et documenter les résultats du contrôle.', 'Défaillance arrêt d’urgence', 'contrôle', ['machines']),
  rule('machine-lockout', ['consignation machine', 'consignation équipements', 'consignation equipements'], 'Formaliser la procédure de consignation', 'Formaliser la procédure de consignation avant intervention sur machine ou équipement.', 'Intervention sur équipement', 'procédure', ['machines']),
  rule('machine-training', ['former les opérateurs', 'former les operateurs'], 'Former les opérateurs', 'Former les opérateurs aux risques, consignes et limites d’utilisation des équipements.', 'Utilisation machine', 'formation', ['machines']),
  rule('machine-instructions', ['consignes d’utilisation', 'consignes utilisation'], 'Afficher les consignes d’utilisation', 'Afficher les consignes d’utilisation près des machines concernées.', 'Information opérateurs', 'signalisation', ['machines']),
  rule('machine-maintenance', ['entretien préventif', 'entretien preventif'], 'Planifier l’entretien préventif', 'Planifier l’entretien préventif des machines et conserver les preuves d’intervention.', 'Maintenance équipement', 'maintenance', ['machines']),
  rule('machine-danger-zone', ['zones dangereuses', 'accès aux zones dangereuses', 'acces aux zones dangereuses'], 'Corriger l’accès aux zones dangereuses', 'Corriger ou limiter l’accès aux zones dangereuses des équipements de travail.', 'Accès zone dangereuse', 'correction', ['machines']),
  rule('machine-defective', ['équipement défectueux', 'equipement defectueux'], 'Remplacer l’équipement défectueux', 'Remplacer ou mettre hors service l’équipement défectueux jusqu’à correction.', 'Équipement défectueux', 'correction', ['machines']),
  rule('machine-inspection', ['inspection périodique', 'inspection periodique'], 'Documenter l’inspection périodique', 'Documenter les inspections périodiques des équipements de travail concernés.', 'Suivi inspection', 'documentaire', ['machines']),

  rule('height-guardrails', ['garde-corps', 'garde corps'], 'Vérifier les garde-corps', 'Vérifier l’état, la continuité et la hauteur des garde-corps.', 'Chute de hauteur', 'contrôle', ['travail en hauteur']),
  rule('height-roof-access', ['accès toiture', 'acces toiture'], 'Sécuriser l’accès toiture', 'Sécuriser l’accès toiture et limiter l’accès aux personnes autorisées.', 'Chute de hauteur', 'technique', ['travail en hauteur']),
  rule('height-ladders', ['échelles', 'echelles', 'escabeaux'], 'Contrôler les échelles et escabeaux', 'Contrôler l’état des échelles et escabeaux et retirer le matériel défectueux.', 'Chute de hauteur', 'contrôle', ['travail en hauteur']),
  rule('height-procedure', ['permis travail hauteur', 'procédure travail hauteur', 'procedure travail hauteur'], 'Formaliser la procédure de travail en hauteur', 'Formaliser la procédure ou le permis applicable aux travaux en hauteur.', 'Travail en hauteur', 'procédure', ['travail en hauteur']),
  rule('height-training', ['former travailleurs hauteur', 'formation travail hauteur'], 'Former les travailleurs au travail en hauteur', 'Former les travailleurs concernés aux règles de travail en hauteur.', 'Compétence travail hauteur', 'formation', ['travail en hauteur']),
  rule('height-ppe', ['epi antichute', 'antichute'], 'Fournir les EPI antichute', 'Fournir les EPI antichute adaptés et vérifier leur utilisation.', 'Chute de hauteur', 'epi', ['travail en hauteur', 'epi']),
  rule('height-anchors', ['ancrages', 'contrôle des ancrages', 'controle des ancrages'], 'Planifier le contrôle des ancrages', 'Planifier le contrôle des ancrages et conserver les preuves.', 'Ancrages antichute', 'contrôle', ['travail en hauteur']),
  rule('height-unauthorized', ['accès non autorisé hauteur', 'acces non autorise hauteur'], 'Interdire l’accès non autorisé', 'Interdire et signaler l’accès non autorisé aux zones de travail en hauteur.', 'Accès non autorisé', 'signalisation', ['travail en hauteur']),

  rule('ergonomics-training', ['gestes et postures'], 'Former aux gestes et postures', 'Former les travailleurs aux gestes et postures adaptés aux tâches concernées.', 'Manutention manuelle', 'formation', ['ergonomie', 'manutention']),
  rule('ergonomics-height', ['hauteur de travail'], 'Adapter la hauteur de travail', 'Adapter la hauteur de travail pour réduire les contraintes posturales.', 'Postures contraignantes', 'technique', ['ergonomie']),
  rule('ergonomics-aids', ['aides mécaniques', 'aides mecaniques'], 'Mettre à disposition des aides mécaniques', 'Mettre à disposition des aides mécaniques adaptées aux manutentions.', 'Manutention manuelle', 'technique', ['manutention']),
  rule('ergonomics-loads', ['charges lourdes', 'réduire charges', 'reduire charges'], 'Réduire les charges manutentionnées', 'Réduire les charges, fractionner les manutentions ou adapter l’organisation.', 'Manutention manuelle', 'organisationnelle', ['manutention']),
  rule('ergonomics-rotations', ['rotations', 'rotation des postes'], 'Organiser les rotations', 'Organiser les rotations pour limiter l’exposition aux tâches contraignantes.', 'Exposition ergonomique', 'organisationnelle', ['ergonomie']),
  rule('ergonomics-workstation', ['aménagement poste', 'amenagement poste'], 'Corriger l’aménagement du poste', 'Corriger l’aménagement du poste pour réduire les contraintes ergonomiques.', 'Poste contraignant', 'correction', ['ergonomie']),
  rule('ergonomics-analysis', ['postes contraignants'], 'Analyser les postes contraignants', 'Analyser les postes contraignants et prioriser les adaptations nécessaires.', 'Contraintes ergonomiques', 'analyse', ['ergonomie']),

  rule('noise-measures', ['mesures de bruit', 'mesurage bruit'], 'Mettre à jour les mesures de bruit', 'Réaliser ou mettre à jour les mesures de bruit des postes concernés.', 'Exposition au bruit', 'contrôle', ['bruit']),
  rule('noise-source', ['réduire bruit à la source', 'reduire bruit a la source'], 'Réduire le bruit à la source', 'Réduire le bruit à la source avant de compléter par des protections individuelles.', 'Exposition au bruit', 'technique', ['bruit']),
  rule('noise-ppe', ['protections auditives'], 'Fournir des protections auditives', 'Fournir des protections auditives adaptées et vérifier leur port.', 'Exposition au bruit', 'epi', ['bruit', 'epi']),
  rule('noise-signage', ['zones bruyantes'], 'Signaler les zones bruyantes', 'Signaler les zones bruyantes et les obligations de protection associées.', 'Exposition au bruit', 'signalisation', ['bruit']),
  rule('noise-health', ['surveillance santé bruit', 'surveillance sante bruit'], 'Organiser la surveillance santé bruit', 'Organiser la surveillance santé applicable aux travailleurs exposés au bruit.', 'Exposition au bruit', 'santé', ['bruit']),
  rule('noise-maintenance', ['équipements bruyants', 'equipements bruyants'], 'Planifier l’entretien des équipements bruyants', 'Planifier l’entretien des équipements bruyants pour réduire les émissions sonores.', 'Équipements bruyants', 'maintenance', ['bruit']),

  rule('rps-workload', ['charge de travail'], 'Analyser la charge de travail', 'Analyser la charge de travail et définir des mesures de prévention adaptées.', 'Risques psychosociaux', 'analyse', ['rps']),
  rule('rps-consultation', ['concertation'], 'Organiser la concertation', 'Organiser une concertation sur les facteurs de risques psychosociaux identifiés.', 'Risques psychosociaux', 'organisationnelle', ['rps']),
  rule('rps-trust-person', ['personne de confiance'], 'Informer sur la procédure personne de confiance', 'Informer les travailleurs sur la procédure et les contacts de la personne de confiance.', 'Risques psychosociaux', 'information', ['rps']),
  rule('rps-management-training', ['ligne hiérarchique', 'ligne hierarchique'], 'Former la ligne hiérarchique aux RPS', 'Former la ligne hiérarchique à la détection et au traitement des risques psychosociaux.', 'Risques psychosociaux', 'formation', ['rps']),
  rule('rps-reports', ['signalements rps', 'traiter signalements'], 'Traiter les signalements RPS', 'Traiter les signalements selon la procédure applicable et documenter le suivi.', 'Signalements RPS', 'procédure', ['rps']),
  rule('rps-violence-harassment', ['violence', 'harcèlement', 'harcelement'], 'Mettre à jour la procédure violence et harcèlement', 'Mettre à jour la procédure relative à la violence, au harcèlement et aux comportements abusifs.', 'Violence ou harcèlement', 'procédure', ['rps']),

  rule('traffic-separate-flows', ['piétons/véhicules', 'pietons vehicules', 'séparer flux', 'separer flux'], 'Séparer les flux piétons et véhicules', 'Séparer les flux piétons et véhicules par marquage, organisation ou protection adaptée.', 'Collision piéton-véhicule', 'organisationnelle', ['circulation']),
  rule('traffic-marking', ['voies de circulation', 'marquer voies'], 'Marquer les voies de circulation', 'Marquer les voies de circulation et les cheminements piétons.', 'Circulation interne', 'signalisation', ['circulation']),
  rule('traffic-speed', ['limiter vitesse', 'vitesse interne'], 'Limiter la vitesse interne', 'Limiter la vitesse interne et afficher les règles de circulation.', 'Circulation interne', 'signalisation', ['circulation']),
  rule('traffic-crossings', ['croisements dangereux'], 'Signaler les croisements dangereux', 'Signaler les croisements dangereux et améliorer la visibilité.', 'Collision interne', 'signalisation', ['circulation']),
  rule('traffic-drivers', ['caristes', 'chauffeurs'], 'Former les caristes et chauffeurs', 'Former les caristes et chauffeurs aux règles de circulation du site.', 'Circulation interne', 'formation', ['circulation']),
  rule('traffic-lighting', ['éclairage zones de circulation', 'eclairage zones de circulation'], 'Contrôler l’éclairage des zones de circulation', 'Contrôler l’éclairage des zones de circulation et corriger les défauts.', 'Visibilité circulation', 'contrôle', ['circulation']),
  rule('traffic-plan', ['plan de circulation'], 'Établir un plan de circulation', 'Établir ou mettre à jour le plan de circulation interne.', 'Circulation interne', 'documentaire', ['circulation']),

  rule('contractors-induction', ['accueil sécurité', 'accueil securite'], 'Formaliser l’accueil sécurité', 'Formaliser l’accueil sécurité des entreprises extérieures avant intervention.', 'Coactivité', 'procédure', ['entreprises extérieures']),
  rule('contractors-instructions', ['consignes site'], 'Transmettre les consignes site', 'Transmettre les consignes site applicables aux entreprises extérieures.', 'Coactivité', 'information', ['entreprises extérieures']),
  rule('contractors-certificates', ['attestations', 'habilitations sous-traitants'], 'Vérifier les attestations ou habilitations', 'Vérifier les attestations, habilitations ou autorisations nécessaires avant intervention.', 'Coactivité', 'documentaire', ['entreprises extérieures']),
  rule('contractors-coordination', ['coordination entreprises', 'organiser coordination'], 'Organiser la coordination des interventions', 'Organiser la coordination entre l’entreprise utilisatrice et les entreprises extérieures.', 'Coactivité', 'organisationnelle', ['entreprises extérieures']),
  rule('contractors-prevention-plan', ['plan de prévention', 'plan de prevention'], 'Mettre à jour le plan de prévention', 'Mettre à jour le plan de prévention ou les documents de coordination applicables.', 'Coactivité', 'documentaire', ['entreprises extérieures']),
  rule('contractors-work-permit', ['permis de travail'], 'Contrôler les permis de travail', 'Contrôler les permis de travail requis avant les interventions à risque.', 'Intervention à risque', 'contrôle', ['entreprises extérieures']),

  rule('ppe-required', ['epi requis', 'définir epi', 'definir epi'], 'Définir les EPI requis', 'Définir les EPI requis par tâche ou zone de travail.', 'Protection individuelle', 'epi', ['epi']),
  rule('ppe-supply', ['fournir epi', 'epi adaptés', 'epi adaptes'], 'Fournir les EPI adaptés', 'Fournir les EPI adaptés aux risques et aux travailleurs concernés.', 'Protection individuelle', 'epi', ['epi']),
  rule('ppe-training', ['port des epi'], 'Former au port des EPI', 'Former les travailleurs au port, aux limites et à l’entretien des EPI.', 'Utilisation EPI', 'formation', ['epi']),
  rule('ppe-use-control', ['utilisation epi'], 'Contrôler l’utilisation des EPI', 'Contrôler l’utilisation effective des EPI dans les zones ou tâches concernées.', 'Utilisation EPI', 'contrôle', ['epi']),
  rule('ppe-replace', ['epi défectueux', 'epi defectueux'], 'Remplacer les EPI défectueux', 'Remplacer les EPI défectueux et retirer les équipements non utilisables.', 'EPI défectueux', 'correction', ['epi']),
  rule('ppe-register', ['registre de remise'], 'Tenir un registre de remise des EPI', 'Tenir un registre de remise des EPI et des informations associées.', 'Traçabilité EPI', 'documentaire', ['epi']),

  rule('hygiene-sanitary', ['sanitaires'], 'Vérifier les sanitaires', 'Vérifier l’état, l’accessibilité et l’entretien des sanitaires.', 'Hygiène locaux sociaux', 'contrôle', ['hygiène']),
  rule('hygiene-ventilation', ['ventilation locaux', 'contrôler ventilation', 'controler ventilation'], 'Contrôler la ventilation', 'Contrôler la ventilation des locaux concernés et corriger les insuffisances.', 'Qualité air intérieur', 'contrôle', ['hygiène']),
  rule('hygiene-cleaning', ['nettoyage'], 'Assurer le nettoyage des locaux', 'Assurer le nettoyage régulier des locaux et documenter l’organisation prévue.', 'Hygiène des locaux', 'organisationnelle', ['hygiène']),
  rule('hygiene-defects', ['défauts locaux', 'defauts locaux'], 'Signaler les défauts des locaux', 'Signaler les défauts constatés dans les locaux sociaux et suivre leur correction.', 'Locaux sociaux', 'signalement', ['hygiène']),
  rule('hygiene-water', ['eau potable'], 'Mettre à disposition de l’eau potable', 'Mettre à disposition de l’eau potable accessible aux travailleurs.', 'Locaux sociaux', 'organisationnelle', ['hygiène']),
  rule('hygiene-rest', ['locaux de repos'], 'Vérifier les locaux de repos', 'Vérifier l’état et l’adéquation des locaux de repos.', 'Locaux sociaux', 'contrôle', ['hygiène']),
  rule('hygiene-mold', ['humidité', 'humidite', 'moisissures'], 'Corriger l’humidité ou les moisissures', 'Corriger les problèmes d’humidité ou de moisissures dans les locaux.', 'Qualité des locaux', 'correction', ['hygiène']),
];

export async function extractPreventionDossierItems(input = {}) {
  const context = normalizeInput(input);
  let extracted = null;

  if (context.openai?.responses?.create) {
    try {
      extracted = await extractWithAi(context);
    } catch {
      context.warnings.push('Extraction IA indisponible, fallback déterministe utilisé.');
    }
  }

  const raw = extracted || deterministicFallback(context);
  const sanitized = sanitizeExtraction(raw, context);
  const pgpExtraction = extractPgpActionCandidates(input);
  const nonPgpItems = sanitized.items.filter((item) => item.destination !== 'pgp');
  const evidenceItems = uniqueCandidates([
    ...sanitized.items.filter((item) => item.destination === 'evidence'),
    ...pgpExtraction.evidenceItems,
  ]);
  const validationPoints = uniqueCandidates([
    ...sanitized.items.filter((item) => item.destination === 'validationPoint'),
    ...pgpExtraction.validationPoints,
  ]);

  return {
    ...sanitized,
    items: [...nonPgpItems, ...pgpExtraction.items],
    pgpCandidates: pgpExtraction.items,
    piuCandidates: sanitized.items.filter((item) => item.destination === 'piu'),
    evidenceItems,
    validationPoints,
    ignoredItems: [...sanitized.ignoredItems, ...pgpExtraction.ignoredItems].slice(0, LIMITS.ignoredTechnical),
    warnings: uniqueStrings([...sanitized.warnings, ...pgpExtraction.warnings]),
  };
}

export async function extractPreventionDossier(input = {}) {
  return extractPreventionDossierItems(input);
}

export function classifyPreventionCandidate(text, context = {}) {
  const raw = clean(text);
  const normalized = normalize(raw);
  if (!normalized) {
    return ignored('Élément vide ou insuffisant.');
  }
  if (isStrictTechnical(raw)) {
    return ignored('Élément technique ou structurel sans valeur métier à valider.');
  }
  if (isTableHeaderOrHeavyMarkdown(raw)) {
    return ignored('En-tête ou bloc Markdown technique sans valeur métier.');
  }

  const isBlocking = hasAny(normalized, VALIDATION_TERMS);
  const hasPiu = hasAny(normalized, PIU_TERMS);
  const hasPgpVerb = hasAny(normalized, PGP_VERBS);
  const hasEvidence = hasAny(normalized, EVIDENCE_TERMS) || hasAny(normalized, ['preuve à obtenir', 'preuve a obtenir']);
  const doc = normalize(context.documentType);

  if (hasPgpVerb && !hasAny(normalized, ['évacuation générale', 'evacuation generale', 'point de rassemblement', 'accueil secours', 'accueil des secours', 'accès pompiers', 'acces pompiers', 'personne bloquée', 'personne bloquee', 'fuite gaz', 'fuite de gaz', 'déversement dangereux', 'deversement dangereux', 'confinement'])) {
    return {
      destination: 'pgp',
      shouldReview: true,
      confidence: 0.84,
      reason: 'Action de prévention concrète issue de l’analyse.',
    };
  }

  if (hasPiu && hasAny(normalized, ['secours', 'urgence', 'évacuation', 'evacuation', 'incendie', 'rassemblement', 'bloquée', 'bloquee', 'coupure'])) {
    return {
      destination: 'piu',
      shouldReview: true,
      confidence: 0.9,
      reason: 'Situation d’urgence opérationnelle utile au PIU.',
    };
  }

  if (hasEvidence) {
    return {
      destination: 'evidence',
      shouldReview: isBlocking,
      confidence: isBlocking ? 0.85 : 0.78,
      reason: isBlocking ? 'Preuve bloquante avant validation.' : 'Preuve à obtenir pour compléter le dossier.',
    };
  }

  if (isBlocking) {
    return {
      destination: 'validationPoint',
      shouldReview: true,
      confidence: 0.82,
      reason: 'Point nécessitant validation ou arbitrage du conseiller.',
    };
  }

  if (hasAny(normalized, ['annexe', 'joindre', 'dossier pompiers']) && !hasAny(normalized, ['urgence', 'secours'])) {
    return {
      destination: 'annex',
      shouldReview: false,
      confidence: 0.68,
      reason: 'Annexe documentaire potentielle.',
    };
  }

  if (doc.includes('ascenseur') && hasAny(normalized, ['personne bloquee cabine', 'personne bloquee en cabine'])) {
    return {
      destination: 'piu',
      shouldReview: true,
      confidence: 0.9,
      reason: 'Scénario d’urgence ascenseur.',
    };
  }

  return {
    destination: 'info',
    shouldReview: false,
    confidence: 0.35,
    reason: 'Texte descriptif sans décision métier immédiate.',
  };
}

export function buildCandidateFingerprint(candidate = {}) {
  const destination = normalizeDestination(candidate.destination);
  const title = slug(candidate.normalizedTitle || candidate.title || candidate.objective || '');
  const risk = slug(candidate.normalizedRisk || candidate.risk || candidate.riskTargeted || '');
  return [destination, title, risk].filter(Boolean).join('|');
}

export function extractPgpActionCandidates(input = {}) {
  const context = normalizeInput(input);
  const seen = new Set(context.existingCandidateFingerprints);
  const items = [];
  const evidenceItems = [];
  const validationPoints = [];
  const ignoredItems = [];
  const lower = normalize(context.markdown);

  for (const fragment of extractFragments(context.markdown)) {
    classifyNonPgpFragment(fragment, context, { evidenceItems, validationPoints, ignoredItems });
  }

  for (const pgpRule of PGP_RULES) {
    if (!hasAny(lower, pgpRule.triggers)) continue;
    const candidate = normalizePgpActionCandidate({
      ...pgpRule,
      sourceDocumentId: context.sourceDocumentId,
      sourceReference: context.sourceReference,
      sourceDocumentType: context.documentType,
    }, context);

    if (!isConcretePgpAction(candidate.title) || isForbiddenPgpText(`${candidate.title} ${candidate.description}`)) {
      pushPgpIgnored(ignoredItems, candidate.title, 'Élément non retenu comme action PGA concrète.', context);
      continue;
    }

    candidate.fingerprint = buildPgpFingerprint(candidate);
    candidate.id = stableId(candidate.fingerprint);
    candidate.sourceReferences = [context.sourceReference].filter(Boolean);

    if (seen.has(candidate.fingerprint)) {
      pushPgpIgnored(ignoredItems, candidate.title, 'Déjà présent dans le dossier prévention', context);
      continue;
    }

    seen.add(candidate.fingerprint);
    items.push(candidate);
    if (items.length >= LIMITS.pgp) break;
  }

  return {
    items,
    evidenceItems: uniqueCandidates(evidenceItems),
    validationPoints: uniqueCandidates(validationPoints),
    ignoredItems: ignoredItems.slice(0, LIMITS.ignoredTechnical),
    warnings: [],
  };
}

export function buildPgpFingerprint(candidate = {}) {
  return ['pgp', slug(candidate.normalizedTitle || candidate.title || ''), slug(candidate.normalizedRisk || candidate.risk || '')]
    .filter(Boolean)
    .join('|');
}

async function extractWithAi(context) {
  const response = await context.openai.responses.create({
    model: context.model,
    max_output_tokens: context.maxOutputTokens,
    instructions: AI_SYSTEM_PROMPT,
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `${AI_USER_PROMPT}

Contexte:
${JSON.stringify({
  companyKey: context.companyKey,
  documentType: context.documentType,
  sourceDocumentId: context.sourceDocumentId,
  sourceReference: context.sourceReference,
  formData: context.formData,
  language: context.language,
}, null, 2)}

Analyse:
${context.markdown.slice(0, 45000)}`,
      }],
    }],
  });

  const parsed = parseJson(response?.output_text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Réponse IA invalide.');
  }
  return parsed;
}

function deterministicFallback(context) {
  const text = context.markdown;
  const lower = normalize(text);
  const candidates = [];
  const ignoredItems = [];

  for (const fragment of extractFragments(text)) {
    const classification = classifyPreventionCandidate(fragment, context);
    if (classification.destination === 'ignoredTechnical' || classification.destination === 'info') {
      ignoredItems.push({ title: shortTitle(fragment), ...classification });
      continue;
    }
    candidates.push(candidateFromText(fragment, classification, context));
  }

  addFireEvacuationCandidates(candidates, lower, context);
  addElectricalCandidates(candidates, lower, context);
  addElevatorCandidates(candidates, lower, context);

  return { items: candidates, ignoredItems, warnings: [] };
}

function addFireEvacuationCandidates(candidates, lower, context) {
  if (!hasAny(lower, ['incendie', 'evacuation', 'évacuation', 'extincteur', 'coupe feu', 'fds'])) return;

  if (hasAny(lower, ['évacuation générale', 'evacuation generale'])) {
    candidates.push(baseCandidate('piu', 'Organiser l’évacuation générale', 'Définir l’alerte, les rôles et le cheminement d’évacuation en cas d’incendie.', 'Évacuation incendie', context, ['incendie', 'évacuation', 'piu']));
  }
  if (hasAny(lower, ['point de rassemblement'])) {
    candidates.push(baseCandidate('piu', 'Confirmer le point de rassemblement', 'Localiser et communiquer le point de rassemblement à utiliser après évacuation.', 'Évacuation incendie', context, ['incendie', 'évacuation', 'piu']));
  }
  if (hasAny(lower, ['accueil secours', 'accueil des secours', 'accueil pompiers', 'accès pompiers', 'acces pompiers'])) {
    candidates.push(baseCandidate('piu', 'Organiser l’accueil des secours', 'Prévoir l’accueil des secours, les accès pompiers et les informations utiles à transmettre.', 'Intervention des secours', context, ['incendie', 'secours', 'piu']));
  }
  if (hasAny(lower, ['dégager voies', 'degager voies', 'dégager les voies', 'degager les voies', 'issues'])) {
    candidates.push(baseCandidate('pgp', 'Dégager les voies d’évacuation', 'Dégager les voies d’évacuation, marquer les zones interdites au stockage et contrôler leur maintien libre.', 'Obstruction issues', context, ['incendie', 'évacuation', 'pgp'], {
      priority: 'élevée',
      deadline: 'immédiat',
      evidence: 'Photos avant/après, check-list de contrôle, consigne stockage',
      responsible: 'Responsable logistique / ligne hiérarchique',
    }));
  }
  if (hasAny(lower, ['extincteurs accessibles', 'moyens extinction accessibles', 'moyens d extinction accessibles'])) {
    candidates.push(baseCandidate('pgp', 'Rendre les moyens d’extinction accessibles', 'Contrôler l’accessibilité des extincteurs et supprimer les obstacles autour des moyens de première intervention.', 'Moyens d’extinction inaccessibles', context, ['incendie', 'extinction', 'pgp']));
  }
  if (hasAny(lower, ['portes coupe-feu', 'portes coupe feu', 'porte coupe-feu', 'porte coupe feu'])) {
    candidates.push(baseCandidate('pgp', 'Contrôler les portes coupe-feu', 'Vérifier la fermeture, l’absence de calage et le maintien en bon état des portes coupe-feu.', 'Compartimentage incendie', context, ['incendie', 'coupe-feu', 'pgp']));
  }
  if (hasAny(lower, ['fds', 'fiche de donnees de securite', 'fiche de données de sécurité', 'produits dangereux'])) {
    candidates.push(baseCandidate('evidence', 'Obtenir les FDS des produits dangereux', 'Centraliser les fiches de données de sécurité utiles à l’analyse et aux interventions.', 'Produits dangereux', context, ['produits dangereux', 'evidence'], { shouldReview: false, evidence: 'FDS à obtenir' }));
  }
  if (hasAny(lower, ['rapport extincteurs', 'rapport de contrôle extincteurs', 'rapport controle extincteurs'])) {
    candidates.push(baseCandidate('evidence', 'Obtenir le rapport de contrôle des extincteurs', 'Joindre le dernier rapport de contrôle des extincteurs et suivre les remarques ouvertes.', 'Moyens d’extinction', context, ['incendie', 'evidence'], { shouldReview: false, evidence: 'Rapport extincteurs à obtenir' }));
  }
  if (hasAny(lower, ['exercice évacuation', 'exercice evacuation'])) {
    candidates.push(baseCandidate('pgp', 'Planifier un exercice d’évacuation', 'Organiser un exercice d’évacuation et conserver le retour d’expérience.', 'Préparation évacuation', context, ['incendie', 'évacuation', 'pgp']));
  }
  if (hasAny(lower, ['dossier pompiers'])) {
    const destination = hasAny(lower, ['urgence', 'secours', 'accès pompiers', 'acces pompiers']) ? 'piu' : 'evidence';
    candidates.push(baseCandidate(destination, 'Préparer le dossier pompiers', 'Centraliser les informations utiles aux secours et les plans disponibles.', 'Intervention des secours', context, ['incendie', 'secours', destination], { shouldReview: destination === 'piu' }));
  }
}

function addElectricalCandidates(candidates, lower, context) {
  if (!hasAny(lower, ['rgie', 'arei', 'ba4', 'ba5', 'tgbt', 'thermographie', 'consignation', 'loto', 'local électrique', 'local electrique', 'cabine ht'])) return;

  if (hasAny(lower, ['coupure électrique d’urgence', 'coupure electrique d urgence', 'coupure générale électrique', 'coupure generale electrique', 'coupure tgbt']) && hasAny(lower, ['secours', 'urgence', 'pompiers'])) {
    candidates.push(baseCandidate('piu', 'Localiser la coupure électrique d’urgence', 'Identifier la coupure électrique utile aux secours et les personnes autorisées à intervenir.', 'Incident électrique nécessitant coupure', context, ['électrique', 'secours', 'piu']));
  }
  if (hasAny(lower, ['accès local électrique', 'acces local electrique', 'cabine ht']) && hasAny(lower, ['secours', 'urgence'])) {
    candidates.push(baseCandidate('piu', 'Organiser l’accès secours au local électrique', 'Définir les modalités d’accès au local électrique ou HT en situation d’urgence.', 'Accès installation électrique', context, ['électrique', 'secours', 'piu']));
  }
  if (hasAny(lower, ['pv rgie', 'contrôle rgie', 'controle rgie', 'rapport rgie'])) {
    candidates.push(baseCandidate('evidence', 'Obtenir le PV RGIE', 'Joindre le contrôle RGIE disponible et suivre les remarques éventuelles.', 'Conformité électrique', context, ['électrique', 'evidence'], { shouldReview: false, evidence: 'PV RGIE à obtenir' }));
  }
  if (hasAny(lower, ['thermographie'])) {
    candidates.push(baseCandidate('evidence', 'Obtenir le rapport de thermographie', 'Joindre ou planifier le rapport de thermographie des installations critiques.', 'Échauffement électrique', context, ['électrique', 'evidence'], { shouldReview: false, evidence: 'Rapport de thermographie' }));
  }
  if (hasAny(lower, ['schémas', 'schemas', 'plans de coupure'])) {
    candidates.push(baseCandidate('evidence', 'Joindre les schémas électriques', 'Centraliser les schémas électriques et plans de coupure utiles au dossier technique.', 'Documentation électrique', context, ['électrique', 'evidence'], { shouldReview: false }));
  }
  if (hasAny(lower, ['ba4', 'ba5'])) {
    candidates.push(baseCandidate('pgp', 'Formaliser les habilitations BA4/BA5', 'Confirmer les personnes BA4/BA5 autorisées et conserver les preuves d’information ou d’habilitation.', 'Interventions électriques', context, ['électrique', 'pgp']));
  }
  if (hasAny(lower, ['consignation', 'loto'])) {
    candidates.push(baseCandidate('pgp', 'Formaliser la consignation électrique', 'Définir la procédure de consignation/LOTO, les rôles autorisés et les preuves de formation.', 'Interventions électriques', context, ['électrique', 'pgp']));
  }
}

function addElevatorCandidates(candidates, lower, context) {
  if (!hasAny(lower, ['ascenseur', 'cabine', 'sect', 'modernisation'])) return;

  if (hasAny(lower, ['personne bloquée', 'personne bloquee', 'bloquée en cabine', 'bloquee en cabine'])) {
    candidates.push(baseCandidate('piu', 'Gérer une personne bloquée en cabine', 'Prévoir l’appel secours ascenseur, l’information de la personne bloquée et le contact maintenance.', 'Personne bloquée dans l’ascenseur', context, ['ascenseur', 'piu']));
  }
  if (hasAny(lower, ['appel secours ascenseur', 'appel de secours ascenseur'])) {
    candidates.push(baseCandidate('piu', 'Vérifier l’appel secours ascenseur', 'Confirmer le fonctionnement et la procédure d’appel secours ascenseur en cas de blocage.', 'Alerte ascenseur', context, ['ascenseur', 'piu']));
  }
  if (hasAny(lower, ['rapport sect', 'contrôle sect', 'controle sect'])) {
    candidates.push(baseCandidate('evidence', 'Obtenir le rapport SECT ascenseur', 'Joindre le rapport SECT et suivre les remarques ou non-conformités ouvertes.', 'Contrôle ascenseur', context, ['ascenseur', 'evidence'], { shouldReview: false, evidence: 'Rapport SECT à obtenir' }));
  }
  if (hasAny(lower, ['modernisation'])) {
    candidates.push(baseCandidate('pgp', 'Planifier les suites de modernisation ascenseur', 'Analyser les remarques de modernisation et planifier les actions nécessaires.', 'Modernisation ascenseur', context, ['ascenseur', 'pgp']));
  }
  if (hasAny(lower, ['signalisation', 'consignes usagers', 'consignes utilisateurs'])) {
    candidates.push(baseCandidate('pgp', 'Mettre à jour les consignes ascenseur', 'Afficher les consignes usagers et les contacts utiles près de l’ascenseur.', 'Information usagers ascenseur', context, ['ascenseur', 'pgp']));
  }
}

function sanitizeExtraction(raw, context) {
  const seen = new Set(context.existingCandidateFingerprints);
  const items = [];
  const ignoredItems = [];
  const destinationCounts = Object.fromEntries(Object.keys(LIMITS).map((key) => [key, 0]));

  for (const rawIgnored of array(raw.ignoredItems)) {
    pushIgnored(ignoredItems, rawIgnored, context, destinationCounts, rawIgnored.reason || 'Élément ignoré.');
  }

  for (const rawItem of array(raw.items)) {
    const item = normalizeCandidate(rawItem, context);
    const classification = classifyPreventionCandidate([
      item.title,
      item.description,
      item.risk,
      item.evidence,
    ].filter(Boolean).join(' '), context);

    item.destination = shouldKeepDestination(item.destination, classification.destination)
      ? item.destination
      : classification.destination;
    item.shouldReview = resolveShouldReview(item, classification);
    item.reason = item.reason || classification.reason;
    item.confidence = clampNumber(item.confidence || classification.confidence, 0, 1);

    if (item.destination === 'ignoredTechnical' || item.destination === 'info') {
      pushIgnored(ignoredItems, item, context, destinationCounts, item.reason);
      continue;
    }

    if (destinationCounts[item.destination] >= LIMITS[item.destination]) continue;

    item.fingerprint = buildCandidateFingerprint(item);
    item.id = item.id || stableId(item.fingerprint);
    item.status = 'à valider';
    item.sourceReference = context.sourceReference;
    item.sourceReferences = uniqueStrings([...(array(item.sourceReferences)), context.sourceReference]);
    item.sourceDocumentId = context.sourceDocumentId;
    item.sourceDocumentType = context.documentType;

    if (seen.has(item.fingerprint)) {
      pushIgnored(ignoredItems, {
        destination: 'ignoredTechnical',
        shouldReview: false,
        title: item.title,
        reason: 'Déjà présent dans le dossier prévention',
      }, context, destinationCounts, 'Déjà présent dans le dossier prévention');
      continue;
    }

    seen.add(item.fingerprint);
    destinationCounts[item.destination] += 1;
    items.push(item);
  }

  return {
    companyKey: context.companyKey,
    sourceDocumentId: context.sourceDocumentId,
    sourceReference: context.sourceReference,
    sourceDocumentType: context.documentType,
    items,
    ignoredItems,
    warnings: uniqueStrings([...(array(raw.warnings)), ...context.warnings]),
  };
}

function normalizeCandidate(rawItem, context) {
  const item = plainObject(rawItem);
  const destination = normalizeDestination(item.destination);
  const title = truncate(clean(item.title || item.objective || item.risk || 'Élément à valider'), 90);
  return {
    id: clean(item.id),
    fingerprint: clean(item.fingerprint),
    destination,
    shouldReview: Boolean(item.shouldReview),
    status: 'à valider',
    title,
    description: truncate(clean(item.description || item.mainMeasure || item.reason), 240),
    risk: truncate(clean(item.risk || item.riskTargeted), 120),
    priority: truncate(clean(item.priority || defaultPriority(destination)), 60),
    responsible: truncate(clean(item.responsible || defaultResponsible(destination)), 90),
    deadline: truncate(clean(item.deadline || item.proposedDeadline || defaultDeadline(destination)), 60),
    evidence: truncate(clean(item.evidence || item.expectedEvidence), 180),
    sourceReference: context.sourceReference,
    sourceDocumentId: context.sourceDocumentId,
    sourceDocumentType: context.documentType,
    sourceReferences: array(item.sourceReferences),
    confidence: clampNumber(item.confidence, 0, 1),
    reason: truncate(clean(item.reason), 180),
    tags: uniqueStrings(array(item.tags)).slice(0, 8),
  };
}

function normalizePgpActionCandidate(rawItem, context) {
  return {
    id: clean(rawItem.id),
    fingerprint: clean(rawItem.fingerprint),
    destination: 'pgp',
    shouldReview: true,
    status: 'à valider',
    title: truncate(clean(rawItem.title), 90),
    description: truncate(clean(rawItem.description), 240),
    risk: truncate(clean(rawItem.risk), 120),
    actionType: truncate(clean(rawItem.actionType || 'prévention'), 60),
    priority: truncate(clean(rawItem.priority || 'à prioriser'), 60),
    responsible: truncate(clean(rawItem.responsible || 'Ligne hiérarchique / conseiller en prévention'), 90),
    deadline: truncate(clean(rawItem.deadline || 'à planifier'), 60),
    evidence: truncate(clean(rawItem.evidence || 'Preuve d’action ou contrôle à conserver'), 180),
    sourceDocumentId: context.sourceDocumentId,
    sourceReference: context.sourceReference,
    sourceDocumentType: context.documentType,
    confidence: clampNumber(rawItem.confidence || 0.9, 0, 1),
    reason: truncate(clean(rawItem.reason || 'Action de prévention concrète détectée dans l’analyse.'), 180),
    tags: uniqueStrings(['pgp', ...array(rawItem.tags)]).slice(0, 8),
  };
}

function classifyNonPgpFragment(fragment, context, buckets) {
  const text = clean(fragment);
  if (!text) return;
  const normalized = normalize(text);
  if (isForbiddenPgpText(text)) {
    pushPgpIgnored(buckets.ignoredItems, shortTitle(text), 'Élément exclu du PGA/PAA/PGP.', context);
    return;
  }
  if (!isConcretePgpAction(text)) {
    if (hasAny(normalized, ['rapport', 'photo', 'fds', 'attestation', 'registre', 'plan à joindre', 'plan a joindre'])) {
      buckets.evidenceItems.push(normalizeSupportingItem('evidence', text, context, 'Preuve à obtenir hors action PGA.'));
    } else if (hasAny(normalized, VALIDATION_TERMS)) {
      buckets.validationPoints.push(normalizeSupportingItem('validationPoint', text, context, 'Point à valider avant intégration.'));
    } else if (hasAny(normalized, ['annexe', 'annexes'])) {
      pushPgpIgnored(buckets.ignoredItems, shortTitle(text), 'Annexe seule non retenue comme action PGA.', context);
    }
  }
}

function normalizeSupportingItem(destination, text, context, reason) {
  const title = shortTitle(text);
  const item = {
    id: stableId(`${destination}|${title}|${context.sourceReference}`),
    fingerprint: [destination, slug(title), slug(inferRisk(text))].filter(Boolean).join('|'),
    destination,
    shouldReview: destination === 'validationPoint',
    status: 'à valider',
    title,
    description: truncate(clean(text), 240),
    risk: truncate(inferRisk(text), 120),
    sourceDocumentId: context.sourceDocumentId,
    sourceReference: context.sourceReference,
    sourceDocumentType: context.documentType,
    confidence: 0.7,
    reason,
    tags: [destination],
  };
  return item;
}

function isConcretePgpAction(value) {
  const text = normalize(value);
  return hasAny(text, PGP_VERBS);
}

function isForbiddenPgpText(value) {
  const text = clean(value);
  const normalized = normalize(text);
  if (isStrictTechnical(text) || isTableHeaderOrHeavyMarkdown(text)) return true;
  if ((text.match(/\|/g) || []).length > 5) return true;
  if (TECHNICAL_EXCLUSIONS.some((term) => normalized.includes(normalize(term)))) return true;
  if (hasAny(normalized, [
    'paa plan annuel d action',
    'pgp plan global de prevention',
    'registre seul',
    'photo seule',
    'rapport seul',
    'fds seule',
    'annexe seule',
    'texte purement descriptif',
    'en tete de tableau',
    'en-tete de tableau',
  ])) return true;
  const stripped = normalized.replace(/\b(rapport|photo|fds|annexe|registre)\b/g, '').trim();
  if (!stripped && hasAny(normalized, ['rapport', 'photo', 'fds', 'annexe', 'registre'])) return true;
  return false;
}

function pushPgpIgnored(ignoredItems, title, reason, context) {
  if (ignoredItems.length >= LIMITS.ignoredTechnical) return;
  ignoredItems.push({
    destination: 'ignoredTechnical',
    shouldReview: false,
    title: truncate(clean(title || 'Élément ignoré'), 90),
    reason,
    sourceReference: context.sourceReference,
    sourceDocumentId: context.sourceDocumentId,
  });
}

function rule(key, triggers, title, description, risk, actionType, tags = []) {
  return {
    key,
    triggers,
    title,
    description,
    risk,
    actionType,
    priority: 'à prioriser',
    deadline: 'à planifier',
    evidence: 'Preuve d’action ou contrôle à conserver',
    confidence: 0.9,
    reason: 'Action de prévention concrète détectée par règle métier.',
    tags,
  };
}

function candidateFromText(fragment, classification, context) {
  return baseCandidate(
    classification.destination,
    shortTitle(fragment),
    clean(fragment),
    inferRisk(fragment),
    context,
    tagsFor(classification.destination, fragment),
    {
      shouldReview: classification.shouldReview,
      confidence: classification.confidence,
      reason: classification.reason,
    },
  );
}

function baseCandidate(destination, title, description, risk, context, tags = [], overrides = {}) {
  const classification = classifyPreventionCandidate(`${title} ${description} ${risk}`, context);
  const finalDestination = normalizeDestination(destination);
  const shouldReview = overrides.shouldReview ?? resolveShouldReview({ destination: finalDestination, title, description, risk }, classification);
  return {
    destination: finalDestination,
    shouldReview,
    status: 'à valider',
    title,
    description,
    risk,
    priority: overrides.priority || defaultPriority(finalDestination),
    responsible: overrides.responsible || defaultResponsible(finalDestination),
    deadline: overrides.deadline || defaultDeadline(finalDestination),
    evidence: overrides.evidence || defaultEvidence(finalDestination),
    sourceReference: context.sourceReference,
    sourceDocumentId: context.sourceDocumentId,
    sourceDocumentType: context.documentType,
    confidence: overrides.confidence || classification.confidence || 0.82,
    reason: overrides.reason || classification.reason || 'Candidat extrait de l’analyse.',
    tags,
  };
}

function pushIgnored(ignoredItems, rawItem, context, destinationCounts, reason) {
  if (destinationCounts.ignoredTechnical >= LIMITS.ignoredTechnical) return;
  const item = plainObject(rawItem);
  ignoredItems.push({
    destination: normalizeDestination(item.destination || 'ignoredTechnical') === 'info' ? 'info' : 'ignoredTechnical',
    shouldReview: false,
    title: truncate(clean(item.title || 'Élément ignoré'), 90),
    reason: truncate(clean(reason || item.reason || 'Élément ignoré.'), 180),
    sourceReference: context.sourceReference,
    sourceDocumentId: context.sourceDocumentId,
  });
  destinationCounts.ignoredTechnical += 1;
}

function resolveShouldReview(item, classification) {
  const destination = normalizeDestination(item.destination);
  const text = normalize([item.title, item.description, item.risk, item.evidence].filter(Boolean).join(' '));
  if (destination === 'piu') return classification.shouldReview && classification.destination === 'piu';
  if (destination === 'pgp') return hasAny(text, PGP_VERBS) || classification.shouldReview;
  if (destination === 'validationPoint') return true;
  if (destination === 'evidence') return hasAny(text, VALIDATION_TERMS);
  return false;
}

function shouldKeepDestination(current, classified) {
  if (current === 'piu' && classified === 'evidence') return false;
  if (current === 'piu' && classified === 'pgp') return false;
  if (current === 'evidence' && classified === 'pgp' && !hasAny(normalize(current), ['rapport', 'photo', 'fds'])) return true;
  return ALLOWED_DESTINATIONS.has(current);
}

function normalizeInput(input) {
  return {
    companyKey: clean(input.companyKey),
    documentType: clean(input.documentType),
    sourceDocumentId: clean(input.sourceDocumentId),
    sourceReference: clean(input.sourceReference),
    markdown: String(input.markdown || ''),
    formData: plainObject(input.formData),
    existingCandidateFingerprints: normalizeExistingFingerprints(input.existingCandidateFingerprints),
    language: clean(input.language || 'fr'),
    openai: input.openai,
    model: input.model || 'gpt-4.1-mini',
    maxOutputTokens: Number(input.maxOutputTokens || 5000),
    warnings: [],
  };
}

function normalizeExistingFingerprints(value) {
  const output = new Set();
  for (const fingerprint of array(value)) {
    const cleaned = clean(fingerprint);
    if (!cleaned) continue;
    output.add(cleaned);
    const parts = cleaned.split('|');
    if (parts.length > 3) output.add(parts.slice(0, 3).join('|'));
  }
  return output;
}

function extractFragments(markdown) {
  return String(markdown || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => clean(line.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '')))
    .filter(Boolean)
    .filter((line) => line.length <= 500);
}

function isStrictTechnical(value) {
  const text = clean(value);
  const normalized = normalize(text);
  if (/^page\s+\d+\s*\/\s*\d+$/i.test(text)) return true;
  if (TECHNICAL_EXCLUSIONS.some((term) => normalized.includes(normalize(term)))) return true;
  if (hasAny(normalized, ['texte purement descriptif'])) return true;
  return false;
}

function isTableHeaderOrHeavyMarkdown(value) {
  const text = clean(value);
  if ((text.match(/\|/g) || []).length >= 4) return true;
  const normalized = normalize(text);
  return hasAny(normalized, ['n tache danger situation dangereuse', 'risque dommage possible exposes mesures existantes']);
}

function ignored(reason) {
  return {
    destination: 'ignoredTechnical',
    shouldReview: false,
    confidence: 0.1,
    reason,
  };
}

function normalizeDestination(value) {
  const normalized = clean(value);
  return ALLOWED_DESTINATIONS.has(normalized) ? normalized : 'info';
}

function defaultPriority(destination) {
  if (destination === 'piu') return 'élevée';
  if (destination === 'pgp') return 'à prioriser';
  return '';
}

function defaultResponsible(destination) {
  if (destination === 'pgp') return 'Ligne hiérarchique / conseiller en prévention';
  if (destination === 'piu') return 'Employeur / conseiller en prévention';
  return '';
}

function defaultDeadline(destination) {
  if (destination === 'piu') return 'avant validation PIU';
  if (destination === 'pgp') return 'à planifier';
  return '';
}

function defaultEvidence(destination) {
  if (destination === 'pgp') return 'Preuve d’action, contrôle ou photo après correction';
  if (destination === 'evidence') return 'Document ou preuve à obtenir';
  return '';
}

function inferRisk(value) {
  const text = normalize(value);
  if (hasAny(text, ['voie evacuation', 'issue'])) return 'Obstruction issues';
  if (hasAny(text, ['extincteur'])) return 'Moyens d’extinction inaccessibles';
  if (hasAny(text, ['coupe feu'])) return 'Compartimentage incendie';
  if (hasAny(text, ['fds', 'produits dangereux'])) return 'Produits dangereux';
  if (hasAny(text, ['rgie', 'tgbt', 'ba4', 'ba5', 'thermographie'])) return 'Risque électrique';
  if (hasAny(text, ['ascenseur', 'cabine'])) return 'Risque ascenseur';
  return '';
}

function tagsFor(destination, value) {
  const text = normalize(value);
  const tags = [destination];
  if (hasAny(text, ['incendie', 'evacuation', 'extincteur'])) tags.unshift('incendie');
  if (hasAny(text, ['rgie', 'tgbt', 'ba4', 'ba5', 'electrique'])) tags.unshift('électrique');
  if (hasAny(text, ['ascenseur', 'cabine'])) tags.unshift('ascenseur');
  return uniqueStrings(tags);
}

function shortTitle(value) {
  const cleaned = clean(value)
    .replace(/^[-*]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s*:\s*$/, '');
  const firstPart = cleaned.split(/[.;]/)[0] || cleaned;
  return truncate(firstPart, 90);
}

function stableId(value) {
  return `candidate-${crypto.createHash('sha1').update(clean(value)).digest('hex').slice(0, 12)}`;
}

function slug(value) {
  return normalize(value)
    .split(' ')
    .filter((part) => !['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'l', 'la', 'le', 'les'].includes(part))
    .join(' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function hasAny(text, needles) {
  const normalized = normalize(text);
  return needles.some((needle) => normalized.includes(normalize(needle)));
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value, maxLength) {
  const cleaned = clean(value);
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength - 1).trimEnd();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const cleaned = clean(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    output.push(cleaned);
  }
  return output;
}

function uniqueCandidates(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const key = clean(value.fingerprint) || buildCandidateFingerprint(value) || clean(value.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function parseJson(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}
