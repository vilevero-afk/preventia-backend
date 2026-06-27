import crypto from 'node:crypto';

const ALLOWED_RISK_PROFILES = new Set([
  'faible',
  'modéré',
  'élevé',
  'très élevé',
  'Seveso seuil bas',
  'Seveso seuil haut',
  'inconnu / à déterminer',
]);

const RISK_PROFILE_WARNING =
  "Profil de risque de l’entreprise à confirmer avant validation du PIU et du PGP/PAA.";
const RISK_PROFILE_VERIFY_TITLE =
  "Déterminer le profil de risque de l’entreprise avant validation du PIU et du PGP/PAA.";
const VERIFICATION_SOURCE =
  'À vérifier dans la version applicable du Code du bien-être au travail ou auprès des personnes compétentes.';
const PIU_EXCLUSION_WARNING =
  "Certains éléments ont été exclus du PIU car ils ne relèvent pas d’une situation d’urgence opérationnelle.";

const LIMITS = {
  pgpCandidates: 80,
  diuCandidates: 40,
  evidenceItems: 80,
  priorityActions: 30,
  pointsToVerify: 30,
  requiredValidations: 20,
};

const EMPTY_VALUES = new Set([
  '',
  'a completer',
  'a verifier sur site',
  'preuve a obtenir',
  'validation requise',
  '[à compléter]',
  '[a completer]',
  '[à vérifier sur site]',
  '[a verifier sur site]',
  '[preuve à obtenir]',
  '[preuve a obtenir]',
  '[validation requise]',
]);

const MEASURE_TYPES = new Set([
  'technique',
  'organisationnelle',
  'humaine',
  'documentaire',
  'contrôle / vérification',
  'formation / information',
  'autre',
]);

const EVIDENCE_TYPES = new Set(['rapport', 'PV', 'attestation', 'photo', 'plan', 'schéma', 'contrôle', 'autre']);
const DESTINATIONS = new Set([
  'Analyse de risques uniquement',
  'PIU',
  'PGP/PAA',
  'PIU + PGP/PAA',
  'DIU',
  'À vérifier avant intégration',
]);
const VALIDATION_BY = new Set([
  'employeur',
  'SIPP/SEPP',
  'ligne hiérarchique',
  'CPPT',
  'personne compétente',
  'organisme externe',
  'autre',
]);

const SYSTEM_PROMPT = `Tu es un conseiller en prévention belge expérimenté. Tu aides à structurer un dossier prévention à partir d’une analyse de risques. Tu ne valides rien automatiquement. Tu ne donnes pas de conseil juridique définitif. Tu n’inventes jamais de références légales, seuils, dates ou obligations. Les obligations doivent être formulées comme des points à vérifier dans la version applicable du Code du bien-être au travail ou auprès des personnes compétentes.`;

const USER_PROMPT = `À partir de l’analyse de risques fournie, extrais des éléments structurés pour alimenter :
- le Plan Interne d’Urgence — PIU ;
- le Plan Global de Prévention / Plan Annuel d’Action — PGP/PAA ;
- le DIU ;
- les preuves à obtenir ;
- les points à vérifier ;
- les validations nécessaires.

Utilise les données :
- Entreprise
- Site
- Adresse
- Secteur
- Type d’entreprise
- Nombre de travailleurs
- Présence de tiers
- CPPT
- SIPP/SEPP
- Conseiller en prévention
- Responsable site
- Service technique
- Profil de risque
- Activités principales
- Risques spécifiques
- Analyse de risques

Méthode :
1. Reprendre ou structurer l’analyse de risques sous forme de lignes.
2. Identifier les risques pouvant générer une situation d’urgence et les proposer comme candidats PIU.
3. Identifier les risques nécessitant des mesures structurelles, organisationnelles, techniques, humaines ou documentaires et les proposer comme candidats PGP/PAA.
4. Identifier les éléments utiles au DIU.
5. Identifier les preuves à obtenir.
6. Identifier les points à vérifier avant validation.
7. Identifier les validations nécessaires.
8. Adapter le niveau de détail au profil de risque.

Règles de prudence :
- Tout item doit avoir status: "à valider".
- Ne jamais générer un item validé.
- Ne pas inventer de données absentes.
- Ne pas inventer de référence légale.
- Les éléments Seveso ne doivent être générés que si le profil ou l’analyse le justifie.
- Si le profil est inconnu, ajouter un point à vérifier sur la détermination du profil de risque.
- Mentionner les validations par l’employeur, SIPP/SEPP, ligne hiérarchique, CPPT si applicable et personnes compétentes.

Règles spécifiques PIU :
- Le PIU ne doit pas être un plan d’action prévention.
- Le PIU contient uniquement les situations d’urgence opérationnelles et les informations nécessaires à leur gestion.
- Les actions de conformité, maintenance, contrôle, formation, documentation ou amélioration doivent aller dans le PGP/PAA, les preuves à obtenir ou les points à vérifier.
- Avant de placer un élément dans piuCandidates, demande-toi : “Cet élément est-il utile pendant une urgence réelle ?”
- Si non, ne pas le mettre dans piuCandidates.

Exemples :
- “Personne bloquée dans un ascenseur” => PIU
- “Procédure d’appel ascensoriste en cas de blocage” => PIU
- “Obtenir le rapport SECT” => PGP/PAA + preuve à obtenir
- “Former BA4/BA5” => PGP/PAA
- “Localiser la coupure générale électrique pour les secours” => PIU
- “Planifier thermographie annuelle” => PGP/PAA
- “Mettre à jour les schémas électriques” => PGP/PAA ou dossier pompiers seulement si utile aux secours
- “Point de rassemblement non défini” => PIU
- “Ergonomie poste écran” => PGP/PAA uniquement

Répondre uniquement en JSON valide.`;

export async function extractPreventionDossier({
  documentType,
  markdown,
  formData = {},
  sourceDocumentId,
  sourceReference,
  language = 'fr',
  openai = null,
  model = 'gpt-4.1-mini',
  maxOutputTokens = 9000,
} = {}) {
  const normalizedProfile = normalizeRiskProfile(formData.riskProfile);
  const base = createEmptyResult({ documentType, formData, sourceDocumentId, sourceReference, language, riskProfile: normalizedProfile.value });

  if (normalizedProfile.warning) base.warnings.push(RISK_PROFILE_WARNING);

  let extracted = null;
  if (openai?.responses?.create) {
    console.info('[PreventIA] Prevention dossier extraction: AI attempted');
    try {
      extracted = await extractWithAi({
        openai,
        model,
        maxOutputTokens,
        documentType,
        markdown,
        formData: { ...formData, riskProfile: normalizedProfile.value },
        sourceDocumentId,
        sourceReference,
        language,
      });
      console.info('[PreventIA] Prevention dossier extraction: AI success');
    } catch {
      console.info('[PreventIA] Prevention dossier extraction: fallback used');
    }
  } else {
    console.info('[PreventIA] Prevention dossier extraction: fallback used');
  }

  const result = extracted ? mergeResult(base, extracted) : mergeResult(base, deterministicFallback({
    documentType,
    markdown,
    formData,
    sourceDocumentId,
    sourceReference,
    riskProfile: normalizedProfile.value,
  }));

  return sanitizeResult(result, {
    documentType,
    markdown,
    formData,
    sourceDocumentId,
    sourceReference,
    riskProfile: normalizedProfile.value,
    riskProfileWasInvalid: normalizedProfile.warning,
  });
}

async function extractWithAi({ openai, model, maxOutputTokens, documentType, markdown, formData, sourceDocumentId, sourceReference, language }) {
  const response = await openai.responses.create({
    model,
    max_output_tokens: maxOutputTokens,
    instructions: SYSTEM_PROMPT,
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `${USER_PROMPT}

Schéma attendu :
{
  "companyProfile": {},
  "structuredRiskRows": [],
  "piuCandidates": [],
  "pgpCandidates": [],
  "diuCandidates": [],
  "evidenceItems": [],
  "priorityActions": [],
  "pointsToVerify": [],
  "requiredValidations": [],
  "warnings": []
}

Contexte :
${safeJson({ documentType, formData, sourceDocumentId, sourceReference, language })}

Analyse de risques :
${String(markdown || '').slice(0, 45000)}`,
      }],
    }],
  });

  const parsed = parseJsonResponse(response?.output_text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Réponse IA JSON invalide.');
  }
  return parsed;
}

function deterministicFallback({ documentType, markdown, formData, sourceDocumentId, sourceReference, riskProfile }) {
  const text = String(markdown || '');
  const lower = normalize(text);
  const rows = extractStructuredRows(text, sourceReference);
  const source = { documentType, sourceDocumentId, sourceReference };
  const piuCandidates = [];
  const pgpCandidates = [];
  const diuCandidates = [];
  const evidenceItems = [];
  const priorityActions = [];
  const pointsToVerify = [];
  const requiredValidations = [];

  addCoreProfileItems({ riskProfile, lower, piuCandidates, pgpCandidates, source });
  addElectricalItems({ lower, piuCandidates, pgpCandidates, diuCandidates, evidenceItems, priorityActions, pointsToVerify, requiredValidations, source, formData });
  addGenericItems({ lower, riskProfile, piuCandidates, pgpCandidates, priorityActions, evidenceItems, source, formData });
  addRiskProfileAdaptation({ riskProfile, lower, piuCandidates, pgpCandidates, pointsToVerify, requiredValidations, source });

  requiredValidations.push(validation('validation-employeur', 'employeur', 'Validation du dossier prévention et des priorités proposées avant intégration opérationnelle.'));
  requiredValidations.push(validation('validation-sipp-sepp', 'SIPP/SEPP', 'Avis prévention requis sur les mesures proposées et les points à vérifier.'));
  if (hasAny(lower, ['cppt', 'comite', 'comité'])) {
    requiredValidations.push(validation('validation-cppt', 'CPPT', 'Consultation ou information CPPT à confirmer si applicable.'));
  }

  return {
    structuredRiskRows: rows,
    piuCandidates,
    pgpCandidates,
    diuCandidates,
    evidenceItems,
    priorityActions,
    pointsToVerify,
    requiredValidations,
  };
}

function createEmptyResult({ documentType, formData, sourceDocumentId, sourceReference, language, riskProfile }) {
  return {
    companyProfile: {
      companyName: clean(formData.companyName),
      siteName: clean(formData.siteName),
      address: clean([formData.address, formData.postalCode, formData.city].filter(Boolean).join(' ')),
      postalCode: clean(formData.postalCode),
      city: clean(formData.city),
      sector: clean(formData.sector || formData.activitySector),
      companyType: clean(formData.companyType),
      workersCount: clean(formData.workersCount || formData.numberOfWorkers),
      thirdPartiesPresence: clean(formData.thirdPartiesPresence || formData.presenceOfThirdParties),
      cppt: clean(formData.cppt),
      sippSepp: clean(formData.sippSepp || formData.sipp || formData.sepp),
      preventionAdvisor: clean(formData.preventionAdvisor),
      siteManager: clean(formData.siteManager || formData.responsibleSite),
      technicalService: clean(formData.technicalServiceContact || formData.technicalService),
      riskProfile,
      activities: clean(formData.activities || formData.mainActivities),
      specificRisks: clean(formData.specificRisks),
      sourceDocumentId: clean(sourceDocumentId),
      sourceReference: clean(sourceReference),
      sourceDocumentType: clean(documentType),
      language: clean(language || 'fr'),
    },
    structuredRiskRows: [],
    piuCandidates: [],
    pgpCandidates: [],
    diuCandidates: [],
    evidenceItems: [],
    priorityActions: [],
    pointsToVerify: [],
    requiredValidations: [],
    warnings: [],
  };
}

function addCoreProfileItems({ riskProfile, lower, piuCandidates, pgpCandidates, source }) {
  if (riskProfile === 'faible') {
    piuCandidates.push(piu('piu-incendie', 'Incendie et évacuation', 'Départ de feu ou fumées nécessitant l’évacuation.', 'incendie / évacuation', source));
    piuCandidates.push(piu('piu-malaise', 'Malaise ou accident grave', 'Prise en charge d’un malaise ou accident grave sur site.', 'premiers secours', source));
    pgpCandidates.push(pgp('pgp-ergonomie', 'Prévenir les troubles liés au travail sur écran et à l’ergonomie', 'ergonomie / travail sur écran', 'Adapter les postes et informer les travailleurs.', 'humaine', source));
    pgpCandidates.push(pgp('pgp-evacuation-base', 'Maintenir les bases premiers secours et évacuation', 'urgence de base', 'Vérifier consignes, affichages et formation de base.', 'formation / information', source));
  }
  if (['modéré', 'élevé', 'très élevé', 'Seveso seuil bas', 'Seveso seuil haut'].includes(riskProfile)) {
    if (hasAny(lower, ['manutention'])) pgpCandidates.push(pgp('pgp-manutention', 'Réduire les risques de manutention', 'manutention', 'Analyser les tâches et adapter les moyens de manutention.', 'organisationnelle', source));
    if (hasAny(lower, ['circulation', 'parking', 'vehicule', 'véhicule'])) pgpCandidates.push(pgp('pgp-circulation', 'Sécuriser la circulation et les flux', 'circulation', 'Clarifier les cheminements, zones et consignes.', 'organisationnelle', source));
    if (hasAny(lower, ['stockage'])) pgpCandidates.push(pgp('pgp-stockage', 'Maîtriser les risques liés au stockage', 'stockage', 'Vérifier stabilité, séparation et ordre des zones.', 'contrôle / vérification', source));
    if (hasAny(lower, ['sous-traitant', 'sous traitant', 'entreprise exterieure', 'entreprise extérieure'])) {
      pgpCandidates.push(pgp('pgp-sous-traitants', 'Encadrer les interventions des sous-traitants', 'coactivité', 'Formaliser l’accueil, les consignes et la coordination.', 'organisationnelle', source));
    }
  }
}

function addElectricalItems({ lower, piuCandidates, pgpCandidates, diuCandidates, evidenceItems, priorityActions, pointsToVerify, requiredValidations, source, formData }) {
  const electrical = hasAny(lower, ['rgie', 'arei', 'ba4', 'ba5', 'tgbt', 'consignation', 'thermographie', 'cabine ht', 'haute tension', 'basse tension']);
  if (!electrical) return;

  piuCandidates.push(piu('piu-tgbt-coupure', 'Coupure générale TGBT et secours', 'Incident électrique, échauffement, incendie ou besoin de coupure d’urgence.', 'TGBT / installation électrique', source, {
    procedureToPlan: 'Identifier les personnes autorisées, la procédure de coupure et les contacts de secours.',
    requiredMeans: 'Plan de coupure, accès au local technique, contacts service technique.',
    responsible: clean(formData.technicalServiceContact || formData.technicalService || 'service technique'),
    chapterSuggestion: 'Coupures techniques et procédures d’urgence',
  }));
  piuCandidates.push(piu('piu-incendie-electrique', 'Incendie d’origine électrique', 'Échauffement, arc électrique ou défaut pouvant déclencher fumée ou incendie.', 'armoires électriques / tableaux', source));

  pgpCandidates.push(pgp('pgp-consignation', 'Formaliser la consignation électrique', 'interventions électriques', 'Définir une procédure de consignation et les rôles BA4/BA5.', 'organisationnelle', source, {
    expectedEvidence: 'Procédure de consignation validée, liste des personnes autorisées.',
  }));
  pgpCandidates.push(pgp('pgp-thermographie', 'Planifier la thermographie des installations critiques', 'échauffement / TGBT', 'Obtenir ou programmer un contrôle thermographique selon criticité.', 'contrôle / vérification', source, {
    expectedEvidence: 'Rapport de thermographie et suivi des remarques.',
  }));
  pgpCandidates.push(pgp('pgp-rgie-ba4-ba5', 'Mettre à jour les preuves RGIE et BA4/BA5', 'conformité et habilitations électriques', 'Obtenir les PV RGIE et confirmer les personnes BA4/BA5.', 'documentaire', source, {
    expectedEvidence: 'PV RGIE, liste BA4/BA5, attestations ou instructions.',
  }));

  diuCandidates.push(diu('diu-schemas-electriques', 'Schémas électriques et plans de coupure', 'Documents utiles au DIU pour intervention, maintenance et coordination technique.', source));
  diuCandidates.push(diu('diu-tgbt-local-technique', 'Localisation TGBT et tableaux divisionnaires', 'Repérage des installations critiques à conserver dans le dossier technique.', source));

  evidenceItems.push(evidence('preuve-pv-rgie', 'PV RGIE à obtenir ou actualiser', 'PV', 'Confirmer l’état de conformité et les remarques ouvertes.', source));
  evidenceItems.push(evidence('preuve-thermographie', 'Rapport de thermographie à obtenir', 'rapport', 'Identifier les échauffements et prioriser les corrections.', source));
  evidenceItems.push(evidence('preuve-ba4-ba5', 'Liste BA4/BA5 et autorisations', 'attestation', 'Vérifier les personnes autorisées à intervenir ou accéder aux installations.', source));

  priorityActions.push(action('action-rgie-consignation', 'Obtenir PV RGIE et formaliser la consignation', 'RGIE, BA4/BA5, consignation, TGBT', 'PGP/PAA', 'documentaire / organisationnelle', source, {
    responsible: clean(formData.technicalServiceContact || formData.technicalService || formData.preventionAdvisor || 'à déterminer'),
    expectedEvidence: 'PV RGIE, procédure de consignation, liste BA4/BA5.',
    proposedDeadline: '1 à 3 mois',
  }));
  priorityActions.push(action('action-piu-coupure-tgbt', 'Intégrer la coupure TGBT dans le PIU', 'TGBT, coupure générale, secours', 'PIU', 'urgence technique', source, {
    expectedEvidence: 'Plan de coupure et contacts de secours vérifiés.',
  }));

  pointsToVerify.push(verify('verify-rgie', 'Vérifier les obligations RGIE applicables et les remarques de contrôle', 'Ne pas conclure sans PV et situation technique à jour.'));
  pointsToVerify.push(verify('verify-ba4-ba5', 'Vérifier les désignations BA4/BA5 et autorisations d’accès', 'Les accès et interventions électriques doivent être confirmés par les personnes compétentes.'));
  requiredValidations.push(validation('validation-personne-competente-electricite', 'personne compétente', 'Validation technique des mesures électriques, coupures, consignation et habilitations.'));
  requiredValidations.push(validation('validation-organisme-rgie', 'organisme externe', 'Contrôles ou rapports électriques à confirmer par l’organisme compétent si applicable.'));
}

function addGenericItems({ lower, riskProfile, piuCandidates, pgpCandidates, priorityActions, evidenceItems, source, formData }) {
  if (hasAny(lower, ['incendie', 'evacuation', 'évacuation'])) {
    piuCandidates.push(piu('piu-evacuation', 'Évacuation incendie', 'Évacuation du site en cas d’incendie ou alarme.', 'incendie / évacuation', source));
    priorityActions.push(action('action-evacuation', 'Vérifier les consignes et moyens d’évacuation', 'incendie / évacuation', 'PIU + PGP/PAA', 'organisationnelle', source));
  }
  if (hasAny(lower, ['preuve a obtenir', 'preuve à obtenir', 'rapport', 'pv ', 'attestation'])) {
    evidenceItems.push(evidence('preuve-dossier-analyse', 'Preuves mentionnées dans l’analyse à obtenir', 'autre', 'L’analyse signale des preuves ou rapports à collecter avant validation.', source));
  }
  if (hasAny(lower, ['formation', 'information', 'sensibilisation'])) {
    pgpCandidates.push(pgp('pgp-formation', 'Planifier les formations et informations nécessaires', 'compétences / consignes', 'Définir les publics, contenus et preuves de participation.', 'formation / information', source));
  }
  if (riskProfile === 'modéré') {
    pgpCandidates.push(pgp('pgp-equipements-controles', 'Vérifier les équipements et contrôles périodiques', 'équipements / contrôles', 'Lister les équipements concernés et les preuves attendues.', 'contrôle / vérification', source));
  }
  if (clean(formData.preventionAdvisor)) {
    priorityActions.push(action('action-validation-conseiller', 'Faire relire les priorités par le conseiller en prévention', 'ensemble de l’analyse', 'À vérifier avant intégration', 'validation', source, {
      responsible: clean(formData.preventionAdvisor),
      requiredValidation: 'Conseiller en prévention puis employeur.',
    }));
  }
}

function addRiskProfileAdaptation({ riskProfile, lower, piuCandidates, pgpCandidates, pointsToVerify, requiredValidations, source }) {
  if (riskProfile === 'inconnu / à déterminer') {
    pointsToVerify.push(verify('verify-risk-profile', RISK_PROFILE_VERIFY_TITLE, 'Le niveau de détail PIU et PGP/PAA dépend du profil réel de l’entreprise.'));
  }
  if (['élevé', 'très élevé', 'Seveso seuil bas', 'Seveso seuil haut'].includes(riskProfile)) {
    pgpCandidates.push(pgp('pgp-maintenance-controles', 'Renforcer maintenance, contrôles et traçabilité', 'maintenance / contrôles', 'Planifier les contrôles, responsables, échéances et preuves.', 'contrôle / vérification', source));
    pgpCandidates.push(pgp('pgp-procedures-critiques', 'Formaliser les procédures critiques et EPI/EPC', 'procédures / protections', 'Vérifier les procédures, EPI/EPC et instructions écrites.', 'documentaire', source));
  }
  if (riskProfile === 'très élevé') {
    piuCandidates.push(piu('piu-gestion-crise', 'Coordination et gestion de crise', 'Situation grave nécessitant coordination renforcée.', 'risques critiques', source));
    pgpCandidates.push(pgp('pgp-exercices-tracabilite', 'Renforcer exercices, formations et traçabilité', 'gestion de crise / compétences', 'Programmer exercices, retours d’expérience et preuves de formation.', 'formation / information', source));
  }
  if (riskProfile === 'Seveso seuil bas' || riskProfile === 'Seveso seuil haut') {
    pointsToVerify.push(verify('verify-seveso', 'Vérifier les exigences Seveso applicables au site', 'Le profil Seveso doit être confirmé sans inventer de scénario d’accident majeur.'));
    requiredValidations.push(validation('validation-seveso-specialisee', 'personne compétente', 'Validation spécialisée requise pour tout élément Seveso avant intégration au PIU ou au PGP/PAA.'));
    if (hasAny(lower, ['accident majeur', 'explosion', 'toxique', 'produits dangereux', 'produit dangereux', 'incendie industriel', 'fuite massive'])) {
      piuCandidates.push(piu('piu-seveso-analyse', 'Scénario Seveso mentionné dans l’analyse à instruire', 'Scénario explicitement mentionné dans l’analyse, à détailler par personne compétente.', 'Seveso / accident majeur', source));
    }
  }
}

function sanitizeResult(result, context) {
  const sanitized = createEmptyResult({
    documentType: context.documentType,
    formData: result.companyProfile || context.formData || {},
    sourceDocumentId: context.sourceDocumentId,
    sourceReference: context.sourceReference,
    language: result.companyProfile?.language || 'fr',
    riskProfile: context.riskProfile,
  });
  sanitized.companyProfile = {
    ...sanitized.companyProfile,
    ...plainObject(result.companyProfile),
    riskProfile: context.riskProfile,
  };
  sanitized.structuredRiskRows = sanitizeStructuredRows(result.structuredRiskRows);
  const piuLimit = getPiuLimit(context.riskProfile, context.markdown);
  const piuFiltering = filterPiuCandidates(
    sanitizeList(result.piuCandidates, 80, 'title', (item, index) => normalizePiu(item, index, context)),
    context,
    piuLimit,
  );
  sanitized.piuCandidates = piuFiltering.kept;
  sanitized.pgpCandidates = sanitizeList(result.pgpCandidates, LIMITS.pgpCandidates, 'objective', (item, index) => normalizePgp(item, index, context));
  sanitized.diuCandidates = sanitizeList(result.diuCandidates, LIMITS.diuCandidates, 'title', (item, index) => normalizeDiu(item, index, context));
  sanitized.evidenceItems = sanitizeList(result.evidenceItems, LIMITS.evidenceItems, 'title', (item, index) => normalizeEvidence(item, index, context));
  sanitized.priorityActions = sanitizeList(result.priorityActions, LIMITS.priorityActions, 'title', (item, index) => normalizeAction(item, index, context));
  sanitized.pointsToVerify = sanitizeList(result.pointsToVerify, LIMITS.pointsToVerify, 'title', (item, index) => normalizeVerify(item, index));
  sanitized.requiredValidations = sanitizeList(result.requiredValidations, LIMITS.requiredValidations, 'reason', (item, index) => normalizeValidation(item, index));
  sanitized.warnings = uniqueStrings([...(Array.isArray(result.warnings) ? result.warnings : [])]);
  if (piuFiltering.excluded.length > 0 && !sanitized.warnings.includes(PIU_EXCLUSION_WARNING)) {
    sanitized.warnings.push(PIU_EXCLUSION_WARNING);
  }
  sanitized.pgpCandidates = sanitizeList(
    [...sanitized.pgpCandidates, ...piuFiltering.toPgp],
    LIMITS.pgpCandidates,
    'objective',
    (item, index) => normalizePgp(item, index, context),
  );
  sanitized.pointsToVerify = sanitizeList(
    [...sanitized.pointsToVerify, ...piuFiltering.toVerify],
    LIMITS.pointsToVerify,
    'title',
    (item, index) => normalizeVerify(item, index),
  );

  if (context.riskProfileWasInvalid && !sanitized.warnings.includes(RISK_PROFILE_WARNING)) {
    sanitized.warnings.unshift(RISK_PROFILE_WARNING);
  }
  if (context.riskProfile === 'inconnu / à déterminer' && !hasTitle(sanitized.pointsToVerify, 'profil de risque')) {
    sanitized.pointsToVerify.unshift(verify('verify-risk-profile', RISK_PROFILE_VERIFY_TITLE, 'Le profil doit être confirmé avant validation.'));
  }
  if ((context.riskProfile === 'Seveso seuil bas' || context.riskProfile === 'Seveso seuil haut') && !hasTitle(sanitized.pointsToVerify, 'seveso')) {
    sanitized.pointsToVerify.push(verify('verify-seveso', 'Vérifier les exigences Seveso applicables au site', 'Le profil Seveso doit être confirmé avec les personnes compétentes.'));
  }
  if ((context.riskProfile === 'Seveso seuil bas' || context.riskProfile === 'Seveso seuil haut') && !sanitized.requiredValidations.some((item) => normalize(item.reason).includes('seveso'))) {
    sanitized.requiredValidations.push(validation('validation-seveso-specialisee', 'personne compétente', 'Validation spécialisée requise pour tout élément Seveso avant intégration.'));
  }
  if (!sanitized.requiredValidations.some((item) => item.validationBy === 'employeur')) {
    sanitized.requiredValidations.push(validation('validation-employeur', 'employeur', 'Validation du dossier prévention et des priorités proposées avant intégration opérationnelle.'));
  }
  if (!sanitized.requiredValidations.some((item) => item.validationBy === 'SIPP/SEPP')) {
    sanitized.requiredValidations.push(validation('validation-sipp-sepp', 'SIPP/SEPP', 'Avis prévention requis sur les mesures proposées et les points à vérifier.'));
  }

  sanitized.pointsToVerify = sanitizeList(sanitized.pointsToVerify, LIMITS.pointsToVerify, 'title', (item, index) => normalizeVerify(item, index));
  sanitized.requiredValidations = sanitizeList(sanitized.requiredValidations, LIMITS.requiredValidations, 'reason', (item, index) => normalizeValidation(item, index));
  return sanitized;
}

export function classifyPiuRelevance(itemOrText, riskProfile) {
  const rawText = typeof itemOrText === 'string'
    ? itemOrText
    : [
        itemOrText?.title,
        itemOrText?.scenario,
        itemOrText?.riskSource,
        itemOrText?.procedureToPlan,
        itemOrText?.requiredMeans,
        itemOrText?.pointsToVerify,
        itemOrText?.chapterSuggestion,
      ].filter(Boolean).join(' ');
  const text = normalize(rawText);
  if (!text) {
    return {
      includeInPiu: false,
      reason: 'Élément vide ou insuffisant.',
      confidence: 0,
      destination: 'ignorer',
    };
  }

  const hasSevesoProfile = riskProfile === 'Seveso seuil bas' || riskProfile === 'Seveso seuil haut';
  const hasSevesoEmergency = hasAny(text, ['accident majeur', 'explosion', 'toxique', 'produits dangereux', 'incendie industriel', 'fuite massive']);
  if (hasAny(text, ['seveso']) && !(hasSevesoProfile && hasSevesoEmergency)) {
    return {
      includeInPiu: false,
      reason: 'Mention Seveso sans scénario d’urgence justifié.',
      confidence: 0.3,
      destination: 'À vérifier avant intégration',
    };
  }

  const exclusion = matchPiuExclusion(text);
  const emergencyScore = scoreEmergencyTheme(text);
  const isUsefulEmergencyInfo = hasAny(text, [
    'pour les secours',
    'utile aux secours',
    'accueil des secours',
    'accueil secours',
    'dossier pompiers',
    'appel 112',
    'urgence',
  ]);

  if (exclusion && emergencyScore < 0.7 && !isUsefulEmergencyInfo) {
    return {
      includeInPiu: false,
      reason: exclusion,
      confidence: Math.max(0.1, emergencyScore),
      destination: exclusion.includes('documentaire') ? 'À vérifier avant intégration' : 'PGP/PAA',
    };
  }

  if (emergencyScore >= 0.7) {
    return {
      includeInPiu: true,
      reason: 'Situation d’urgence opérationnelle ou information directement utile pendant l’urgence.',
      confidence: emergencyScore,
      destination: emergencyScore >= 0.85 ? 'PIU' : 'PIU + PGP/PAA',
    };
  }

  return {
    includeInPiu: false,
    reason: 'Pas d’utilité opérationnelle claire pendant une urgence réelle.',
    confidence: emergencyScore,
    destination: exclusion ? 'PGP/PAA' : 'À vérifier avant intégration',
  };
}

function filterPiuCandidates(candidates, context, limit) {
  const kept = [];
  const excluded = [];
  const toPgp = [];
  const toVerify = [];

  for (const candidate of candidates) {
    const relevance = classifyPiuRelevance(candidate, context.riskProfile);
    if (relevance.includeInPiu && relevance.confidence >= 0.7 && kept.length < limit) {
      kept.push(candidate);
      continue;
    }

    excluded.push(candidate);
    if (relevance.destination === 'PGP/PAA' || relevance.destination === 'PIU + PGP/PAA') {
      toPgp.push(pgpFromPiu(candidate, relevance, context));
    } else if (relevance.destination === 'À vérifier avant intégration') {
      toVerify.push(verify(
        clean(candidate.id) ? `${candidate.id}-verify` : stableId('verify-piu-exclu', candidate.title, excluded.length),
        clean(candidate.title) || 'Élément PIU à reclasser',
        relevance.reason,
      ));
    }
  }

  return { kept, excluded, toPgp, toVerify };
}

function pgpFromPiu(candidate, relevance, context) {
  return pgp(
    clean(candidate.id) ? `${candidate.id}-pgp` : stableId('pgp-piu-exclu', candidate.title, 0),
    clean(candidate.title) || 'Élément à traiter hors PIU',
    clean(candidate.riskSource || candidate.scenario),
    clean(candidate.procedureToPlan || relevance.reason),
    'organisationnelle',
    {
      documentType: context.documentType,
      sourceDocumentId: context.sourceDocumentId,
      sourceReference: context.sourceReference,
    },
    {
      expectedEvidence: clean(candidate.requiredMeans || candidate.pointsToVerify || 'preuve ou validation à obtenir'),
      responsible: clean(candidate.responsible || 'à désigner'),
    },
  );
}

function scoreEmergencyTheme(text) {
  let score = 0;
  const strongThemes = [
    'incendie',
    'evacuation',
    'alerte',
    'appel 112',
    '112',
    'accident grave',
    'malaise',
    'secours',
    'personne bloquee',
    'personne bloquee dans un ascenseur',
    'fuite de gaz',
    'deversement dangereux',
    'explosion',
    'mise a l abri',
    'confinement',
    'acces secours',
    'accueil pompiers',
    'accueil secours',
    'dossier pompiers',
    'point de rassemblement',
    'pmr',
    'communication d urgence',
  ];
  const criticalCutoffs = [
    'coupure electrique critique',
    'coupure generale electrique',
    'coupure generale',
    'coupure gaz',
    'coupure eau',
    'coupure ventilation',
    'coupures techniques',
  ];
  if (hasAny(text, strongThemes)) score = Math.max(score, 0.85);
  if (hasAny(text, criticalCutoffs) && hasAny(text, ['urgence', 'secours', 'incendie', 'critique', 'securite immediate', '112'])) {
    score = Math.max(score, 0.9);
  } else if (hasAny(text, criticalCutoffs)) {
    score = Math.max(score, 0.65);
  }
  if (hasAny(text, ['panne critique', 'impact securite immediate'])) score = Math.max(score, 0.8);
  if (hasAny(text, ['accident majeur', 'incendie industriel', 'fuite massive', 'toxique'])) score = Math.max(score, 0.85);
  return Math.min(score, 1);
}

function matchPiuExclusion(text) {
  if (hasAny(text, ['pv rgie', 'rapport sect', 'rapport de thermographie', 'thermographie', 'former ba4', 'former ba5', 'ba4 ba5', 'ba4/ba5'])) {
    return 'Action de conformité, contrôle ou formation à traiter dans le PGP/PAA.';
  }
  if (hasAny(text, ['mettre a jour les schemas', 'mise a jour schemas', 'schemas electriques', 'procedure administrative', 'faire signer', 'completer un document'])) {
    return 'Action documentaire à traiter hors PIU sauf utilité secours explicite.';
  }
  if (hasAny(text, ['maintenance ordinaire', 'controle periodique', 'tester les differentiels', 'etiquetage non critique', 'remarque organisme agree'])) {
    return 'Action de maintenance ou contrôle périodique sans impact urgence direct.';
  }
  if (hasAny(text, ['ergonomie', 'rps', 'risques psychosociaux', 'travail sur ecran', 'ordre et proprete courant'])) {
    return 'Action prévention courante à traiter dans le PGP/PAA.';
  }
  if (hasAny(text, ['obtenir', 'planifier', 'lever une remarque', 'actualiser']) && !hasAny(text, ['secours', 'urgence', 'incendie', 'evacuation'])) {
    return 'Action de suivi ou preuve à obtenir, non opérationnelle en urgence.';
  }
  return '';
}

function getPiuLimit(riskProfile, markdown) {
  if (riskProfile === 'Seveso seuil bas' || riskProfile === 'Seveso seuil haut' || hasAny(normalize(markdown), ['accident majeur', 'incendie industriel', 'site industriel majeur'])) {
    return 40;
  }
  if (riskProfile === 'élevé' || riskProfile === 'très élevé') return 25;
  return 15;
}

function mergeResult(base, extra) {
  return {
    ...base,
    ...plainObject(extra),
    companyProfile: { ...base.companyProfile, ...plainObject(extra?.companyProfile) },
    structuredRiskRows: [...array(base.structuredRiskRows), ...array(extra?.structuredRiskRows)],
    piuCandidates: [...array(base.piuCandidates), ...array(extra?.piuCandidates)],
    pgpCandidates: [...array(base.pgpCandidates), ...array(extra?.pgpCandidates)],
    diuCandidates: [...array(base.diuCandidates), ...array(extra?.diuCandidates)],
    evidenceItems: [...array(base.evidenceItems), ...array(extra?.evidenceItems)],
    priorityActions: [...array(base.priorityActions), ...array(extra?.priorityActions)],
    pointsToVerify: [...array(base.pointsToVerify), ...array(extra?.pointsToVerify)],
    requiredValidations: [...array(base.requiredValidations), ...array(extra?.requiredValidations)],
    warnings: [...array(base.warnings), ...array(extra?.warnings)],
  };
}

function normalizePiu(item, index, context) {
  return {
    id: clean(item.id) || stableId('piu', item.title, index),
    sourceDocumentId: clean(item.sourceDocumentId || context.sourceDocumentId),
    sourceReference: clean(item.sourceReference || context.sourceReference),
    sourceDocumentType: clean(item.sourceDocumentType || context.documentType),
    title: clean(item.title),
    scenario: clean(item.scenario),
    riskSource: clean(item.riskSource),
    personsConcerned: clean(item.personsConcerned),
    existingMeasures: clean(item.existingMeasures),
    procedureToPlan: clean(item.procedureToPlan),
    requiredMeans: clean(item.requiredMeans),
    responsible: clean(item.responsible),
    trainingOrExercise: clean(item.trainingOrExercise),
    pointsToVerify: clean(item.pointsToVerify),
    chapterSuggestion: clean(item.chapterSuggestion),
    status: 'à valider',
  };
}

function normalizePgp(item, index, context) {
  const measureType = clean(item.measureType);
  return {
    id: clean(item.id) || stableId('pgp', item.objective || item.title, index),
    sourceDocumentId: clean(item.sourceDocumentId || context.sourceDocumentId),
    sourceReference: clean(item.sourceReference || context.sourceReference),
    sourceDocumentType: clean(item.sourceDocumentType || context.documentType),
    objective: clean(item.objective || item.title),
    riskTargeted: clean(item.riskTargeted),
    mainMeasure: clean(item.mainMeasure),
    measureType: MEASURE_TYPES.has(measureType) ? measureType : 'autre',
    priority: clean(item.priority),
    deadline: clean(item.deadline),
    responsible: clean(item.responsible),
    requiredMeans: clean(item.requiredMeans),
    followUpIndicator: clean(item.followUpIndicator),
    expectedEvidence: clean(item.expectedEvidence),
    status: 'à valider',
  };
}

function normalizeDiu(item, index, context) {
  return {
    id: clean(item.id) || stableId('diu', item.title, index),
    sourceDocumentId: clean(item.sourceDocumentId || context.sourceDocumentId),
    sourceReference: clean(item.sourceReference || context.sourceReference),
    sourceDocumentType: clean(item.sourceDocumentType || context.documentType),
    title: clean(item.title),
    reason: clean(item.reason || item.description),
    expectedContent: clean(item.expectedContent),
    responsible: clean(item.responsible),
    status: 'à valider',
  };
}

function normalizeEvidence(item, index, context) {
  const type = clean(item.type);
  return {
    id: clean(item.id) || stableId('evidence', item.title, index),
    sourceReference: clean(item.sourceReference || context.sourceReference),
    title: clean(item.title),
    type: EVIDENCE_TYPES.has(type) ? type : 'autre',
    reason: clean(item.reason),
    status: 'à obtenir',
  };
}

function normalizeAction(item, index, context) {
  const destination = clean(item.destination);
  return {
    id: clean(item.id) || stableId('action', item.title, index),
    sourceReference: clean(item.sourceReference || context.sourceReference),
    title: clean(item.title),
    sourceInRiskAssessment: clean(item.sourceInRiskAssessment),
    destination: DESTINATIONS.has(destination) ? destination : 'À vérifier avant intégration',
    type: clean(item.type),
    responsible: clean(item.responsible),
    proposedDeadline: clean(item.proposedDeadline),
    expectedEvidence: clean(item.expectedEvidence),
    requiredValidation: clean(item.requiredValidation),
    status: 'à valider',
  };
}

function normalizeVerify(item, index) {
  return {
    id: clean(item.id) || stableId('verify', item.title, index),
    title: clean(item.title),
    reason: clean(item.reason),
    verificationSource: VERIFICATION_SOURCE,
    status: 'à vérifier',
  };
}

function normalizeValidation(item, index) {
  const validationBy = clean(item.validationBy);
  return {
    id: clean(item.id) || stableId('validation', item.reason, index),
    validationBy: VALIDATION_BY.has(validationBy) ? validationBy : 'autre',
    reason: clean(item.reason),
    status: 'à obtenir',
  };
}

function sanitizeList(items, limit, titleField, normalizer) {
  const seen = new Set();
  const output = [];
  for (const raw of array(items)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = normalizer(raw, output.length);
    const title = clean(item[titleField]);
    if (isEmptyOnly(title)) continue;
    const key = normalize(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function sanitizeStructuredRows(rows) {
  return array(rows)
    .filter((row) => row && typeof row === 'object')
    .map((row, index) => ({
      id: clean(row.id) || stableId('risk-row', row.title || row.risk || row.danger, index),
      title: clean(row.title || row.risk || row.danger),
      source: clean(row.source),
      hazard: clean(row.hazard || row.danger),
      risk: clean(row.risk),
      existingMeasures: clean(row.existingMeasures),
      proposedMeasures: clean(row.proposedMeasures),
      priority: clean(row.priority),
      status: 'à valider',
    }))
    .filter((row) => !isEmptyOnly(row.title || row.risk || row.hazard))
    .slice(0, 120);
}

function extractStructuredRows(markdown, sourceReference) {
  return String(markdown || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\|/.test(line))
    .filter((line) => /risque|danger|mesure|preuve|rgie|ba4|ba5|consignation|thermographie|tgbt|incendie|évacuation|evacuation/i.test(line))
    .slice(0, 80)
    .map((line, index) => ({
      id: stableId('risk-row', line, index),
      title: clean(line.replace(/^[-*]\s+/, '').replace(/^\|+|\|+$/g, '').split('|')[0]),
      source: clean(sourceReference),
      risk: clean(line.replace(/^[-*]\s+/, '').replace(/\s+/g, ' ')),
      status: 'à valider',
    }));
}

function piu(id, title, scenario, riskSource, source, overrides = {}) {
  return {
    id,
    sourceDocumentId: source.sourceDocumentId,
    sourceReference: source.sourceReference,
    sourceDocumentType: source.documentType,
    title,
    scenario,
    riskSource,
    personsConcerned: 'travailleurs, visiteurs et intervenants concernés à confirmer',
    existingMeasures: '',
    procedureToPlan: 'Procédure à vérifier et formaliser avant validation.',
    requiredMeans: '',
    responsible: '',
    trainingOrExercise: 'Exercice ou information à planifier selon le niveau de risque.',
    pointsToVerify: 'À confirmer sur base de l’analyse et des moyens réellement disponibles.',
    chapterSuggestion: 'Plan Interne d’Urgence',
    status: 'à valider',
    ...overrides,
  };
}

function pgp(id, objective, riskTargeted, mainMeasure, measureType, source, overrides = {}) {
  return {
    id,
    sourceDocumentId: source.sourceDocumentId,
    sourceReference: source.sourceReference,
    sourceDocumentType: source.documentType,
    objective,
    riskTargeted,
    mainMeasure,
    measureType,
    priority: 'à prioriser',
    deadline: 'à définir',
    responsible: 'à désigner',
    requiredMeans: 'à confirmer',
    followUpIndicator: 'preuve obtenue et mesure validée',
    expectedEvidence: 'preuve documentaire ou contrôle à obtenir',
    status: 'à valider',
    ...overrides,
  };
}

function diu(id, title, reason, source, overrides = {}) {
  return {
    id,
    sourceDocumentId: source.sourceDocumentId,
    sourceReference: source.sourceReference,
    sourceDocumentType: source.documentType,
    title,
    reason,
    expectedContent: 'document, plan ou information technique à intégrer après validation',
    responsible: 'à désigner',
    status: 'à valider',
    ...overrides,
  };
}

function evidence(id, title, type, reason, source) {
  return {
    id,
    sourceReference: source.sourceReference,
    title,
    type,
    reason,
    status: 'à obtenir',
  };
}

function action(id, title, sourceInRiskAssessment, destination, type, source, overrides = {}) {
  return {
    id,
    sourceReference: source.sourceReference,
    title,
    sourceInRiskAssessment,
    destination,
    type,
    responsible: 'à désigner',
    proposedDeadline: 'à définir',
    expectedEvidence: 'preuve à obtenir',
    requiredValidation: 'employeur et prévention',
    status: 'à valider',
    ...overrides,
  };
}

function verify(id, title, reason) {
  return {
    id,
    title,
    reason,
    verificationSource: VERIFICATION_SOURCE,
    status: 'à vérifier',
  };
}

function validation(id, validationBy, reason) {
  return {
    id,
    validationBy,
    reason,
    status: 'à obtenir',
  };
}

function normalizeRiskProfile(value) {
  const cleaned = clean(value);
  if (ALLOWED_RISK_PROFILES.has(cleaned)) {
    return { value: cleaned, warning: false };
  }
  return { value: 'inconnu / à déterminer', warning: true };
}

function parseJsonResponse(text) {
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

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isEmptyOnly(value) {
  return EMPTY_VALUES.has(normalize(value)) || EMPTY_VALUES.has(clean(value));
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(normalize(needle)));
}

function hasTitle(items, needle) {
  const normalizedNeedle = normalize(needle);
  return items.some((item) => normalize(item.title || item.reason).includes(normalizedNeedle));
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

function stableId(prefix, value, index) {
  const hash = crypto
    .createHash('sha1')
    .update(`${prefix}:${clean(value)}:${index}`)
    .digest('hex')
    .slice(0, 10);
  return `${prefix}-${hash}`;
}
