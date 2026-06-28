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
  return sanitizeExtraction(raw, context);
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
