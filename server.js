import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import OpenAI from 'openai';
import assert from 'node:assert/strict';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 9000);
const JSON_LIMIT = process.env.JSON_LIMIT || '100kb';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const LANGUAGE_CONFIGS = {
  fr: {
    code: 'fr',
    label: 'Français',
    title: 'Analyse de risques – Projet à valider',
    sections: [
      'Identification du document',
      'Contexte et objectif',
      'Références réglementaires belges applicables',
      'Périmètre de l’analyse',
      'Sources d’information utilisées ou à obtenir',
      'Hypothèses et limites',
      'Description des postes, tâches et travailleurs exposés',
      'Identification détaillée des dangers',
      'Tableau principal d’analyse des risques',
      'Analyse des risques résiduels',
      'Priorités d’action',
      'Projet de plan d’action',
      'Lien avec le Plan Global de Prévention et le Plan Annuel d’Action',
      'Documents à créer ou mettre à jour',
      'Acteurs à consulter ou à impliquer',
      'Annexes nécessaires',
      'Conclusion',
      'Mention finale obligatoire',
    ],
    riskLevels: {
      low: 'Faible',
      medium: 'Moyen',
      high: 'Élevé',
      critical: 'Critique',
    },
    riskTableColumns:
      'N° | Activité ou tâche | Danger | Risque | Personnes exposées | Mesures existantes | Preuves existantes | Gravité | Probabilité | Exposition | Score | Niveau | Mesures complémentaires | Type de mesure | Responsable | Échéance | Risque résiduel | Contrôle/preuve attendue | Priorité',
    actionTableColumns:
      'N° | Risque concerné | Mesure proposée | Objectif | Responsable | Échéance | Moyens nécessaires | Indicateur | Preuve attendue | Statut | Lien PAA/PGP',
    priorityLabels: 'action, risque concerné, responsable, échéance et preuve attendue',
    forbiddenTerms: ['Risk assessment', 'Risicoanalyse', 'Gefährdungsbeurteilung'],
    finalMention:
      'Ce document est un projet à adapter à la situation réelle de l’entreprise et à valider par le conseiller en prévention, l’employeur et, le cas échéant, le service externe, le médecin du travail ou le CPPT. Il ne constitue pas à lui seul une preuve de conformité réglementaire.',
  },
  nl: {
    code: 'nl',
    label: 'Nederlands',
    title: 'Risicoanalyse – Ontwerp te valideren',
    sections: [
      'Identificatie van het document',
      'Context en doelstelling',
      'Toepasselijke Belgische regelgeving',
      'Afbakening van de analyse',
      'Gebruikte of te verkrijgen informatiebronnen',
      'Hypothesen en beperkingen',
      'Beschrijving van functies, taken en blootgestelde werknemers',
      'Gedetailleerde identificatie van gevaren',
      'Hoofdtabel van de risicoanalyse',
      'Analyse van restrisico’s',
      'Actieprioriteiten',
      'Ontwerp van actieplan',
      'Verband met het Globaal Preventieplan en het Jaaractieplan',
      'Documenten op te stellen of bij te werken',
      'Te raadplegen of te betrekken actoren',
      'Noodzakelijke bijlagen',
      'Conclusie',
      'Validatievermelding',
    ],
    riskLevels: {
      low: 'Laag',
      medium: 'Gemiddeld',
      high: 'Hoog',
      critical: 'Kritiek',
    },
    riskTableColumns:
      'Nr. | Activiteit | Gevaar | Risico | Blootgestelde personen | Bestaande maatregelen | Bestaand bewijs | Ernst | Waarschijnlijkheid | Blootstelling | Score | Niveau | Aanvullende maatregelen | Type maatregel | Verantwoordelijke | Termijn | Restrisico | Controle/bewijs | Prioriteit',
    actionTableColumns:
      'Nr. | Betrokken risico | Voorgestelde maatregel | Doel | Verantwoordelijke | Termijn | Benodigde middelen | Indicator | Verwacht bewijs | Status | Link JAP/GPP',
    priorityLabels: 'actie, risico, verantwoordelijke, deadline en verwacht bewijs',
    forbiddenTerms: ['Analyse de risques', 'Risk assessment', 'Gefährdungsbeurteilung'],
    finalMention:
      'Dit document is een ontwerp dat moet worden aangepast aan de werkelijke situatie van de onderneming en gevalideerd door de preventieadviseur, de werkgever en, indien van toepassing, de externe dienst, de arbeidsarts of het CPBW. Het vormt op zichzelf geen bewijs van reglementaire conformiteit.',
  },
  en: {
    code: 'en',
    label: 'English',
    title: 'Risk assessment – Draft for validation',
    sections: [
      'Document identification',
      'Context and objective',
      'Applicable Belgian regulatory references',
      'Scope of the assessment',
      'Information sources used or to be obtained',
      'Assumptions and limitations',
      'Description of jobs, tasks and exposed workers',
      'Detailed hazard identification',
      'Main risk assessment table',
      'Residual risk assessment',
      'Action priorities',
      'Draft action plan',
      'Link with the Global Prevention Plan and the Annual Action Plan',
      'Documents to create or update',
      'Stakeholders to consult or involve',
      'Required appendices',
      'Conclusion',
      'Mandatory final statement',
    ],
    riskLevels: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    riskTableColumns:
      'No. | Activity or task | Hazard | Risk | Exposed persons | Existing measures | Existing evidence | Severity | Probability | Exposure | Score | Level | Additional measures | Type of measure | Responsible person | Deadline | Residual risk | Expected control/evidence | Priority',
    actionTableColumns:
      'No. | Related risk | Proposed measure | Objective | Responsible person | Deadline | Required resources | Indicator | Expected evidence | Status | Link AAP/GPP',
    priorityLabels: 'action, risk, responsible, deadline and expected evidence',
    forbiddenTerms: ['Analyse de risques', 'Risicoanalyse', 'Gefährdungsbeurteilung'],
    finalMention:
      'This document is a draft that must be adapted to the actual situation of the organisation and validated by the prevention advisor, the employer and, where applicable, the external service, the occupational physician or the health and safety committee. It does not constitute proof of regulatory compliance on its own.',
  },
  de: {
    code: 'de',
    label: 'Deutsch',
    title: 'Gefährdungsbeurteilung – Entwurf zur Validierung',
    sections: [
      'Dokumentidentifikation',
      'Kontext und Zielsetzung',
      'Anwendbare belgische Rechtsvorschriften',
      'Umfang der Beurteilung',
      'Verwendete oder noch einzuholende Informationsquellen',
      'Annahmen und Grenzen',
      'Beschreibung der Arbeitsplätze, Tätigkeiten und exponierten Beschäftigten',
      'Detaillierte Ermittlung der Gefährdungen',
      'Haupttabelle der Gefährdungsbeurteilung',
      'Beurteilung der Restrisiken',
      'Handlungsprioritäten',
      'Entwurf eines Maßnahmenplans',
      'Verbindung zum Globalen Präventionsplan und zum Jährlichen Aktionsplan',
      'Zu erstellende oder zu aktualisierende Dokumente',
      'Zu konsultierende oder einzubeziehende Akteure',
      'Erforderliche Anhänge',
      'Schlussfolgerung',
      'Verbindlicher Abschlusshinweis',
    ],
    riskLevels: {
      low: 'Niedrig',
      medium: 'Mittel',
      high: 'Hoch',
      critical: 'Kritisch',
    },
    riskTableColumns:
      'Nr. | Tätigkeit oder Aufgabe | Gefährdung | Risiko | Exponierte Personen | Bestehende Maßnahmen | Vorhandene Nachweise | Schwere | Wahrscheinlichkeit | Exposition | Punktzahl | Niveau | Zusätzliche Maßnahmen | Art der Maßnahme | Verantwortliche Person | Frist | Restrisiko | Kontrolle/erwarteter Nachweis | Priorität',
    actionTableColumns:
      'Nr. | Betroffenes Risiko | Vorgeschlagene Maßnahme | Ziel | Verantwortliche Person | Frist | Erforderliche Mittel | Indikator | Erwarteter Nachweis | Status | Bezug JAP/GPP',
    priorityLabels: 'Aktion, Risiko, Verantwortlicher, Frist und erwarteter Nachweis',
    forbiddenTerms: ['Analyse de risques', 'Risicoanalyse', 'Risk assessment'],
    finalMention:
      'Dieses Dokument ist ein Entwurf, der an die tatsächliche Situation des Unternehmens angepasst und vom Präventionsberater, dem Arbeitgeber sowie gegebenenfalls vom externen Dienst, dem Arbeitsmediziner oder dem Ausschuss für Gefahrenverhütung und Schutz am Arbeitsplatz validiert werden muss. Es stellt für sich allein keinen Nachweis der regulatorischen Konformität dar.',
  },
};

const SYSTEM_PROMPT = `Tu es PreventIA Belgique, un assistant spécialisé en prévention, sécurité, santé et bien-être au travail en Belgique.

Tu aides à produire des projets d’analyses de risques et documents de prévention selon la logique du Code belge du bien-être au travail. Tu ne remplaces jamais le conseiller en prévention, l’employeur, le SIPPT/SEPPT, le médecin du travail, le CPPT ou les autorités compétentes.

Règles strictes :
- Répondre uniquement en Markdown, sans JSON ni préambule.
- Répondre exclusivement dans la langue demandée par le prompt utilisateur, avec un ton professionnel, sans anglicisme inutile et sans formulation familière, approximative ou non professionnelle.
- Respecter exactement l’ordre des 18 sections demandées.
- Rester synthétique : environ 2500 à 3500 mots maximum.
- Ne jamais affirmer qu’un document est juridiquement complet.
- Ne jamais inventer d’articles légaux précis ; citer seulement la loi, le Code, les Livres ou Titres pertinents.
- Exploiter tous les champs formData. La valeur "Non renseigné / à vérifier" est une information manquante à traiter comme point à vérifier, pas comme une raison de laisser une section vide.
- Distinguer faits fournis, hypothèses prudentes, informations manquantes et points à valider lorsque c’est utile.
- Ne jamais produire un tableau rempli uniquement avec "À compléter".
- Ne jamais répéter la mention finale. Elle apparaît une seule fois, en section 18.
- Relire la réponse avant sortie : corriger grammaire, accord, ton professionnel et cohérence métier ; remplacer toute formulation non professionnelle, incohérente, anglaise ou mal traduite.
- Interdire les formulations absurdes, non professionnelles, anglaises ou hors contexte. Ne jamais écrire notamment : "risque vétérinaire", "clash de l’intensité du bruit", "outils violents", "registre des médicaments", "Cet projet", "Chemiste interne", "Suivi des consommateurs", "Formation de maintien correct", "Production de normes claires", "Assemblée de travailleurs formés", "Systèmes de fichier", "Chutes/slips", "véhicules/péda", "Média", "PRS des CPPT", "Risque critique tr", "Plan Global de Protection", "Retour au travail des piétons", "Retour au travail", "Exportation occasionnelle", "Exportation", "Fréquence des interventions dernières", "Conformité normale", "Utlisation sécurisée", "PDV requise pour EPI", "Fréquence d'interventions augm.", "Fréquence des presences", "Fréquence des presences des produits", "€ pour reformation", "Fiches de donnée sécurité", "EPI audios", "État de l’atelier contrôle", "Mesure à priorité", "Risqués", "Utilisation d’équipements dangereuse sans précision", "Engagement renforcé", "Utiliser régulièrement", "Accident register", "Moderate", "Préventeur interna", "interna", "Barrage aux risques chimiques", "Barrage aux risques", "Effectivité", "environnement de travail agitée", "environnement agitée" ou "Une perte auditive".
- Employer un vocabulaire prévention adapté : machines et outillage électroportatif, machines bruyantes, registre des accidents/incidents, risque de chute de hauteur, exposition au bruit, exposition à des agents chimiques, circulation véhicules/piétons, glissades et chutes de plain-pied.
- Remplacer les formulations faibles ou interdites par : "circulation véhicules/piétons", "exposition occasionnelle", "fréquence d’intervention à vérifier sur le terrain", "conformité à vérifier", "registre des accidents/incidents", "modérée", "procédure de vérification des EPI", "préventeur interne ou conseiller en prévention interne", "maîtrise des risques chimiques", "utilisation sécurisée", "présence régulière des produits", "formation complémentaire à planifier", "fiches de données de sécurité", "EPI auditifs", "état de l’atelier contrôlé", "mesure organisationnelle", "mesure technique", "formation et information", "protection collective", "équipement de protection individuelle", "risques", "responsable produits chimiques", "magasinier", "suivi des travailleurs exposés", "registre de consultation des FDS", "formation manutention et gestes/postures", "critères de prévention formalisés", "taux de travailleurs formés", "inventaire documentaire structuré", "PV ou avis du CPPT", "Risque critique si score 101 à 125 uniquement", "Plan Global de Prévention", "efficacité de la signalisation", "environnement de travail bruyant ou perturbé", "perte auditive".
- Utiliser exactement ces libellés réglementaires quand ils sont pertinents : "Livre Ier, Titre 2 – Politique du bien-être et système dynamique de gestion des risques", "Livre III – Lieux de travail", "Livre III, Titre 3 – Prévention incendie", "Livre III, Titre 6 – Signalisation de sécurité et de santé", "Livre IV – Équipements de travail", "Livre VI – Agents chimiques", "Livre VIII – Ergonomie et TMS", "Livre IX – Protections collectives et EPI". Ne pas écrire "Livre I Titre 2", "Livre III lieu de travail", "Livre III lieux de travail" ou "Livre IX protections collectives et EPI" sans majuscule ni tiret.
- Vérifier que chaque preuve attendue correspond au risque, à la mesure proposée et au contexte de prévention belge. Privilégier des preuves concrètes : rapport de contrôle, registre de formation, liste de présence, photos avant/après, inventaire mis à jour, FDS centralisées, rapport de visite terrain, PV ou avis du CPPT, registre accidents/incidents, check-list signée. Éviter les preuves vagues : suivi, constat, conformité normale, document disponible, rapport général.
- Le type de mesure selon la hiérarchie de prévention doit utiliser un libellé parmi : suppression du danger, substitution, mesure technique, protection collective, mesure organisationnelle, information et formation, équipement de protection individuelle, surveillance, contrôle et réévaluation. Ne pas écrire "mesure à priorité", "conformité normale", "éducation sur le travail extérieur" ni "élimination du risque avéré" si le danger n’est pas réellement supprimé.

Cotation : Risque = Gravité x Probabilité x Exposition.
Gravité, Probabilité et Exposition sont cotées de 1 à 5. Niveau : 1 à 20 = Faible ; 21 à 50 = Moyen ; 51 à 100 = Élevé ; 101 à 125 = Critique. Les justifications G/P/E doivent être courtes. Avant de répondre, vérifie que chaque niveau correspond exactement au score selon la grille. Ne jamais classer 20, 36, 48 ou 27 comme Élevé/Critique, ni 100 comme Critique. Ne force jamais artificiellement un score élevé, mais ne sous-évalue pas les risques typiques d’un service technique communal lorsque l’exposition est régulière ou la gravité importante : travail en hauteur, produits chimiques, circulation véhicules/piétons, incendie, machines/outillage, manutention régulière, bruit, coactivité avec public ou sous-traitants. Évite les scores très faibles pour ces risques sauf justification claire et cohérente avec Gravité x Probabilité x Exposition ; ne classe pas un risque grave et fréquent en risque faible.

Structure obligatoire par défaut en français si aucune autre langue valide n’est demandée :
# Analyse de risques – Projet à valider

## 1. Identification du document
## 2. Contexte et objectif
## 3. Références réglementaires belges applicables
## 4. Périmètre de l’analyse
## 5. Sources d’information utilisées ou à obtenir
## 6. Hypothèses et limites
## 7. Description des postes, tâches et travailleurs exposés
## 8. Identification détaillée des dangers
## 9. Tableau principal d’analyse des risques
## 10. Analyse des risques résiduels
## 11. Priorités d’action
## 12. Projet de plan d’action
## 13. Lien avec le Plan Global de Prévention et le Plan Annuel d’Action
## 14. Documents à créer ou mettre à jour
## 15. Acteurs à consulter ou à impliquer
## 16. Annexes nécessaires
## 17. Conclusion
## 18. Mention finale obligatoire

Contraintes de sortie :
- Section 3 : tableau Markdown de maximum 8 références avec colonnes équivalentes à "Référence ou domaine réglementaire", "Pourquoi c’est applicable", "Conséquence pratique pour l’analyse ou les actions", dans la langue demandée.
- Section 9 : tableau Markdown de maximum 8 risques concrets. Ne pas dépasser 8 lignes de risques.
- Section 11 : ne jamais laisser vide. Toujours produire au moins 4 priorités structurées avec Priorité 1 actions urgentes ou risques les plus élevés, Priorité 2 risques élevés ou moyens significatifs, Priorité 3 risques moyens, Priorité 4 amélioration continue. Chaque priorité contient explicitement : action, risque concerné, responsable, échéance et preuve attendue.
- Section 12 : tableau Markdown de maximum 6 actions.
- Section 14 : toujours 5 à 8 documents concrets à créer ou mettre à jour, jamais une simple mention "Information à compléter ou à valider sur le terrain".
- Sections 5, 7, 8, 14 et 15 doivent contenir du contenu exploitable, pas seulement un titre. Section 8 : toujours produire 6 à 8 dangers détaillés, concrets et contextualisés. Ne jamais afficher seulement "Information à compléter ou à valider sur le terrain." ni seulement "Dangers identifiés :". Pour un service technique communal, inclure si pertinent : manutention manuelle, machines/outillage électroportatif, produits chimiques, circulation véhicules/piétons, bruit, travail en hauteur, glissades/chutes de plain-pied, incendie, coactivité avec citoyens ou sous-traitants, conditions météo, travail isolé.
- Section 12 : si un montant est donné, le mettre dans la colonne équivalente à "Budget estimatif si possible" et ne pas mettre de montant dans la colonne équivalente à "Moyens nécessaires". Si aucun budget fiable n’est disponible, écrire une formule équivalente à "à estimer" dans la langue demandée.
- Par défaut en français, la section 18 doit contenir exactement cette mention, une seule fois :
Ce document est un projet à adapter à la situation réelle de l’entreprise et à valider par le conseiller en prévention, l’employeur et, le cas échéant, le service externe, le médecin du travail ou le CPPT. Il ne constitue pas à lui seul une preuve de conformité réglementaire.`;

const REQUIRED_FORM_FIELDS = [
  'secteurActivite',
  'nombreTravailleurs',
  'siteLieuTravail',
  'activitePoste',
  'machinesEquipements',
  'produitsDangereux',
  'travailleursExposes',
  'accidentsIncidents',
  'mesuresExistantes',
  'presenceCppt',
  'serviceInterneExterne',
  'contraintesParticulieres',
  'informationsComplementaires',
];

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error('Origine CORS non autorisée');
      error.status = 403;
      callback(error);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  }),
);
app.use(express.json({ limit: JSON_LIMIT }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT || 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Trop de requêtes. Réessayez plus tard.',
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'preventia-backend',
  });
});

app.post('/api/generate-document', async (req, res, next) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      const error = new Error('Configuration OpenAI manquante côté serveur.');
      error.status = 500;
      error.expose = true;
      throw error;
    }

    const { documentType, formData, language, languageLabel } = req.body || {};
    validateGenerateDocumentPayload(documentType, formData);
    const targetLanguage = resolveTargetLanguage(language, languageLabel, formData);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.info('Demande de génération reçue', {
      documentType,
      language: targetLanguage.code,
      formFields: Object.keys(formData).length,
    });

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildUserPrompt(documentType, formData, targetLanguage.code, targetLanguage.label),
            },
          ],
        },
      ],
    });

    const document = normalizeRiskLevels(response.output_text?.trim());

    if (!document) {
      const error = new Error('La génération du document n’a pas produit de contenu.');
      error.status = 502;
      throw error;
    }

    res.json({
      success: true,
      source: 'ai_backend',
      document,
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route non trouvée: ${req.method} ${req.path}`,
  });
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const isServerError = status >= 500;

  console.error('Erreur backend', {
    message: error.message,
    status,
    name: error.name,
  });

  res.status(status).json({
    success: false,
    error: isServerError && !error.expose
      ? 'Une erreur serveur est survenue. Réessayez plus tard.'
      : error.message,
  });
});

function startServer() {
  const server = app.listen(PORT, HOST, () => {
    const address = server.address();
    const listenAddress =
      typeof address === 'object' && address
        ? `${address.address}:${address.port}`
        : `${HOST}:${PORT}`;

    console.info(`preventia-backend écoute sur ${listenAddress}`);
    console.info(
      'Pour un iPhone physique sur le même Wi-Fi, utilisez l’adresse IP locale du Mac dans l’URL du backend.',
    );
  });

  return server;
}

if (process.env.RUN_INTERNAL_RISK_TESTS === '1') {
  runInternalRiskTests();
} else {
  startServer();
}

function validateGenerateDocumentPayload(documentType, formData) {
  if (typeof documentType !== 'string' || documentType.trim().length === 0) {
    const error = new Error('Le champ documentType est obligatoire.');
    error.status = 400;
    throw error;
  }

  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    const error = new Error('Le champ formData doit être un objet.');
    error.status = 400;
    throw error;
  }

  const missingFields = REQUIRED_FORM_FIELDS.filter(
    (field) => typeof formData[field] !== 'string',
  );

  if (missingFields.length > 0) {
    const error = new Error(`Champs formData manquants ou invalides: ${missingFields.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

function normalizeLanguage(language, languageLabel) {
  const normalizedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : '';
  const option = LANGUAGE_CONFIGS[normalizedLanguage] || LANGUAGE_CONFIGS.fr;
  const normalizedLabel = typeof languageLabel === 'string' ? languageLabel.trim() : '';

  return {
    language: LANGUAGE_CONFIGS[normalizedLanguage] ? normalizedLanguage : 'fr',
    languageLabel: normalizedLabel === option.label ? normalizedLabel : option.label,
  };
}

function resolveTargetLanguage(language, languageLabel, formData) {
  const normalizedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : '';

  if (LANGUAGE_CONFIGS[normalizedLanguage]) {
    return {
      code: normalizedLanguage,
      label: LANGUAGE_CONFIGS[normalizedLanguage].label,
    };
  }

  const detectedLanguage = detectDominantFormLanguage(formData);
  const option = LANGUAGE_CONFIGS[detectedLanguage] || LANGUAGE_CONFIGS.fr;

  return {
    code: detectedLanguage,
    label: option.label,
  };
}

function detectDominantFormLanguage(formData) {
  const text = Object.values(formData || {})
    .filter((value) => typeof value === 'string')
    .join(' ')
    .normalize('NFC')
    .toLowerCase();

  const scores = {
    nl: countLanguageMarkers(text, [
      'te controleren',
      'preventieadviseur',
      'werknemers',
      'werkplaats',
      'risicoanalyse',
      'arbeidsarts',
      'gevaar',
      'blootstelling',
      'maatregelen',
      'welzijn',
    ]),
    en: countLanguageMarkers(text, [
      'risk',
      'workers',
      'workplace',
      'assessment',
      'hazard',
      'exposure',
      'measures',
      'safety',
      'prevention',
      'incident',
    ]),
    de: countLanguageMarkers(text, [
      'gefährdungsbeurteilung',
      'arbeitnehmer',
      'arbeitsplatz',
      'zu prüfen',
      'gefahr',
      'risiko',
      'exposition',
      'maßnahmen',
      'arbeitssicherheit',
      'prävention',
    ]),
  };

  const detected = Object.entries(scores)
    .sort((left, right) => right[1] - left[1])[0];

  return detected && detected[1] > 0 ? detected[0] : 'fr';
}

function countLanguageMarkers(text, markers) {
  return markers.reduce((score, marker) => {
    const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(`\\b${escapedMarker}\\b`, 'gu'));
    return score + (matches?.length || 0);
  }, 0);
}

function getRiskLevel(score, language = 'fr') {
  if (!Number.isFinite(score)) {
    return null;
  }

  const labels = LANGUAGE_CONFIGS[language]?.riskLevels || LANGUAGE_CONFIGS.fr.riskLevels;

  if (score >= 1 && score <= 20) {
    return labels.low;
  }

  if (score >= 21 && score <= 50) {
    return labels.medium;
  }

  if (score >= 51 && score <= 100) {
    return labels.high;
  }

  if (score >= 101 && score <= 125) {
    return labels.critical;
  }

  return null;
}

function normalizeRiskLevels(markdownDocument) {
  if (typeof markdownDocument !== 'string') {
    return markdownDocument;
  }

  return normalizeMarkdownTables(normalizeKnownPhrases(markdownDocument));
}

function normalizeKnownPhrases(document) {
  return document
    .replaceAll('Utlisation sécurisée', 'Utilisation sécurisée')
    .replaceAll('PDV requise pour EPI', 'procédure de vérification des EPI requise')
    .replaceAll("Fréquence d'interventions augm.", 'fréquence d’interventions augmentée')
    .replaceAll('Fréquence des presences des produits', 'présence régulière des produits')
    .replaceAll('€ pour reformation', 'formation complémentaire à planifier')
    .replaceAll('Utiliser régulièrement', 'utilisation régulière');
}

function normalizeMarkdownTables(document) {
  const lines = document.split('\n');
  const output = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    if (isMarkdownTableRow(line) && isMarkdownTableRow(nextLine) && isMarkdownTableSeparator(splitMarkdownRow(nextLine))) {
      const tableLines = [line, nextLine];
      index += 2;

      while (index < lines.length) {
        const currentLine = lines[index];

        if (currentLine.trim().length === 0) {
          break;
        }

        if (isMarkdownTableRow(currentLine)) {
          tableLines.push(currentLine);
          index += 1;
          continue;
        }

        if (tableLines.length > 2) {
          tableLines[tableLines.length - 1] = `${tableLines[tableLines.length - 1]} ${currentLine.trim()}`;
          index += 1;
          continue;
        }

        break;
      }

      output.push(...normalizeMarkdownTableBlock(tableLines));
      continue;
    }

    output.push(line);
    index += 1;
  }

  return normalizeKnownPhrases(output.join('\n'));
}

function normalizeMarkdownTableBlock(tableLines) {
  if (!Array.isArray(tableLines) || tableLines.length < 2) {
    return tableLines || [];
  }

  const headers = splitMarkdownRow(tableLines[0]);
  const separator = tableLines[1];
  const columnRoles = identifyColumnRoles(headers);
  const normalizedRows = tableLines.slice(2).map((rowLine) => {
    const rowCells = splitMarkdownRow(rowLine);
    normalizeRiskLevelCells(rowCells, columnRoles);
    normalizeBudgetCells(rowCells, columnRoles);
    return formatMarkdownRow(rowCells);
  });

  return [formatMarkdownRow(headers), separator, ...normalizedRows];
}

function identifyColumnRoles(headers) {
  const roles = {
    score: [],
    level: [],
    budget: [],
    means: [],
  };
  const tableLanguage = inferTableLanguage(headers);

  headers.forEach((header, index) => {
    const normalizedHeader = normalizeTableHeader(header);

    if (normalizedHeader.includes('score') || normalizedHeader.includes('punktzahl')) {
      roles.score.push(index);
    }

    if (
      normalizedHeader.includes('niveau') ||
      normalizedHeader.includes('level') ||
      normalizedHeader.includes('niveau de risque') ||
      normalizedHeader.includes('risiconiveau') ||
      normalizedHeader.includes('risikostufe')
    ) {
      roles.level.push({
        index,
        language: getRiskLevelLanguage(normalizedHeader, tableLanguage),
      });
    }

    if (normalizedHeader.includes('budget')) {
      roles.budget.push({
        index,
        language: getBudgetLanguage(normalizedHeader),
      });
    }

    if (
      normalizedHeader.includes('moyens') ||
      normalizedHeader.includes('resources') ||
      normalizedHeader.includes('middelen') ||
      normalizedHeader.includes('mittel')
    ) {
      roles.means.push(index);
    }
  });

  return roles;
}

function inferTableLanguage(headers) {
  const normalizedHeaders = headers.map(normalizeTableHeader).join(' | ');

  if (
    normalizedHeaders.includes('gefahrdung') ||
    normalizedHeaders.includes('punktzahl') ||
    normalizedHeaders.includes('verantwortliche person') ||
    normalizedHeaders.includes('vorhandene nachweise')
  ) {
    return 'de';
  }

  if (
    normalizedHeaders.includes('activiteit') ||
    normalizedHeaders.includes('blootgestelde personen') ||
    normalizedHeaders.includes('bestaand bewijs') ||
    normalizedHeaders.includes('waarschijnlijkheid') ||
    normalizedHeaders.includes('verantwoordelijke')
  ) {
    return 'nl';
  }

  if (
    normalizedHeaders.includes('exposed persons') ||
    normalizedHeaders.includes('existing evidence') ||
    normalizedHeaders.includes('responsible person') ||
    normalizedHeaders.includes('level')
  ) {
    return 'en';
  }

  return 'fr';
}

function normalizeRiskLevelCells(rowCells, columnRoles) {
  for (const levelColumn of columnRoles.level) {
    const levelIndex = levelColumn.index;
    const scoreIndex = findMatchingScoreIndex(rowCells, columnRoles.score, levelIndex);
    if (scoreIndex === null) {
      continue;
    }

    const score = parseRiskScore(rowCells[scoreIndex]);
    const level = getRiskLevel(score, levelColumn.language);

    if (level) {
      rowCells[levelIndex] = level;
    }
  }
}

function getRiskLevelLanguage(normalizedHeader, tableLanguage = 'fr') {
  if (normalizedHeader.includes('level')) {
    return 'en';
  }

  if (normalizedHeader === 'niveau') {
    return tableLanguage;
  }

  if (normalizedHeader.includes('risiconiveau')) {
    return 'nl';
  }

  if (normalizedHeader.includes('risikostufe')) {
    return 'de';
  }

  return 'fr';
}

function findMatchingScoreIndex(rowCells, scoreIndexes, levelIndex) {
  if (!Array.isArray(scoreIndexes) || scoreIndexes.length === 0) {
    return null;
  }

  const scoreWithNumber = scoreIndexes.find((scoreIndex) => /\b\d{1,3}\b/.test(rowCells[scoreIndex] || ''));
  if (scoreWithNumber !== undefined) {
    return scoreWithNumber;
  }

  return scoreIndexes
    .map((scoreIndex) => ({
      scoreIndex,
      distance: Math.abs(scoreIndex - levelIndex),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.scoreIndex ?? null;
}

function normalizeBudgetCells(rowCells, columnRoles) {
  for (const budgetColumn of columnRoles.budget) {
    const budgetIndex = budgetColumn.index;
    const meansIndex = findClosestColumnIndex(columnRoles.means, budgetIndex);
    if (meansIndex === null || rowCells[meansIndex] === undefined) {
      continue;
    }

    const meansValue = rowCells[meansIndex] || '';
    const budgetValue = rowCells[budgetIndex] || '';
    const amountMatch = meansValue.match(/(?:€\s*\d[\d\s.,]*|\d[\d\s.,]*\s*€)/);
    const hasPlaceholderBudget =
      /information à compléter|à compléter|à estimer|to be completed|to be estimated|te vervolledigen|te ramen|zu ergänzen|zu schätzen/i.test(
        budgetValue,
      );

    if (amountMatch) {
      rowCells[budgetIndex] = normalizeCurrencyAmount(amountMatch[0]);
      rowCells[meansIndex] = getBudgetPlaceholder('planned', budgetColumn.language);
      continue;
    }

    if (hasPlaceholderBudget) {
      rowCells[budgetIndex] = getBudgetPlaceholder('estimate', budgetColumn.language);
    }
  }
}

function getBudgetLanguage(normalizedHeader) {
  if (normalizedHeader.includes('estimated')) {
    return 'en';
  }

  if (normalizedHeader.includes('raming')) {
    return 'nl';
  }

  if (normalizedHeader.includes('geschatztes')) {
    return 'de';
  }

  return 'fr';
}

function getBudgetPlaceholder(kind, language) {
  const placeholders = {
    fr: {
      planned: 'à prévoir',
      estimate: 'à estimer',
    },
    nl: {
      planned: 'te voorzien',
      estimate: 'te ramen',
    },
    en: {
      planned: 'to be planned',
      estimate: 'to be estimated',
    },
    de: {
      planned: 'vorzusehen',
      estimate: 'zu schätzen',
    },
  };

  return placeholders[language]?.[kind] || placeholders.fr[kind];
}

function findClosestColumnIndex(indexes, referenceIndex) {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    return null;
  }

  return indexes
    .map((index) => ({
      index,
      distance: Math.abs(index - referenceIndex),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.index ?? null;
}

function normalizeCurrencyAmount(value) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.startsWith('€')) {
    return cleaned;
  }

  return cleaned.replace(/(\d)/, '€$1');
}

function parseRiskScore(value) {
  if (typeof value !== 'string') {
    return Number.NaN;
  }

  const match = value.match(/\b\d{1,3}\b/);
  return match ? Number(match[0]) : Number.NaN;
}

function normalizeTableHeader(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isMarkdownTableRow(line) {
  return typeof line === 'string' && line.trim().startsWith('|') && line.trim().endsWith('|');
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function formatMarkdownRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function runInternalRiskTests() {
  const cases = [
    [18, 'Faible'],
    [20, 'Faible'],
    [21, 'Moyen'],
    [48, 'Moyen'],
    [60, 'Élevé'],
    [100, 'Élevé'],
    [101, 'Critique'],
  ];

  for (const [score, expected] of cases) {
    assert.equal(getRiskLevel(score), expected, `Score ${score} should map to ${expected}`);
  }

  const normalized = normalizeRiskLevels(`| Score initial | Niveau de risque initial | Moyens nécessaires | Budget estimatif si possible |
| --- | --- | --- | --- |
| 18 | Moyen | €500 | Information à compléter |
| 48 | Élevé | Utlisation sécurisée | PDV requise pour EPI |
| 60 | Moyen | Fréquence d'interventions augm. | € pour reformation |
| 30 | Moyen | à compléter | Information à compléter |
`);

  assert.match(normalized, /\|\s*18\s*\|\s*Faible\s*\|/);
  assert.match(normalized, /\|\s*48\s*\|\s*Moyen\s*\|/);
  assert.match(normalized, /\|\s*60\s*\|\s*Élevé\s*\|/);
  assert.match(normalized, /Utilisation sécurisée/);
  assert.match(normalized, /procédure de vérification des EPI requise/);
  assert.match(normalized, /\|\s*à prévoir\s*\|/);
  assert.match(normalized, /à estimer/);

  const normalizedDutch = normalizeRiskLevels(`| Nr. | Activiteit | Score | Niveau |
| --- | --- | --- | --- |
| 1 | Onderhoud | 18 | Gemiddeld |
| 2 | Onderhoud | 48 | Hoog |
| 3 | Onderhoud | 60 | Gemiddeld |
`);

  assert.match(normalizedDutch, /\|\s*1\s*\|\s*Onderhoud\s*\|\s*18\s*\|\s*Laag\s*\|/);
  assert.match(normalizedDutch, /\|\s*2\s*\|\s*Onderhoud\s*\|\s*48\s*\|\s*Gemiddeld\s*\|/);
  assert.match(normalizedDutch, /\|\s*3\s*\|\s*Onderhoud\s*\|\s*60\s*\|\s*Hoog\s*\|/);

  const normalizedGerman = normalizeRiskLevels(`| Nr. | Tätigkeit oder Aufgabe | Punktzahl | Niveau |
| --- | --- | --- | --- |
| 1 | Wartung | 18 | Mittel |
| 2 | Wartung | 48 | Hoch |
| 3 | Wartung | 60 | Mittel |
`);

  assert.match(normalizedGerman, /\|\s*1\s*\|\s*Wartung\s*\|\s*18\s*\|\s*Niedrig\s*\|/);
  assert.match(normalizedGerman, /\|\s*2\s*\|\s*Wartung\s*\|\s*48\s*\|\s*Mittel\s*\|/);
  assert.match(normalizedGerman, /\|\s*3\s*\|\s*Wartung\s*\|\s*60\s*\|\s*Hoch\s*\|/);

  console.info('Internal risk normalization checks passed.');
}

function buildUserPrompt(documentType, formData, language = 'fr', languageLabel = 'Français') {
  const languageConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const resolvedLanguageLabel = languageConfig.label || languageLabel;
  const riskScale = formatRiskScale(language);
  const structure = [
    `# ${languageConfig.title}`,
    '',
    ...languageConfig.sections.map((sectionTitle, index) => `## ${index + 1}. ${sectionTitle}`),
  ].join('\n');

  return `Type de document demandé : ${documentType}
Langue cible déterminée par le backend : ${language} (${resolvedLanguageLabel})

Données formData à exploiter :
${JSON.stringify(formData, null, 2)}

Consignes opérationnelles :
1. Utilise les valeurs renseignées comme faits fournis. Pour chaque champ "Non renseigné / à vérifier", indique l’information comme manquante, hypothèse prudente ou point à valider.
2. La langue cible est : ${resolvedLanguageLabel}. Tu dois rédiger l’intégralité du document dans cette langue. Si les réponses du formulaire sont majoritairement dans une autre langue, utilise la langue cible déterminée. Si la langue cible n’a pas été fournie mais que les réponses du formulaire sont dans une langue identifiable, réponds dans cette langue. Ne mélange jamais les langues dans les titres, tableaux, explications, priorités, plans d’action, mentions ou conclusions. Les noms officiels belges peuvent rester dans leur forme officielle si nécessaire, mais les explications doivent être dans la langue cible.
3. Respecte exactement cette structure de 18 sections, dans cet ordre, avec ces titres traduits :
${structure}
4. The entire document must be written in the target language. Do not mix languages. Use the translated headings, tables, risk levels and final statement from the language configuration. Do not use these non-target headings or terms: ${languageConfig.forbiddenTerms.join('; ')}.
5. Section 3 : sélectionne maximum 8 références pertinentes parmi : Loi du 4 août 1996, Code du bien-être au travail, Livre Ier, Titre 2 – Politique du bien-être et système dynamique de gestion des risques, Plan Global de Prévention, Plan Annuel d’Action, CPPT, SIPPT/SEPPT, Livre III – Lieux de travail, Livre III, Titre 3 – Prévention incendie, Livre III, Titre 6 – Signalisation de sécurité et de santé, Livre IV – Équipements de travail, Livre VI – Agents chimiques, Livre VIII – Ergonomie et TMS, Livre IX – Protections collectives et EPI. Ne cite pas d’articles et n’utilise pas de libellés approximatifs comme "Livre I Titre 2", "Livre III lieu de travail", "Livre III lieux de travail" ou "Livre IX protections collectives et EPI" sans majuscule ni tiret.
6. Section 3 : les noms officiels français des références réglementaires belges peuvent rester en français, mais les explications autour doivent être en ${resolvedLanguageLabel}.
7. Section 9 : produis un tableau Markdown avec exactement ces colonnes dans la langue cible : ${languageConfig.riskTableColumns}.
8. Section 9 must always contain 8 complete risk rows. Si le contexte est service technique communal, atelier, maintenance, voirie ou espaces verts, couvre les risques les plus pertinents parmi : manutention manuelle ou régulière, machines/outillage électroportatif, projections, bruit, travail en hauteur, produits chimiques, incendie, glissades/chutes, circulation véhicules/piétons, interventions sur voirie, travail isolé, coactivité avec public ou sous-traitants, météo, rangement/stockage/rayonnages. Évite des scores très faibles pour travail en hauteur, produits chimiques, circulation véhicules/piétons, incendie, machines/outillage, manutention régulière, bruit et coactivité sauf justification claire ; le score doit rester cohérent avec Gravité x Probabilité x Exposition et ne doit pas classer un risque grave et fréquent en faible.
9. Remplis les cellules avec des informations plausibles et prudentes. Si l’information manque, utilise dans la langue demandée une formule équivalente à "à vérifier sur le terrain" dans la cellule concernée plutôt que de laisser vide.
10. Avant de finaliser le tableau, vérifie chaque score et niveau : ${riskScale}.
11. Section 8 must always contain 6 to 8 concrete hazards, never only "Dangers identifiés", "Information à compléter ou à valider sur le terrain" or an equivalent. Pour un service technique communal, inclure si pertinent : manutention manuelle, machines/outillage électroportatif, produits chimiques, circulation véhicules/piétons, bruit, travail en hauteur, glissades/chutes de plain-pied, incendie, coactivité avec citoyens ou sous-traitants, conditions météo, travail isolé.
12. Section 11 must always contain at least 4 structured priorities. Each priority must contain ${languageConfig.priorityLabels}.
13. Section 12 must always contain at least 6 action plan items. Use this Markdown table header in the target language: ${languageConfig.actionTableColumns}.
14. Section 14 must always contain 6 to 10 concrete documents. Section 15 must always contain 4 to 8 stakeholders. Section 16 must always contain 4 to 8 appendices. No full section may be replaced only by "to be completed", "à compléter", "te controleren", "zu prüfen" or equivalent.
15. Relis les preuves attendues : elles doivent être vérifiables, professionnelles et cohérentes avec le risque et la mesure. Privilégie : rapport de contrôle, registre de formation, liste de présence, photos avant/après, inventaire mis à jour, FDS centralisées, rapport de visite terrain, PV ou avis du CPPT, registre accidents/incidents, check-list signée. Évite : suivi, constat, conformité normale, document disponible, rapport général.
16. Pour le type de mesure selon la hiérarchie de prévention, utilise uniquement des libellés dans la langue demandée équivalents à : suppression du danger, substitution, mesure technique, protection collective, mesure organisationnelle, information et formation, équipement de protection individuelle, surveillance, contrôle et réévaluation. N’écris pas "mesure à priorité", "conformité normale", "éducation sur le travail extérieur" ni "élimination du risque avéré" si le danger n’est pas réellement supprimé.
17. Section 18 doit contenir exactement cette mention finale traduite, une seule fois :
${languageConfig.finalMention}
18. Before answering, verify: all 18 sections are present; headings match the target language exactly; the risk table has complete rows; the action plan has complete rows; the final statement matches the target language; no heading from another language remains.
19. Garde une réponse concise pour éviter les timeouts.`;
}

function formatRiskScale(language) {
  const labels = LANGUAGE_CONFIGS[language]?.riskLevels || LANGUAGE_CONFIGS.fr.riskLevels;

  return `1-20 ${labels.low}, 21-50 ${labels.medium}, 51-100 ${labels.high}, 101-125 ${labels.critical}`;
}
