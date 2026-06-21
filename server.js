import 'dotenv/config';

import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import OpenAI from 'openai';
import Stripe from 'stripe';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderInternalEmergencyPlanMarkdown } from './src/renderers/internalEmergencyPlanRenderer.js';
import { renderElectricalBtHtRiskAssessmentMarkdown } from './src/renderers/electricalBtHtRiskAssessmentRenderer.js';
import { renderElevatorRiskAssessmentMarkdown } from './src/renderers/elevatorRiskAssessmentRenderer.js';
import { createLicenseStore } from './src/licenseStore.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 9000);
const JSON_LIMIT = process.env.JSON_LIMIT || '100kb';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LICENSE_STORE_PATH = process.env.LICENSE_STORE_PATH || path.join(__dirname, 'data', 'licenses.json');
const USER_LICENSE_STORE_PATH = process.env.USER_LICENSE_STORE_PATH || path.join(__dirname, 'data', 'user_licenses.json');
const licenseStore = createLicenseStore({ jsonPath: USER_LICENSE_STORE_PATH });
const licenseStoreReady = licenseStore.init();
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const RISK_ASSESSMENT_TITLES = {
  fr: {
    documentTitle: 'Analyse de risques – Projet à adapter et à valider',
    referenceLabel: 'Référence',
    dateLabel: 'Date',
    sections: [
      'Identification du document',
      'Contexte et objectif',
      'Références réglementaires belges applicables',
      'Glossaire des abréviations utilisées',
      'Périmètre de l’analyse',
      'Sources d’information utilisées ou à obtenir',
      'Hypothèses et limites',
      'Description des postes, tâches et travailleurs exposés',
      'Plan photos',
      'Identification détaillée des dangers',
      'Méthode de cotation',
      'Tableau principal d’analyse des risques',
      'Analyse des risques résiduels',
      'Priorités d’action',
      'Projet de plan d’action',
      'Lien avec le Plan Annuel d’Action et le Plan Global de Prévention',
      'Documents à créer ou à mettre à jour',
      'Acteurs à consulter ou à impliquer',
      'Annexes nécessaires',
      'Limites d’intervention du conseiller en prévention niveau 3',
      'Points bloquants avant validation',
      'Conclusion',
      'Mention de validation',
    ],
  },
  nl: {
    documentTitle: 'Risicoanalyse – Ontwerp aan te passen en te valideren',
    referenceLabel: 'Referentie',
    dateLabel: 'Datum',
    sections: [
      'Identificatie van het document',
      'Context en doelstelling',
      'Toepasselijke Belgische regelgevende referenties',
      'Glossarium van gebruikte afkortingen',
      'Afbakening van de analyse',
      'Gebruikte of nog te verkrijgen informatiebronnen',
      'Hypothesen en beperkingen',
      'Beschrijving van functies, taken en blootgestelde werknemers',
      'Fotoplan',
      'Gedetailleerde identificatie van de gevaren',
      'Beoordelingsmethode',
      'Hoofdtabel van de risicoanalyse',
      'Analyse van de restrisico’s',
      'Prioritaire acties',
      'Ontwerpactieplan',
      'Verband met het Jaaractieplan en het Globaal Preventieplan',
      'Documenten die moeten worden opgesteld of bijgewerkt',
      'Te raadplegen of te betrekken actoren',
      'Noodzakelijke bijlagen',
      'Grenzen van de tussenkomst van de preventieadviseur niveau 3',
      'Blokkerende punten vóór validatie',
      'Conclusie',
      'Validatievermelding',
    ],
  },
  en: {
    documentTitle: 'Risk assessment – Draft to adapt and validate',
    referenceLabel: 'Reference',
    dateLabel: 'Date',
    sections: [
      'Document identification',
      'Context and objective',
      'Applicable Belgian regulatory references',
      'Glossary of abbreviations used',
      'Scope of the assessment',
      'Information sources used or to be obtained',
      'Assumptions and limitations',
      'Description of jobs, tasks and exposed workers',
      'Photo plan',
      'Detailed identification of hazards',
      'Scoring method',
      'Main risk assessment table',
      'Residual risk analysis',
      'Action priorities',
      'Draft action plan',
      'Link with the Annual Action Plan and the Global Prevention Plan',
      'Documents to create or update',
      'Actors to consult or involve',
      'Required annexes',
      'Limits of intervention of the level 3 prevention advisor',
      'Blocking points before validation',
      'Conclusion',
      'Validation statement',
    ],
  },
  de: {
    documentTitle: 'Gefährdungsbeurteilung – Entwurf zur Anpassung und Validierung',
    referenceLabel: 'Referenz',
    dateLabel: 'Datum',
    sections: [
      'Dokumentidentifikation',
      'Kontext und Zielsetzung',
      'Anwendbare belgische regulatorische Referenzen',
      'Glossar der verwendeten Abkürzungen',
      'Umfang der Beurteilung',
      'Verwendete oder noch zu beschaffende Informationsquellen',
      'Annahmen und Einschränkungen',
      'Beschreibung der Arbeitsplätze, Tätigkeiten und exponierten Beschäftigten',
      'Fotoplan',
      'Detaillierte Identifikation der Gefährdungen',
      'Bewertungsmethode',
      'Haupttabelle der Gefährdungsbeurteilung',
      'Analyse der Restrisiken',
      'Handlungsprioritäten',
      'Entwurf des Maßnahmenplans',
      'Verbindung mit dem Jährlichen Aktionsplan und dem Globalen Präventionsplan',
      'Zu erstellende oder zu aktualisierende Dokumente',
      'Zu konsultierende oder einzubeziehende Akteure',
      'Erforderliche Anhänge',
      'Grenzen der Mitwirkung des Präventionsberaters Niveau 3',
      'Blockierende Punkte vor der Validierung',
      'Schlussfolgerung',
      'Validierungshinweis',
    ],
  },
};

const LANGUAGE_CONFIGS = {
  fr: {
    code: 'fr',
    label: 'Français',
    title: 'Analyse de risques – Projet à adapter et à valider',
    sections: [
      'Identification du document',
      'Contexte et objectif',
      'Références réglementaires belges applicables',
      'Glossaire des abréviations utilisées',
      'Périmètre de l’analyse',
      'Sources d’information utilisées ou à obtenir',
      'Hypothèses et limites',
      'Description des postes, tâches et travailleurs exposés',
      'Plan photos',
      'Identification détaillée des dangers',
      'Méthode de cotation',
      'Tableau principal d’analyse des risques',
      'Analyse des risques résiduels',
      'Priorités d’action',
      'Projet de plan d’action',
      'Lien avec le Plan Annuel d’Action et le Plan Global de Prévention',
      'Documents à créer ou à mettre à jour',
      'Acteurs à consulter ou à impliquer',
      'Annexes nécessaires',
      'Limites d’intervention du conseiller en prévention niveau 3',
      'Points bloquants avant validation',
      'Conclusion',
      'Mention de validation',
    ],
    riskLevels: {
      low: 'Faible',
      medium: 'Moyen',
      high: 'Élevé',
      critical: 'Critique',
    },
    riskInitialSubsectionTitle: 'Évaluation initiale des risques',
    riskFollowUpSubsectionTitle: 'Mesures, suivi et validation',
    riskLinkingSentence:
      'Les numéros de risque sont identiques dans les tableaux 12.1 et 12.2 afin de relier l’évaluation initiale aux mesures de suivi.',
    riskInitialTableColumns:
      'N° | Tâche | Danger | Situation dangereuse ou scénario | Risque ou dommage possible | Exposés | Mesures existantes | Preuves existantes | Éléments observés ou déclarés | Éléments à confirmer | G | P | E | Justification de la cotation | Score initial | Niveau initial',
    riskFollowUpTableColumns:
      'N° | Mesure complémentaire | Niveau STOP | Responsable | Échéance | Score résiduel | Niveau résiduel | Justification du score résiduel | Preuve attendue | Photo à insérer | Annexe à joindre | Priorité | Point bloquant oui/non | Avis externe oui/non',
    residualTableColumns:
      'Risque principal | Score initial | Score résiduel | Condition de réduction | Preuve nécessaire | Statut standardisé | Point bloquant oui/non | Avis externe oui/non',
    actionTableColumns:
      'Risque concerné | Action à réaliser | Responsable | Échéance | Preuve attendue | Photo après correction si nécessaire | Statut standardisé | Lien PAA ou PGP | Point bloquant oui/non | Avis externe oui/non',
    hazardTableColumns:
      'Famille de danger | Danger précis | Scénario plausible | Zone ou tâche concernée | Personnes exposées | Facteurs aggravants | Mesures existantes connues | Preuves à vérifier | Ce que le conseiller doit faire | Où documenter la preuve | Points bloquants avant validation | Photos à prendre',
    completenessTableColumns:
      'Élément évalué | Statut | Commentaire | Action nécessaire | Priorité | Point bloquant oui/non',
    documentStatuses:
      'Projet préparatoire; Analyse partielle; Analyse exploitable sous réserve; Analyse validable après compléments; Non validable en l’état',
    standardStatuses:
      'À vérifier; Non conforme constaté; Action à planifier; Action en cours; Corrigé à vérifier; Clôturé avec preuve; À valider par expert',
    completenessStatuses:
      'Présent; Partiel; Absent; À vérifier; Bloquant avant validation',
    stopLevels:
      'Suppression/Substitution; Technique; Organisationnelle; Protection individuelle',
    provisionalScoreText:
      'Score provisoire à confirmer après vérification terrain. La gravité est estimée sur base des conséquences plausibles, la probabilité sur base des incidents ou mesures existantes connues, et l’exposition sur base de la fréquence déclarée. Les scores doivent être validés par observation terrain et preuves documentaires.',
    advisorHelpBlockTitle: 'Bloc d’aide au conseiller',
    advisorHelpBlockClose: 'FIN DU BLOC',
    referenceToCheck: 'Référence à vérifier.',
    priorityLabels: 'action, risque concerné, responsable, échéance et preuve attendue',
    forbiddenTerms: ['Risk assessment', 'Risicoanalyse', 'Gefährdungsbeurteilung'],
    missingInfo: 'Information à compléter ou à valider sur le terrain.',
    draftSuffix: 'Projet à adapter et à valider',
    secondaryTitle: 'Récapitulatif et suivi des actions',
    gdprReminder:
      'Limiter les données personnelles au strict nécessaire, éviter toute donnée médicale non indispensable et vérifier les règles RGPD applicables avant diffusion.',
    finalMention:
      'Ce document est un projet d’aide à l’analyse de risques destiné à être adapté à la situation réelle de l’entreprise. Il doit être complété par les observations terrain, les pièces justificatives et les validations nécessaires. Il doit être validé par le conseiller en prévention, l’employeur et, le cas échéant, le service externe, le médecin du travail, le CPPT, un organisme agréé ou un expert compétent. Il ne constitue pas à lui seul une preuve de conformité réglementaire.',
  },
  nl: {
    code: 'nl',
    label: 'Nederlands',
    title: 'Risicoanalyse – Ontwerp te valideren',
    sections: [
      'Identificatie van het document',
      'Context en doelstelling',
      'Toepasselijke Belgische regelgevende referenties',
      'Glossarium van gebruikte afkortingen',
      'Afbakening van de analyse',
      'Gebruikte of nog te verkrijgen informatiebronnen',
      'Hypothesen en beperkingen',
      'Beschrijving van functies, taken en blootgestelde werknemers',
      'Fotoplan',
      'Gedetailleerde identificatie van de gevaren',
      'Beoordelingsmethode',
      'Hoofdtabel van de risicoanalyse',
      'Analyse van de restrisico’s',
      'Prioritaire acties',
      'Ontwerpactieplan',
      'Verband met het Jaaractieplan en het Globaal Preventieplan',
      'Documenten die moeten worden opgesteld of bijgewerkt',
      'Te raadplegen of te betrekken actoren',
      'Noodzakelijke bijlagen',
      'Grenzen van de tussenkomst van de preventieadviseur niveau 3',
      'Blokkerende punten vóór validatie',
      'Conclusie',
      'Validatievermelding',
    ],
    riskLevels: {
      low: 'Laag',
      medium: 'Gemiddeld',
      high: 'Hoog',
      critical: 'Kritiek',
    },
    riskInitialSubsectionTitle: 'Initiële risicobeoordeling',
    riskFollowUpSubsectionTitle: 'Maatregelen, opvolging en validatie',
    riskLinkingSentence:
      'De risiconummers zijn identiek in de tabellen 12.1 en 12.2 om de initiële beoordeling te koppelen aan de opvolgingsmaatregelen.',
    riskInitialTableColumns:
      'Nr. | Taak | Gevaar | Gevaarlijke situatie of scenario | Mogelijk risico of schade | Blootgestelden | Bestaande maatregelen | Bestaande bewijzen | Vastgestelde of verklaarde elementen | Te bevestigen elementen | E | W | B | Motivering van de beoordeling | Initiële score | Initieel niveau',
    riskFollowUpTableColumns:
      'Nr. | Aanvullende maatregel | STOP-niveau | Verantwoordelijke | Termijn | Restrisicoscore | Restrisiconiveau | Motivering van de restrisicoscore | Verwacht bewijs | Foto in te voegen | Bijlage toe te voegen | Prioriteit | Blokkerend punt ja/nee | Extern advies ja/nee',
    residualTableColumns:
      'Belangrijkste risico | Initiële score | Restrisicoscore | Voorwaarde voor vermindering | Vereist bewijs | Gestandaardiseerde status | Blokkerend punt ja/nee | Extern advies ja/nee',
    actionTableColumns:
      'Betrokken risico | Uit te voeren actie | Verantwoordelijke | Termijn | Verwacht bewijs | Foto na correctie indien nodig | Gestandaardiseerde status | Link JAP of GPP | Blokkerend punt ja/nee | Extern advies ja/nee',
    hazardTableColumns:
      'Gevarenfamilie | Precies gevaar | Waarschijnlijk scenario | Betrokken zone of taak | Blootgestelde personen | Verergerende factoren | Bekende bestaande maatregelen | Te controleren bewijzen | Wat de preventieadviseur moet doen | Waar het bewijs te documenteren | Blokkerende punten vóór validatie | Te nemen foto’s',
    completenessTableColumns:
      'Beoordeeld element | Status | Opmerking | Noodzakelijke actie | Prioriteit | Blokkerend punt ja/nee',
    documentStatuses:
      'Voorbereidend ontwerp; Gedeeltelijke analyse; Analyse bruikbaar onder voorbehoud; Analyse valideerbaar na aanvullingen; Niet valideerbaar in de huidige staat',
    standardStatuses:
      'Te controleren; Niet-conformiteit vastgesteld; Actie te plannen; Actie lopend; Gecorrigeerd, te controleren; Afgesloten met bewijs; Te valideren door expert',
    completenessStatuses:
      'Aanwezig; Gedeeltelijk; Afwezig; Te controleren; Blokkerend vóór validatie',
    stopLevels:
      'Eliminatie/substitutie; Technisch; Organisatorisch; Persoonlijke bescherming',
    provisionalScoreText:
      'Voorlopige score te bevestigen na terreincontrole. De ernst wordt ingeschat op basis van plausibele gevolgen, de waarschijnlijkheid op basis van bekende incidenten of bestaande maatregelen, en de blootstelling op basis van de aangegeven frequentie. De scores moeten worden gevalideerd door terreinobservatie en documentaire bewijzen.',
    advisorHelpBlockTitle: 'Hulpblok voor de preventieadviseur',
    advisorHelpBlockClose: 'EINDE VAN HET BLOK',
    referenceToCheck: 'Referentie te controleren.',
    priorityLabels: 'actie, risico, verantwoordelijke, deadline en verwacht bewijs',
    forbiddenTerms: ['Analyse de risques', 'Risk assessment', 'Gefährdungsbeurteilung'],
    missingInfo: 'Informatie aan te vullen of te valideren tijdens het terreinbezoek.',
    draftSuffix: 'Ontwerp aan te passen en te valideren',
    secondaryTitle: 'Samenvatting en opvolging van acties',
    gdprReminder:
      'Beperk persoonsgegevens tot wat strikt noodzakelijk is, vermijd niet-noodzakelijke medische gegevens en controleer de toepasselijke AVG-regels vóór verspreiding.',
    finalMention:
      'Dit document is een ontwerphulpmiddel voor de risicoanalyse dat moet worden aangepast aan de werkelijke situatie van de onderneming. Het moet worden aangevuld met terreinobservaties, bewijsstukken en de noodzakelijke validaties. Het moet worden gevalideerd door de preventieadviseur, de werkgever en, indien van toepassing, de externe dienst, de arbeidsarts, het CPBW, een erkend organisme of een bevoegde expert. Het vormt op zichzelf geen bewijs van reglementaire conformiteit.',
  },
  en: {
    code: 'en',
    label: 'English',
    title: 'Risk assessment – Draft for validation',
    sections: [
      'Document identification',
      'Context and objective',
      'Applicable Belgian regulatory references',
      'Glossary of abbreviations used',
      'Scope of the assessment',
      'Information sources used or to be obtained',
      'Assumptions and limitations',
      'Description of jobs, tasks and exposed workers',
      'Photo plan',
      'Detailed identification of hazards',
      'Scoring method',
      'Main risk assessment table',
      'Residual risk analysis',
      'Action priorities',
      'Draft action plan',
      'Link with the Annual Action Plan and the Global Prevention Plan',
      'Documents to create or update',
      'Actors to consult or involve',
      'Required annexes',
      'Limits of intervention of the level 3 prevention advisor',
      'Blocking points before validation',
      'Conclusion',
      'Validation statement',
    ],
    riskLevels: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    riskInitialSubsectionTitle: 'Initial risk assessment',
    riskFollowUpSubsectionTitle: 'Measures, follow-up and validation',
    riskLinkingSentence:
      'The risk numbers are identical in tables 12.1 and 12.2 in order to link the initial assessment to the follow-up measures.',
    riskInitialTableColumns:
      'No. | Task | Hazard | Hazardous situation or scenario | Possible risk or harm | Exposed persons | Existing measures | Existing evidence | Observed or declared elements | Elements to be confirmed | S | P | E | Scoring justification | Initial score | Initial level',
    riskFollowUpTableColumns:
      'No. | Additional measure | STOP level | Responsible person | Deadline | Residual score | Residual level | Residual score justification | Expected evidence | Photo to insert | Annex to attach | Priority | Blocking point yes/no | External advice yes/no',
    residualTableColumns:
      'Main risk | Initial score | Residual score | Reduction condition | Required evidence | Standardised status | Blocking point yes/no | External opinion yes/no',
    actionTableColumns:
      'Related risk | Action to be carried out | Responsible person | Deadline | Expected evidence | Photo after correction if necessary | Standardised status | AAP or GPP link | Blocking point yes/no | External opinion yes/no',
    hazardTableColumns:
      'Hazard family | Specific hazard | Plausible scenario | Area or task concerned | Exposed persons | Aggravating factors | Known existing measures | Evidence to be checked | What the prevention advisor must do | Where to document the evidence | Blocking points before validation | Photos to take',
    completenessTableColumns:
      'Assessed element | Status | Comment | Required action | Priority | Blocking point yes/no',
    documentStatuses:
      'Preparatory draft; Partial assessment; Assessment usable subject to reservations; Assessment validable after additional information; Not validable as it stands',
    standardStatuses:
      'To be checked; Non-compliance identified; Action to be planned; Action in progress; Corrected, to be checked; Closed with evidence; To be validated by an expert',
    completenessStatuses:
      'Present; Partial; Missing; To be checked; Blocking before validation',
    stopLevels:
      'Elimination/substitution; Technical; Organisational; Personal protection',
    provisionalScoreText:
      'Provisional score to be confirmed after field verification. Severity is estimated based on plausible consequences, probability based on known incidents or existing measures, and exposure based on the declared frequency. The scores must be validated through field observation and documentary evidence.',
    advisorHelpBlockTitle: 'Prevention Advisor Help Block',
    advisorHelpBlockClose: 'END OF BLOCK',
    referenceToCheck: 'Reference to be checked.',
    priorityLabels: 'action, risk, responsible, deadline and expected evidence',
    forbiddenTerms: ['Analyse de risques', 'Risicoanalyse', 'Gefährdungsbeurteilung'],
    missingInfo: 'Information to be completed or validated during the site visit.',
    draftSuffix: 'Draft to be adapted and validated',
    secondaryTitle: 'Action Summary and Follow-Up',
    gdprReminder:
      'Limit personal data to what is strictly necessary, avoid unnecessary medical data and check the applicable GDPR rules before distribution.',
    finalMention:
      'This document is a draft risk assessment support document intended to be adapted to the actual situation of the organisation. It must be completed with field observations, supporting evidence and the necessary validations. It must be validated by the prevention advisor, the employer and, where applicable, the external service, the occupational physician, the health and safety committee, an accredited body or a competent expert. It does not constitute proof of regulatory compliance on its own.',
  },
  de: {
    code: 'de',
    label: 'Deutsch',
    title: 'Gefährdungsbeurteilung – Entwurf zur Validierung',
    sections: [
      'Dokumentidentifikation',
      'Kontext und Zielsetzung',
      'Anwendbare belgische regulatorische Referenzen',
      'Glossar der verwendeten Abkürzungen',
      'Umfang der Beurteilung',
      'Verwendete oder noch zu beschaffende Informationsquellen',
      'Annahmen und Einschränkungen',
      'Beschreibung der Arbeitsplätze, Tätigkeiten und exponierten Beschäftigten',
      'Fotoplan',
      'Detaillierte Identifikation der Gefährdungen',
      'Bewertungsmethode',
      'Haupttabelle der Gefährdungsbeurteilung',
      'Analyse der Restrisiken',
      'Handlungsprioritäten',
      'Entwurf des Maßnahmenplans',
      'Verbindung mit dem Jährlichen Aktionsplan und dem Globalen Präventionsplan',
      'Zu erstellende oder zu aktualisierende Dokumente',
      'Zu konsultierende oder einzubeziehende Akteure',
      'Erforderliche Anhänge',
      'Grenzen der Mitwirkung des Präventionsberaters Niveau 3',
      'Blockierende Punkte vor der Validierung',
      'Schlussfolgerung',
      'Validierungshinweis',
    ],
    riskLevels: {
      low: 'Niedrig',
      medium: 'Mittel',
      high: 'Hoch',
      critical: 'Kritisch',
    },
    riskInitialSubsectionTitle: 'Erste Risikobewertung',
    riskFollowUpSubsectionTitle: 'Maßnahmen, Nachverfolgung und Validierung',
    riskLinkingSentence:
      'Die Risikonummern sind in den Tabellen 12.1 und 12.2 identisch, um die erste Bewertung mit den Nachverfolgungsmaßnahmen zu verbinden.',
    riskInitialTableColumns:
      'Nr. | Aufgabe | Gefährdung | Gefährliche Situation oder Szenario | Mögliches Risiko oder Schaden | Exponierte Personen | Bestehende Maßnahmen | Bestehende Nachweise | Beobachtete oder angegebene Elemente | Zu bestätigende Elemente | S | W | E | Begründung der Bewertung | Ausgangsbewertung | Ausgangsniveau',
    riskFollowUpTableColumns:
      'Nr. | Zusätzliche Maßnahme | STOP-Ebene | Verantwortliche Person | Frist | Restrisikobewertung | Restrisikoniveau | Begründung der Restrisikobewertung | Erwarteter Nachweis | Foto einzufügen | Anhang beizufügen | Priorität | Blockierender Punkt ja/nein | Externe Stellungnahme ja/nein',
    residualTableColumns:
      'Hauptrisiko | Ausgangsbewertung | Restrisikobewertung | Bedingung für die Reduzierung | Erforderlicher Nachweis | Standardisierter Status | Blockierender Punkt ja/nein | Externe Stellungnahme ja/nein',
    actionTableColumns:
      'Betroffenes Risiko | Durchzuführende Maßnahme | Verantwortliche Person | Frist | Erwarteter Nachweis | Foto nach Korrektur falls erforderlich | Standardisierter Status | Bezug JAP oder GPP | Blockierender Punkt ja/nein | Externe Stellungnahme ja/nein',
    hazardTableColumns:
      'Gefährdungsfamilie | Genaue Gefährdung | Plausibles Szenario | Betroffener Bereich oder Aufgabe | Exponierte Personen | Erschwerende Faktoren | Bekannte bestehende Maßnahmen | Zu prüfende Nachweise | Was der Präventionsberater tun muss | Wo der Nachweis zu dokumentieren ist | Blockierende Punkte vor Validierung | Zu machende Fotos',
    completenessTableColumns:
      'Bewertetes Element | Status | Kommentar | Erforderliche Maßnahme | Priorität | Blockierender Punkt ja/nein',
    documentStatuses:
      'Vorbereitender Entwurf; Teilweise Beurteilung; Beurteilung unter Vorbehalt nutzbar; Beurteilung nach Ergänzungen validierbar; In der vorliegenden Form nicht validierbar',
    standardStatuses:
      'Zu prüfen; Nichtkonformität festgestellt; Maßnahme zu planen; Maßnahme läuft; Korrigiert, zu prüfen; Mit Nachweis abgeschlossen; Durch Experten zu validieren',
    completenessStatuses:
      'Vorhanden; Teilweise; Fehlend; Zu prüfen; Blockierend vor Validierung',
    stopLevels:
      'Beseitigung/Substitution; Technisch; Organisatorisch; Persönlicher Schutz',
    provisionalScoreText:
      'Vorläufige Bewertung, die nach Vor-Ort-Überprüfung zu bestätigen ist. Die Schwere wird anhand plausibler Folgen, die Wahrscheinlichkeit anhand bekannter Vorfälle oder vorhandener Maßnahmen und die Exposition anhand der angegebenen Häufigkeit eingeschätzt. Die Bewertungen müssen durch Vor-Ort-Beobachtung und dokumentierte Nachweise validiert werden.',
    advisorHelpBlockTitle: 'Hilfsblock für den Präventionsberater',
    advisorHelpBlockClose: 'ENDE DES BLOCKS',
    referenceToCheck: 'Referenz zu prüfen.',
    priorityLabels: 'Aktion, Risiko, Verantwortlicher, Frist und erwarteter Nachweis',
    forbiddenTerms: ['Analyse de risques', 'Risicoanalyse', 'Risk assessment'],
    missingInfo: 'Informationen sind vor Ort zu ergänzen oder zu validieren.',
    draftSuffix: 'Entwurf zur Anpassung und Validierung',
    secondaryTitle: 'Zusammenfassung und Nachverfolgung der Maßnahmen',
    gdprReminder:
      'Beschränken Sie personenbezogene Daten auf das unbedingt Erforderliche, vermeiden Sie nicht notwendige medizinische Daten und prüfen Sie vor der Weitergabe die anwendbaren DSGVO-Regeln.',
    finalMention:
      'Dieses Dokument ist ein Entwurf zur Unterstützung der Gefährdungsbeurteilung und muss an die tatsächliche Situation des Unternehmens angepasst werden. Es muss durch Vor-Ort-Beobachtungen, Nachweise und die erforderlichen Validierungen ergänzt werden. Es muss vom Präventionsberater, vom Arbeitgeber sowie gegebenenfalls vom externen Dienst, vom Arbeitsmediziner, vom Ausschuss für Gefahrenverhütung und Schutz am Arbeitsplatz, von einer zugelassenen Stelle oder von einem zuständigen Experten validiert werden. Es stellt für sich allein keinen Nachweis der regulatorischen Konformität dar.',
  },
};

const SYSTEM_PROMPT = `Tu es PreventIA Belgique, un assistant spécialisé en prévention, sécurité, santé et bien-être au travail en Belgique.

Tu aides à produire des projets d’analyses de risques et documents de prévention selon la logique du Code belge du bien-être au travail. Tu ne remplaces jamais le conseiller en prévention, l’employeur, le SIPPT/SEPPT, le médecin du travail, le CPPT ou les autorités compétentes.

Règles strictes :
- Répondre uniquement en Markdown, sans JSON ni préambule, sauf lorsque le prompt utilisateur demande explicitement un JSON structuré interne pour une analyse de risques.
- Répondre exclusivement dans la langue demandée par le prompt utilisateur, avec un ton professionnel, sans anglicisme inutile et sans formulation familière, approximative ou non professionnelle.
- Respecter exactement l’ordre, les titres et les tableaux demandés par le template utilisateur.
- Pour les analyses de risques, conserver exactement les 23 titres numérotés demandés. Ne jamais produire une ancienne structure à 17 ou 18 sections.
- Rester synthétique : environ 2500 à 3500 mots maximum.
- Ne jamais affirmer qu’un document est juridiquement complet.
- Ne jamais inventer d’articles légaux précis ; citer seulement la loi, le Code, les Livres ou Titres pertinents.
- Exploiter tous les champs formData. La valeur "Non renseigné / à vérifier" est une information manquante à traiter comme point à vérifier, pas comme une raison de laisser une section vide.
- Distinguer faits fournis, hypothèses prudentes, informations manquantes et points à valider lorsque c’est utile.
- Ne jamais produire un tableau rempli uniquement avec "À compléter".
- Dans les analyses de risques, ne jamais utiliser seul un fallback vague comme "Information à compléter ou à valider sur le terrain." Si des informations existent, produire une analyse provisoire et préciser ce qui manque, pourquoi c’est important, quelle preuve est attendue et qui doit vérifier. Si aucune information exploitable n’existe, ajouter quand même une action de validation concrète.
- Dans les analyses de risques, ne jamais laisser croire que l’analyse est finalisée lorsque la visite terrain, les preuves documentaires, la consultation des travailleurs, le CPPT, les FDS, les rapports de contrôle, les justifications de cotation, les mesures existantes ou les avis externes nécessaires restent à confirmer.
- Dans les analyses de risques, vérifier strictement que chaque contenu est placé sous le bon titre : le glossaire uniquement en section 4, le périmètre uniquement en section 5, le plan photos uniquement en section 9, la méthode G x P x E uniquement en section 11, le tableau principal uniquement en section 12, les priorités uniquement en section 14, le lien PAA/PGP uniquement en section 16, les documents à créer uniquement en section 17, les acteurs uniquement en section 18, les annexes uniquement en section 19, la conclusion rédigée uniquement en section 22 et la mention finale uniquement en section 23.
- Ne jamais déplacer le lien PAA/PGP dans les annexes, ne jamais déplacer les documents à créer dans la conclusion, ne jamais placer le glossaire dans le périmètre et ne jamais placer le plan photos dans le tableau principal.
- Ne jamais répéter la mention finale. Elle apparaît une seule fois, dans la dernière section demandée.
- Ne jamais utiliser de séparateur horizontal Markdown visible : pas de ligne seule "---", "----" ou "| --- |" hors tableau.
- Relire la réponse avant sortie : corriger grammaire, accord, ton professionnel et cohérence métier ; remplacer toute formulation non professionnelle, incohérente, anglaise ou mal traduite.
- Interdire les formulations absurdes, non professionnelles, anglaises ou hors contexte. Ne jamais écrire notamment : "risque vétérinaire", "clash de l’intensité du bruit", "outils violents", "registre des médicaments", "Cet projet", "Chemiste interne", "Suivi des consommateurs", "Formation de maintien correct", "Production de normes claires", "Assemblée de travailleurs formés", "Systèmes de fichier", "Chutes/slips", "véhicules/péda", "Média", "PRS des CPPT", "Risque critique tr", "Plan Global de Protection", "Retour au travail des piétons", "Retour au travail", "Exportation occasionnelle", "Exportation", "Fréquence des interventions dernières", "Conformité normale", "Utlisation sécurisée", "PDV requise pour EPI", "Fréquence d'interventions augm.", "Fréquence des presences", "Fréquence des presences des produits", "€ pour reformation", "Fiches de donnée sécurité", "EPI audios", "État de l’atelier contrôle", "Mesure à priorité", "Risqués", "Utilisation d’équipements dangereuse sans précision", "Engagement renforcé", "Utiliser régulièrement", "Accident register", "Moderate", "Préventeur interna", "interna", "Barrage aux risques chimiques", "Barrage aux risques", "Effectivité", "environnement de travail agitée", "environnement agitée" ou "Une perte auditive".
- Employer un vocabulaire prévention adapté : machines et outillage électroportatif, machines bruyantes, registre des accidents/incidents, risque de chute de hauteur, exposition au bruit, exposition à des agents chimiques, circulation véhicules/piétons, glissades et chutes de plain-pied.
- Remplacer les formulations faibles ou interdites par : "circulation véhicules/piétons", "exposition occasionnelle", "fréquence d’intervention à vérifier sur le terrain", "conformité à vérifier", "registre des accidents/incidents", "modérée", "procédure de vérification des EPI", "préventeur interne ou conseiller en prévention interne", "maîtrise des risques chimiques", "utilisation sécurisée", "présence régulière des produits", "formation complémentaire à planifier", "fiches de données de sécurité", "EPI auditifs", "état de l’atelier contrôlé", "mesure organisationnelle", "mesure technique", "formation et information", "protection collective", "équipement de protection individuelle", "risques", "responsable produits chimiques", "magasinier", "suivi des travailleurs exposés", "registre de consultation des FDS", "formation manutention et gestes/postures", "critères de prévention formalisés", "taux de travailleurs formés", "inventaire documentaire structuré", "PV ou avis du CPPT", "Risque critique si score 61 à 125 uniquement", "Plan Global de Prévention", "efficacité de la signalisation", "environnement de travail bruyant ou perturbé", "perte auditive".
- Utiliser exactement ces libellés réglementaires quand ils sont pertinents : "Livre Ier, Titre 2 – Politique du bien-être et système dynamique de gestion des risques", "Livre III – Lieux de travail", "Livre III, Titre 3 – Prévention incendie", "Livre III, Titre 6 – Signalisation de sécurité et de santé", "Livre IV – Équipements de travail", "Livre VI – Agents chimiques", "Livre VIII – Ergonomie et TMS", "Livre IX – Protections collectives et EPI". Ne pas écrire "Livre I Titre 2", "Livre III lieu de travail", "Livre III lieux de travail" ou "Livre IX protections collectives et EPI" sans majuscule ni tiret.
- Vérifier que chaque preuve attendue correspond au risque, à la mesure proposée et au contexte de prévention belge. Privilégier des preuves concrètes : rapport de contrôle, registre de formation, liste de présence, photos avant/après, inventaire mis à jour, FDS centralisées, rapport de visite terrain, PV ou avis du CPPT, registre accidents/incidents, check-list signée. Éviter les preuves vagues : suivi, constat, conformité normale, document disponible, rapport général.
- Le type de mesure selon la hiérarchie de prévention doit utiliser un libellé parmi : suppression du danger, substitution, mesure technique, protection collective, mesure organisationnelle, information et formation, équipement de protection individuelle, surveillance, contrôle et réévaluation. Ne pas écrire "mesure à priorité", "conformité normale", "éducation sur le travail extérieur" ni "élimination du risque avéré" si le danger n’est pas réellement supprimé.

Cotation : Risque = Gravité x Probabilité x Exposition.
Gravité, Probabilité et Exposition sont cotées de 1 à 5. Niveau : 1 à 10 = Faible ; 11 à 30 = Moyen ; 31 à 60 = Élevé ; 61 à 125 = Critique. Les justifications G/P/E doivent être courtes. Avant de répondre, vérifie que chaque niveau correspond exactement au score selon la grille. Ne jamais classer 10 comme Moyen, 30 comme Élevé, 60 comme Critique, ni 36 ou 48 comme Moyen. Ne force jamais artificiellement un score élevé, mais ne sous-évalue pas les risques typiques d’un service technique communal lorsque l’exposition est régulière ou la gravité importante : travail en hauteur, produits chimiques, circulation véhicules/piétons, incendie, machines/outillage, manutention régulière, bruit, coactivité avec public ou sous-traitants. Évite les scores très faibles pour ces risques sauf justification claire et cohérente avec Gravité x Probabilité x Exposition ; ne classe pas un risque grave et fréquent en risque faible.

Structure obligatoire par défaut pour une analyse de risques en français si aucune autre langue valide n’est demandée :
# Analyse de risques – Projet à adapter et à valider

## 1. Identification du document
## 2. Contexte et objectif
## 3. Références réglementaires belges applicables
## 4. Glossaire des abréviations utilisées
## 5. Périmètre de l’analyse
## 6. Sources d’information utilisées ou à obtenir
## 7. Hypothèses et limites
## 8. Description des postes, tâches et travailleurs exposés
## 9. Plan photos
## 10. Identification détaillée des dangers
## 11. Méthode de cotation
## 12. Tableau principal d’analyse des risques
## 13. Analyse des risques résiduels
## 14. Priorités d’action
## 15. Projet de plan d’action
## 16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention
## 17. Documents à créer ou à mettre à jour
## 18. Acteurs à consulter ou à impliquer
## 19. Annexes nécessaires
## 20. Limites d’intervention du conseiller en prévention niveau 3
## 21. Points bloquants avant validation
## 22. Conclusion
## 23. Mention de validation

Contraintes de sortie :
- Section 3 : tableau Markdown avec colonnes équivalentes à "Référence ou domaine réglementaire", "Pourquoi c’est applicable", "Conséquence pratique", "Document ou preuve à prévoir", "Validation ou avis nécessaire", dans la langue demandée.
- Section 4 : expliquer uniquement les abréviations et termes techniques réellement utilisés dans le document, dans la langue demandée.
- Section 6 : tableau des sources, disponibilité, preuve attendue et classement.
- Section 8 : tableau des postes, activités réelles, exposition, photos à prendre et documents à joindre.
- Section 9 : plan photos obligatoire avec règles de confidentialité, photos générales/détail et avant/après.
- Section 10 : tableau de 6 à 8 dangers concrets avec preuves, actions du conseiller, points bloquants et photos.
- Section 11 : expliquer la formule, les échelles, les seuils et l’interprétation de la cotation.
- Section 12 : deux sous-sections obligatoires, 12.1 Évaluation initiale des risques et 12.2 Mesures, suivi et validation. Répartir les 8 mêmes risques entre les deux tableaux avec le même numéro de risque.
- Section 13 : synthèse des risques résiduels uniquement, sans reprendre le tableau principal complet.
- Section 14 : au moins 4 priorités structurées avec responsables, échéances, preuves, photos ou annexes utiles.
- Section 15 : tableau Markdown de 6 à 8 actions distinguant maîtrise du risque et validation de l’analyse.
- Section 16 : expliquer les actions urgentes pour le PAA, les actions structurelles pour le PGP, les points CPPT et le suivi direction.
- Sections 17, 18 et 19 : séparer clairement documents à créer, acteurs à consulter et annexes/preuves.
- Section 20 : limites d’intervention du conseiller en prévention niveau 3 et avis externes nécessaires.
- Section 21 : points bloquants avant validation, preuve attendue, responsable, échéance, avis externe et condition de levée.
- Section 22 : conclusion avec risques principaux, points bloquants, actions urgentes, avis externes, annexes manquantes, validations nécessaires, date de réévaluation recommandée et limites du projet.
- Ne jamais placer un tableau dans la section 22 Conclusion.
- Par défaut en français, la section 23 doit contenir exactement cette mention, une seule fois :
Ce document est un projet d’aide à l’analyse de risques destiné à être adapté à la situation réelle de l’entreprise. Il doit être complété par les observations terrain, les pièces justificatives et les validations nécessaires. Il doit être validé par le conseiller en prévention, l’employeur et, le cas échéant, le service externe, le médecin du travail, le CPPT, un organisme agréé ou un expert compétent. Il ne constitue pas à lui seul une preuve de conformité réglementaire.`;

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

const SECONDARY_DOCUMENT_SEPARATOR = '<!-- preventia-secondary-document -->';

const RISK_DOCUMENT_TYPES = [
  'Analyse de risques générale',
  'Analyse de risques ergonomie',
  'Analyse de risques machines et équipements',
  'Analyse de risques produits chimiques',
  'Analyse de risques incendie et évacuation',
  'Analyse de risques manutention manuelle',
  'Analyse de risques travail en hauteur',
  'Analyse de risques travail isolé',
  'Analyse de risques psychosociaux',
  'Analyse de risques maternité',
  'Analyse de risques jeunes travailleurs',
  'Analyse de risques intérimaires',
];

const NEW_DOCUMENT_DEFINITIONS = [
  {
    id: 'risk_assessment_elevator',
    family: 'elevator_risk_assessment',
    category: 'Analyses de risques',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Analyse de risques — Ascenseur',
      nl: 'Analyse de risques — Ascenseur',
      en: 'Analyse de risques — Ascenseur',
      de: 'Analyse de risques — Ascenseur',
    },
    aliases: [
      'Analyse de risques — Ascenseur',
      'Analyse de risques ascenseur',
      'Analyse ascenseur',
      'Ascenseur',
      'risk_assessment_elevator',
      'elevator_risk_assessment',
    ],
  },
  {
    id: 'risk_assessment_electrical_bt_ht',
    family: 'electrical_bt_ht_risk_assessment',
    category: 'Analyses de risques',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Analyse de risques — Installations électriques BT/HT',
      nl: 'Analyse de risques — Installations électriques BT/HT',
      en: 'Analyse de risques — Installations électriques BT/HT',
      de: 'Analyse de risques — Installations électriques BT/HT',
    },
    aliases: [
      'Analyse de risques — Installations électriques BT/HT',
      'Analyse de risques BT/HT',
      'Analyse de risques électrique',
      'Analyse de risques électricité',
      'Analyse de risques basse tension haute tension',
      'risk_assessment_electrical_bt_ht',
    ],
  },
  {
    id: 'internal_emergency_plan',
    family: 'internal_emergency_plan',
    category: 'Documents d’urgence',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Plan Interne d’Urgence',
      nl: 'Plan Interne d’Urgence',
      en: 'Plan Interne d’Urgence',
      de: 'Plan Interne d’Urgence',
    },
    aliases: [
      'Plan Interne d’Urgence',
      'PIU',
      'Plan d’urgence interne',
      'internal_emergency_plan',
    ],
  },
  {
    id: 'annual_action_plan',
    family: 'annual_action_plan',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Plan annuel d’action',
      nl: 'Jaaractieplan',
      en: 'Annual Action Plan',
      de: 'Jährlicher Aktionsplan',
    },
    requiredFieldGroups: [
      ['secteurActivite', 'entreprise', 'organisation', 'companyName', 'department'],
      ['siteLieuTravail', 'site', 'lieu'],
      [
        'activitePoste',
        'activite',
        'descriptionActivite',
        'objectifsPrevention',
        'preventionObjectives',
        'priorityActions',
        'context',
      ],
    ],
  },
  {
    id: 'five_year_global_prevention_plan',
    family: 'five_year_global_prevention_plan',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Plan global de prévention sur 5 ans',
      nl: 'Globaal preventieplan over 5 jaar',
      en: 'Five-Year Global Prevention Plan',
      de: 'Globaler Präventionsplan über 5 Jahre',
    },
    requiredFieldGroups: [
      ['secteurActivite', 'entreprise', 'organisation', 'companyName', 'department'],
      ['siteLieuTravail', 'site', 'lieu'],
      [
        'activitePoste',
        'activite',
        'descriptionActivite',
        'risquesPrioritaires',
        'priorityRisks',
        'preventionObjectives',
        'context',
      ],
    ],
  },
  {
    id: 'safety_visit_report',
    family: 'safety_visit_report',
    hasSecondaryDocument: true,
    labels: {
      fr: 'Rapport de visite sécurité',
      nl: 'Veiligheidsbezoekverslag',
      en: 'Safety Visit Report',
      de: 'Sicherheitsbegehungsbericht',
    },
    requiredFieldGroups: [
      ['siteLieuTravail', 'site', 'lieuVisite', 'lieu'],
      [
        'activitePoste',
        'zonesVisitees',
        'visitedAreas',
        'objetVisite',
        'visitPurpose',
        'informationsComplementaires',
        'context',
      ],
    ],
  },
  {
    id: 'job_description_sheet',
    family: 'job_description_sheet',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Fiche de poste',
      nl: 'Functiefiche',
      en: 'Job Description Sheet',
      de: 'Stellenbeschreibung',
    },
    requiredFieldGroups: [
      ['activitePoste', 'poste', 'fonction', 'jobTitle'],
      ['secteurActivite', 'service', 'departement', 'department', 'companyName'],
    ],
  },
  {
    id: 'safety_instruction_sheet',
    family: 'safety_instruction_sheet',
    hasSecondaryDocument: false,
    labels: {
      fr: 'Fiche d’instruction sécurité',
      nl: 'Veiligheidsinstructieblad',
      en: 'Safety Instruction Sheet',
      de: 'Sicherheitsanweisungsblatt',
    },
    requiredFieldGroups: [
      ['activitePoste', 'activite', 'machine', 'situation', 'instructionSubject'],
      ['machinesEquipements', 'equipement', 'equipment', 'tools', 'informationsComplementaires', 'context'],
    ],
  },
  {
    id: 'accident_or_incident_report',
    family: 'accident_or_incident_report',
    hasSecondaryDocument: true,
    labels: {
      fr: 'Rapport d’accident ou d’incident',
      nl: 'Ongevallen- of incidentenrapport',
      en: 'Accident or Incident Report',
      de: 'Unfall- oder Vorfallbericht',
    },
    requiredFieldGroups: [
      [
        'accidentsIncidents',
        'descriptionEvenement',
        'incidentDescription',
        'eventDescription',
        'informationsComplementaires',
        'context',
      ],
      ['siteLieuTravail', 'lieu', 'eventLocation'],
    ],
  },
];

const DOCUMENT_DEFINITIONS = [
  ...RISK_DOCUMENT_TYPES.map((label) => ({
    id: normalizeDocumentType(label),
    family: 'risk_assessment',
    hasSecondaryDocument: false,
    labels: {
      fr: label,
      nl: LANGUAGE_CONFIGS.nl.title,
      en: LANGUAGE_CONFIGS.en.title,
      de: LANGUAGE_CONFIGS.de.title,
    },
    requiredFields: REQUIRED_FORM_FIELDS,
  })),
  ...NEW_DOCUMENT_DEFINITIONS,
];

const DOCUMENT_DEFINITION_BY_TYPE = new Map(
  DOCUMENT_DEFINITIONS.flatMap((definition) =>
    [...Object.values(definition.labels), ...(definition.aliases || [])]
      .map((label) => [normalizeDocumentType(label), definition]),
  ),
);

const DOCUMENT_TEMPLATES = {
  annual_action_plan: {
    sections: {
      fr: [
        'Identification du document',
        'Contexte',
        'Sources utilisées',
        'Objectifs de prévention pour l’année',
        'Actions prioritaires',
        'Tableau du plan annuel d’action',
        'Ressources nécessaires',
        'Budget estimatif',
        'Indicateurs de suivi',
        'Modalités de suivi',
        'Points à valider',
        'Conclusion',
        'Mention de validation',
      ],
      nl: [
        'Identificatie van het document',
        'Context',
        'Gebruikte bronnen',
        'Preventiedoelstellingen voor het jaar',
        'Prioritaire acties',
        'Tabel van het jaaractieplan',
        'Benodigde middelen',
        'Budgetraming',
        'Opvolgingsindicatoren',
        'Opvolgingsmodaliteiten',
        'Te valideren punten',
        'Conclusie',
        'Validatievermelding',
      ],
      en: [
        'Document Identification',
        'Context',
        'Sources Used',
        'Prevention Objectives for the Year',
        'Priority Actions',
        'Annual Action Plan Table',
        'Required Resources',
        'Estimated Budget',
        'Follow-Up Indicators',
        'Follow-Up Arrangements',
        'Points to Validate',
        'Conclusion',
        'Validation Statement',
      ],
      de: [
        'Dokumentidentifikation',
        'Kontext',
        'Verwendete Quellen',
        'Präventionsziele für das Jahr',
        'Prioritäre Maßnahmen',
        'Tabelle des jährlichen Aktionsplans',
        'Erforderliche Ressourcen',
        'Geschätztes Budget',
        'Nachverfolgungsindikatoren',
        'Modalitäten der Nachverfolgung',
        'Zu validierende Punkte',
        'Schlussfolgerung',
        'Validierungshinweis',
      ],
    },
    tableColumns: {
      fr: 'N° d’action | Risque / thème | Mesure prévue | Objectif | Responsable | Service concerné | Échéance | Moyens nécessaires | Budget estimatif | Indicateur de réalisation | Statut | Commentaire',
      nl: 'Actienr. | Risico / thema | Geplande maatregel | Doel | Verantwoordelijke | Betrokken dienst | Termijn | Benodigde middelen | Budgetraming | Realisatie-indicator | Status | Opmerking',
      en: 'Action No. | Risk / Theme | Planned Measure | Objective | Responsible Person | Department Concerned | Deadline | Required Resources | Estimated Budget | Completion Indicator | Status | Comment',
      de: 'Maßnahmen-Nr. | Risiko / Thema | Geplante Maßnahme | Ziel | Verantwortliche Person | Betroffener Dienst | Frist | Erforderliche Mittel | Geschätztes Budget | Umsetzungsindikator | Status | Kommentar',
    },
  },
  five_year_global_prevention_plan: {
    sections: {
      fr: [
        'Identification du document',
        'Introduction',
        'Description de l’entreprise, du site ou du service',
        'Méthodologie',
        'Synthèse des risques prioritaires',
        'Objectifs à 5 ans',
        'Axes prioritaires',
        'Mesures structurelles prévues',
        'Planning pluriannuel',
        'Responsabilités',
        'Moyens humains, techniques et financiers',
        'Indicateurs de suivi',
        'Modalités d’évaluation annuelle',
        'Lien avec les plans annuels d’action',
        'Points à valider',
        'Conclusion',
        'Mention de validation',
      ],
      nl: [
        'Identificatie van het document',
        'Inleiding',
        'Beschrijving van de onderneming, site of dienst',
        'Methodologie',
        'Samenvatting van de prioritaire risico’s',
        'Doelstellingen over 5 jaar',
        'Prioritaire assen',
        'Geplande structurele maatregelen',
        'Meerjarenplanning',
        'Verantwoordelijkheden',
        'Menselijke, technische en financiële middelen',
        'Opvolgingsindicatoren',
        'Modaliteiten voor jaarlijkse evaluatie',
        'Verband met de jaaractieplannen',
        'Te valideren punten',
        'Conclusie',
        'Validatievermelding',
      ],
      en: [
        'Document Identification',
        'Introduction',
        'Company, Site or Department Description',
        'Methodology',
        'Summary of Priority Risks',
        'Five-Year Objectives',
        'Priority Areas',
        'Planned Structural Measures',
        'Multi-Year Schedule',
        'Responsibilities',
        'Human, Technical and Financial Resources',
        'Follow-Up Indicators',
        'Annual Evaluation Arrangements',
        'Link with Annual Action Plans',
        'Points to Validate',
        'Conclusion',
        'Validation Statement',
      ],
      de: [
        'Dokumentidentifikation',
        'Einleitung',
        'Beschreibung des Unternehmens, Standorts oder Dienstes',
        'Methodik',
        'Zusammenfassung der prioritären Risiken',
        'Ziele über 5 Jahre',
        'Prioritäre Handlungsachsen',
        'Geplante strukturelle Maßnahmen',
        'Mehrjahresplanung',
        'Verantwortlichkeiten',
        'Personelle, technische und finanzielle Mittel',
        'Nachverfolgungsindikatoren',
        'Modalitäten der jährlichen Bewertung',
        'Verbindung mit den jährlichen Aktionsplänen',
        'Zu validierende Punkte',
        'Schlussfolgerung',
        'Validierungshinweis',
      ],
    },
    tableColumns: {
      fr: 'Année | Objectif | Mesure structurelle | Responsable | Moyens nécessaires | Budget estimatif | Indicateur | Lien PAA | Point de validation',
      nl: 'Jaar | Doelstelling | Structurele maatregel | Verantwoordelijke | Benodigde middelen | Budgetraming | Indicator | Link JAP | Validatiepunt',
      en: 'Year | Objective | Structural Measure | Responsible Person | Required Resources | Estimated Budget | Indicator | AAP Link | Validation Point',
      de: 'Jahr | Ziel | Strukturelle Maßnahme | Verantwortliche Person | Erforderliche Mittel | Geschätztes Budget | Indikator | Bezug zum JAP | Validierungspunkt',
    },
  },
  safety_visit_report: {
    sections: {
      fr: [
        'Identification de la visite',
        'Date, heure et lieu',
        'Participants',
        'Objet de la visite',
        'Périmètre et zones visitées',
        'Constats positifs',
        'Écarts, anomalies ou non-conformités observés',
        'Risques observés',
        'Mesures immédiates déjà prises',
        'Recommandations',
        'Tableau d’actions',
        'Responsables',
        'Échéances',
        'Preuves attendues',
        'Suivi prévu',
        'Conclusion',
        'Points à valider',
        'Mention de validation',
      ],
      nl: [
        'Identificatie van het bezoek',
        'Datum, uur en plaats',
        'Deelnemers',
        'Doel van het bezoek',
        'Afbakening en bezochte zones',
        'Positieve vaststellingen',
        'Vastgestelde afwijkingen, anomalieën of non-conformiteiten',
        'Vastgestelde risico’s',
        'Reeds genomen onmiddellijke maatregelen',
        'Aanbevelingen',
        'Actietabel',
        'Verantwoordelijken',
        'Termijnen',
        'Verwachte bewijzen',
        'Geplande opvolging',
        'Conclusie',
        'Te valideren punten',
        'Validatievermelding',
      ],
      en: [
        'Visit Identification',
        'Date, Time and Location',
        'Participants',
        'Purpose of the Visit',
        'Scope and Areas Visited',
        'Positive Findings',
        'Observed Deviations, Anomalies or Non-Conformities',
        'Observed Risks',
        'Immediate Measures Already Taken',
        'Recommendations',
        'Action Table',
        'Responsible Persons',
        'Deadlines',
        'Expected Evidence',
        'Planned Follow-Up',
        'Conclusion',
        'Points to Validate',
        'Validation Statement',
      ],
      de: [
        'Identifikation der Begehung',
        'Datum, Uhrzeit und Ort',
        'Teilnehmende',
        'Zweck der Begehung',
        'Umfang und begangene Bereiche',
        'Positive Feststellungen',
        'Festgestellte Abweichungen, Auffälligkeiten oder Nichtkonformitäten',
        'Beobachtete Risiken',
        'Bereits getroffene Sofortmaßnahmen',
        'Empfehlungen',
        'Maßnahmentabelle',
        'Verantwortliche',
        'Fristen',
        'Erwartete Nachweise',
        'Geplante Nachverfolgung',
        'Schlussfolgerung',
        'Zu validierende Punkte',
        'Validierungshinweis',
      ],
    },
    tableColumns: {
      fr: 'N° | Constat / risque | Mesure recommandée | Responsable | Échéance | Preuve de suivi | Priorité | Statut | Commentaire',
      nl: 'Nr. | Vaststelling / risico | Aanbevolen maatregel | Verantwoordelijke | Termijn | Opvolgingsbewijs | Prioriteit | Status | Opmerking',
      en: 'No. | Finding / Risk | Recommended Measure | Responsible Person | Deadline | Follow-Up Evidence | Priority | Status | Comment',
      de: 'Nr. | Feststellung / Risiko | Empfohlene Maßnahme | Verantwortliche Person | Frist | Nachweis der Nachverfolgung | Priorität | Status | Kommentar',
    },
  },
  job_description_sheet: {
    sections: {
      fr: [
        'Identification du poste',
        'Service concerné',
        'Mission principale',
        'Tâches principales',
        'Environnement de travail',
        'Équipements et outils utilisés',
        'Produits utilisés le cas échéant',
        'Compétences et aptitudes requises',
        'Risques liés au poste',
        'Mesures de prévention',
        'EPI requis',
        'Formations et habilitations',
        'Consignes particulières',
        'Surveillance de santé et points à vérifier',
        'Restrictions ou adaptations éventuelles',
        'Validation et diffusion',
        'Mention de validation',
      ],
      nl: [
        'Identificatie van de functie',
        'Betrokken dienst',
        'Hoofdopdracht',
        'Belangrijkste taken',
        'Werkomgeving',
        'Gebruikte uitrusting en hulpmiddelen',
        'Gebruikte producten indien van toepassing',
        'Vereiste competenties en vaardigheden',
        'Risico’s verbonden aan de functie',
        'Preventiemaatregelen',
        'Vereiste PBM',
        'Opleidingen en bevoegdheden',
        'Bijzondere instructies',
        'Gezondheidstoezicht en te controleren punten',
        'Eventuele beperkingen of aanpassingen',
        'Validatie en verspreiding',
        'Validatievermelding',
      ],
      en: [
        'Job Identification',
        'Department Concerned',
        'Main Mission',
        'Main Tasks',
        'Work Environment',
        'Equipment and Tools Used',
        'Products Used Where Applicable',
        'Required Skills and Aptitudes',
        'Job-Related Risks',
        'Prevention Measures',
        'Required PPE',
        'Training and Authorisations',
        'Specific Instructions',
        'Health Surveillance and Points to Check',
        'Possible Restrictions or Adaptations',
        'Validation and Distribution',
        'Validation Statement',
      ],
      de: [
        'Identifikation der Stelle',
        'Betroffener Dienst',
        'Hauptaufgabe',
        'Wichtigste Tätigkeiten',
        'Arbeitsumgebung',
        'Verwendete Ausrüstung und Werkzeuge',
        'Verwendete Produkte, falls zutreffend',
        'Erforderliche Kompetenzen und Fähigkeiten',
        'Stellenbezogene Risiken',
        'Präventionsmaßnahmen',
        'Erforderliche PSA',
        'Schulungen und Befähigungen',
        'Besondere Anweisungen',
        'Gesundheitsüberwachung und zu prüfende Punkte',
        'Mögliche Einschränkungen oder Anpassungen',
        'Validierung und Verteilung',
        'Validierungshinweis',
      ],
    },
  },
  safety_instruction_sheet: {
    sections: {
      fr: [
        'Identification de l’activité, de la machine ou de la situation',
        'Objectif de la consigne',
        'Dangers principaux',
        'Équipements de protection individuelle requis',
        'Vérifications avant utilisation ou intervention',
        'Consignes pendant l’activité',
        'Consignes après l’activité',
        'Interdictions',
        'Conduite à tenir en cas d’anomalie',
        'Conduite à tenir en cas d’accident, d’incendie ou d’urgence',
        'Personnes de contact',
        'Diffusion, formation et preuve de communication',
        'Points à valider',
        'Mention de validation',
      ],
      nl: [
        'Identificatie van de activiteit, machine of situatie',
        'Doel van de instructie',
        'Belangrijkste gevaren',
        'Vereiste persoonlijke beschermingsmiddelen',
        'Controles vóór gebruik of interventie',
        'Instructies tijdens de activiteit',
        'Instructies na de activiteit',
        'Verboden handelingen',
        'Te volgen stappen bij een afwijking',
        'Te volgen stappen bij ongeval, brand of noodsituatie',
        'Contactpersonen',
        'Verspreiding, opleiding en bewijs van communicatie',
        'Te valideren punten',
        'Validatievermelding',
      ],
      en: [
        'Identification of the Activity, Machine or Situation',
        'Purpose of the Instruction',
        'Main Hazards',
        'Required Personal Protective Equipment',
        'Checks Before Use or Intervention',
        'Instructions During the Activity',
        'Instructions After the Activity',
        'Prohibited Actions',
        'Actions in Case of Anomaly',
        'Actions in Case of Accident, Fire or Emergency',
        'Contact Persons',
        'Distribution, Training and Proof of Communication',
        'Points to Validate',
        'Validation Statement',
      ],
      de: [
        'Identifikation der Tätigkeit, Maschine oder Situation',
        'Ziel der Anweisung',
        'Hauptgefahren',
        'Erforderliche persönliche Schutzausrüstung',
        'Prüfungen vor Benutzung oder Eingriff',
        'Anweisungen während der Tätigkeit',
        'Anweisungen nach der Tätigkeit',
        'Verbote',
        'Vorgehen bei Auffälligkeiten',
        'Vorgehen bei Unfall, Brand oder Notfall',
        'Kontaktpersonen',
        'Verteilung, Schulung und Kommunikationsnachweis',
        'Zu validierende Punkte',
        'Validierungshinweis',
      ],
    },
  },
  accident_or_incident_report: {
    sections: {
      fr: [
        'Identification du dossier',
        'Date, heure et lieu',
        'Type d’événement',
        'Personnes concernées',
        'Témoins',
        'Description factuelle de l’événement',
        'Conséquences observées',
        'Mesures immédiates',
        'Causes probables',
        'Causes immédiates',
        'Causes profondes ou organisationnelles',
        'Actions correctives',
        'Actions préventives',
        'Responsables',
        'Échéances',
        'Suivi prévu',
        'Documents et preuves',
        'Déclarations et validations à vérifier',
        'Conclusion',
        'Mention de validation',
      ],
      nl: [
        'Identificatie van het dossier',
        'Datum, uur en plaats',
        'Type gebeurtenis',
        'Betrokken personen',
        'Getuigen',
        'Feitelijke beschrijving van de gebeurtenis',
        'Vastgestelde gevolgen',
        'Onmiddellijke maatregelen',
        'Waarschijnlijke oorzaken',
        'Directe oorzaken',
        'Diepere of organisatorische oorzaken',
        'Corrigerende acties',
        'Preventieve acties',
        'Verantwoordelijken',
        'Termijnen',
        'Geplande opvolging',
        'Documenten en bewijzen',
        'Te controleren aangiften en validaties',
        'Conclusie',
        'Validatievermelding',
      ],
      en: [
        'File Identification',
        'Date, Time and Location',
        'Type of Event',
        'Persons Concerned',
        'Witnesses',
        'Factual Description of the Event',
        'Observed Consequences',
        'Immediate Measures',
        'Probable Causes',
        'Immediate Causes',
        'Root or Organisational Causes',
        'Corrective Actions',
        'Preventive Actions',
        'Responsible Persons',
        'Deadlines',
        'Planned Follow-Up',
        'Documents and Evidence',
        'Declarations and Validations to Check',
        'Conclusion',
        'Validation Statement',
      ],
      de: [
        'Identifikation der Akte',
        'Datum, Uhrzeit und Ort',
        'Art des Ereignisses',
        'Betroffene Personen',
        'Zeugen',
        'Sachliche Beschreibung des Ereignisses',
        'Festgestellte Folgen',
        'Sofortmaßnahmen',
        'Wahrscheinliche Ursachen',
        'Unmittelbare Ursachen',
        'Grundlegende oder organisatorische Ursachen',
        'Korrekturmaßnahmen',
        'Präventive Maßnahmen',
        'Verantwortliche',
        'Fristen',
        'Geplante Nachverfolgung',
        'Dokumente und Nachweise',
        'Zu prüfende Meldungen und Validierungen',
        'Schlussfolgerung',
        'Validierungshinweis',
      ],
    },
    tableColumns: {
      fr: 'N° | Cause / constat | Action corrective ou préventive | Responsable | Échéance | Preuve attendue | Statut | Commentaire',
      nl: 'Nr. | Oorzaak / vaststelling | Corrigerende of preventieve actie | Verantwoordelijke | Termijn | Verwacht bewijs | Status | Opmerking',
      en: 'No. | Cause / Finding | Corrective or Preventive Action | Responsible Person | Deadline | Expected Evidence | Status | Comment',
      de: 'Nr. | Ursache / Feststellung | Korrektur- oder Präventivmaßnahme | Verantwortliche Person | Frist | Erwarteter Nachweis | Status | Kommentar',
    },
  },
};

const PROMPT_LOCALIZATION = {
  fr: {
    secondaryInstruction: (title) =>
      `Après le document principal, ajoute exactement la ligne ${SECONDARY_DOCUMENT_SEPARATOR}, puis un document complémentaire intitulé "# ${title}" contenant un tableau de suivi des actions dans la langue cible.`,
    noSecondaryInstruction: 'Ne produis pas de document complémentaire séparé.',
    annualRows: 'Le tableau des actions prioritaires doit contenir au moins 6 lignes réalistes.',
    defaultRows: 'Le tableau d’actions ou de planning doit contenir au moins 4 lignes réalistes.',
    columnsPrefix: 'Utilise exactement ces colonnes Markdown dans la langue cible',
    flexibleStructure:
      'Utilise des listes structurées ou des tableaux Markdown lorsque cela rend le document plus exploitable.',
  },
  nl: {
    secondaryInstruction: (title) =>
      `Voeg na het hoofddocument exact de regel ${SECONDARY_DOCUMENT_SEPARATOR} toe, gevolgd door een aanvullend document met de titel "# ${title}" en een actietabel voor opvolging in de doeltaal.`,
    noSecondaryInstruction: 'Maak geen afzonderlijk aanvullend document.',
    annualRows: 'De tabel met prioritaire acties moet minstens 6 realistische regels bevatten.',
    defaultRows: 'De actie- of planningstabel moet minstens 4 realistische regels bevatten.',
    columnsPrefix: 'Gebruik exact deze Markdown-kolommen in de doeltaal',
    flexibleStructure:
      'Gebruik gestructureerde lijsten of Markdown-tabellen wanneer dit het document bruikbaarder maakt.',
  },
  en: {
    secondaryInstruction: (title) =>
      `After the main document, add exactly the line ${SECONDARY_DOCUMENT_SEPARATOR}, then a complementary document titled "# ${title}" containing an action follow-up table in the target language.`,
    noSecondaryInstruction: 'Do not produce a separate complementary document.',
    annualRows: 'The priority actions table must contain at least 6 realistic rows.',
    defaultRows: 'The action or schedule table must contain at least 4 realistic rows.',
    columnsPrefix: 'Use exactly these Markdown columns in the target language',
    flexibleStructure:
      'Use structured lists or Markdown tables when this makes the document more usable.',
  },
  de: {
    secondaryInstruction: (title) =>
      `Fügen Sie nach dem Hauptdokument exakt die Zeile ${SECONDARY_DOCUMENT_SEPARATOR} hinzu, gefolgt von einem ergänzenden Dokument mit dem Titel "# ${title}" und einer Tabelle zur Maßnahmenverfolgung in der Zielsprache.`,
    noSecondaryInstruction: 'Erstellen Sie kein separates ergänzendes Dokument.',
    annualRows: 'Die Tabelle der prioritären Maßnahmen muss mindestens 6 realistische Zeilen enthalten.',
    defaultRows: 'Die Maßnahmen- oder Planungstabelle muss mindestens 4 realistische Zeilen enthalten.',
    columnsPrefix: 'Verwenden Sie exakt diese Markdown-Spalten in der Zielsprache',
    flexibleStructure:
      'Verwenden Sie strukturierte Listen oder Markdown-Tabellen, wenn dies das Dokument besser nutzbar macht.',
  },
};

const app = express();

app.set('trust proxy', 1);
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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
  }),
);
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
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

app.get('/legal', (_req, res) => {
  res.type('html').send(renderLegalIndexPage());
});

app.get('/legal/terms', (_req, res) => {
  res.type('html').send(renderLegalPage({
    title: 'Conditions d’utilisation — PreventIA Belgique',
    sections: [
      {
        items: [
          'PreventIA Belgique est une application d’aide à la génération de documents de prévention, rapports, plans d’action et analyses de risques.',
          'Les documents générés sont des projets de travail.',
          'Ils doivent être vérifiés, adaptés et validés par l’utilisateur, le conseiller en prévention, l’employeur ou toute personne compétente avant utilisation officielle.',
          'PreventIA ne remplace pas un conseiller en prévention, un service SIPPT/SEPPT, un expert technique, un avocat ou une autorité compétente.',
          'L’utilisateur reste responsable des informations saisies, de la vérification terrain, des preuves, photos, documents annexes et validations internes.',
          'L’abonnement est personnel : 1 licence = 1 adresse e-mail + 1 mot de passe.',
          'Une licence peut être utilisée sur plusieurs appareils autorisés.',
          'La licence principale coûte 79 €/mois ou 790 €/an.',
          'Une licence supplémentaire coûte 39 €/mois ou 390 €/an.',
          'L’accès peut être suspendu en cas d’abus, fraude, partage non autorisé de compte, non-paiement ou usage contraire aux présentes conditions.',
          'Les prix sont exprimés hors TVA sauf mention contraire.',
          'Les documents générés peuvent contenir des erreurs ou nécessiter adaptation.',
          'L’utilisateur doit respecter les lois applicables, notamment en matière de bien-être au travail, sécurité, prévention et protection des données.',
          'Droit applicable : Belgique.',
          'Contact : vilevero@gmail.com.',
        ],
      },
    ],
  }));
});

app.get('/legal/privacy', (_req, res) => {
  res.type('html').send(renderLegalPage({
    title: 'Politique de confidentialité — PreventIA Belgique',
    sections: [
      {
        heading: 'Responsable du traitement',
        paragraphs: [
          'PreventIA Belgique / Vincent Legrand',
          'Contact : vilevero@gmail.com',
        ],
      },
      {
        heading: 'Données collectées',
        items: [
          'prénom',
          'nom',
          'entreprise',
          'numéro de TVA',
          'adresse de facturation',
          'code postal',
          'ville',
          'pays',
          'adresse e-mail',
          'mot de passe hashé, jamais le mot de passe en clair',
          'type d’abonnement',
          'statut de licence',
          'quotas utilisés',
          'appareils activés : deviceId généré par l’application, plateforme, version app, date d’activation',
          'données nécessaires au paiement gérées par Stripe',
          'contenu fourni volontairement pour générer les documents',
        ],
      },
      {
        heading: 'Finalités',
        items: [
          'création et gestion du compte',
          'gestion de la licence',
          'authentification',
          'paiement et facturation',
          'respect des obligations comptables et fiscales',
          'facturation électronique B2B',
          'génération des documents demandés',
          'sécurité, prévention des abus et support technique',
        ],
      },
      {
        heading: 'Bases légales',
        items: [
          'exécution du contrat',
          'obligation légale pour la facturation et comptabilité',
          'intérêt légitime pour la sécurité et la prévention des abus',
          'consentement lorsque requis',
        ],
      },
      {
        heading: 'Sous-traitants',
        items: [
          'Stripe pour les paiements',
          'Render pour l’hébergement backend',
          'OpenAI pour la génération assistée des contenus si utilisé',
          'éventuels services techniques nécessaires au fonctionnement de l’application',
        ],
      },
      {
        heading: 'Paiement',
        paragraphs: [
          'PreventIA ne stocke pas les données de carte bancaire. Les paiements sont traités par Stripe.',
        ],
      },
      {
        heading: 'Conservation',
        items: [
          'données de compte conservées pendant la durée de la relation contractuelle',
          'données de facturation conservées selon les obligations légales applicables',
          'données d’appareils conservées tant que la licence est active ou jusqu’à déconnexion/suppression',
          'contenus de génération conservés uniquement si nécessaire au fonctionnement, support ou historique selon l’implémentation',
        ],
      },
      {
        heading: 'Droits',
        items: [
          'accès',
          'rectification',
          'effacement',
          'limitation',
          'opposition',
          'portabilité',
          'réclamation auprès de l’Autorité de protection des données belge',
        ],
      },
      {
        heading: 'Sécurité',
        items: [
          'mots de passe hashés',
          'tokens de session',
          'limitation des données collectées',
          'pas d’adresse MAC, IMEI, numéro de série matériel ou fingerprint intrusif',
        ],
      },
      {
        heading: 'Contact RGPD',
        paragraphs: [
          'vilevero@gmail.com',
        ],
      },
    ],
  }));
});

app.get('/legal/cancellation', (_req, res) => {
  res.type('html').send(renderLegalPage({
    title: 'Annulation et remboursement — PreventIA Belgique',
    sections: [
      {
        items: [
          'Les abonnements sont mensuels ou annuels.',
          'L’utilisateur peut demander l’annulation de son abonnement.',
          'L’accès reste actif jusqu’à la fin de la période déjà payée, sauf cas particulier.',
          'Les paiements déjà effectués ne sont pas automatiquement remboursés, sauf erreur technique, double paiement, obligation légale ou décision commerciale.',
          'Pour toute demande : vilevero@gmail.com.',
          'Les entreprises sont invitées à vérifier leur choix d’abonnement avant paiement.',
          'Les licences supplémentaires sont liées à une adresse e-mail personnelle distincte.',
        ],
      },
    ],
  }));
});

app.get('/api/billing/plans', (_req, res) => {
  res.json({
    success: true,
    plans: getPublicBillingPlans(),
  });
});

app.post('/api/billing/create-checkout-session', async (req, res, next) => {
  try {
    const validation = await validateCheckoutPayload(req.body || {});
    if (!validation.ok) {
      return res.json({
        success: false,
        error: validation.error,
      });
    }

    const stripeAvailability = getStripeAvailability();
    if (!stripeAvailability.ok) {
      return res.json({
        success: false,
        error: stripeAvailability.error,
      });
    }

    const session = await createStripeCheckoutSession(validation.normalized, stripeAvailability.stripe);
    return res.json({
      success: true,
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error('[billing] create checkout session failed', {
      message: error.message,
      type: error.type,
      code: error.code,
      param: error.param,
      raw: error.raw?.message,
    });
    next(error);
  }
});

app.post('/api/billing/create-portal-session', async (req, res, next) => {
  try {
    const stripeAvailability = getStripeAvailability();
    if (!stripeAvailability.ok) {
      return res.json({
        success: false,
        error: stripeAvailability.error,
      });
    }

    const validation = await validateUserLicenseFromRequest(req);
    if (!validation.ok) {
      return res.json({
        success: false,
        error: validation.error,
      });
    }

    if (!validation.userLicense.stripeCustomerId) {
      return res.json({
        success: false,
        error: 'Aucun client Stripe associé à cette licence.',
      });
    }

    const portalSession = await stripeAvailability.stripe.billingPortal.sessions.create({
      customer: validation.userLicense.stripeCustomerId,
      return_url: getBillingReturnUrl(),
    });

    return res.json({
      success: true,
      portalUrl: portalSession.url,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/licenses/create', (req, res, next) => {
  try {
    const configuredSecret = process.env.ADMIN_LICENSE_SECRET;

    if (!configuredSecret) {
      return res.status(403).json({
        success: false,
        error: 'ADMIN_LICENSE_SECRET n’est pas défini côté serveur.',
      });
    }

    if (req.get('x-admin-secret') !== configuredSecret) {
      return res.status(403).json({
        success: false,
        error: 'Secret administrateur invalide.',
      });
    }

    const store = loadLicenses();
    const license = createLicenseRecord(req.body || {});
    store.licenses.push(license);
    saveLicenses(store);

    return res.json({
      success: true,
      license: {
        licenseKey: license.licenseKey,
        companyName: license.companyName,
        plan: license.plan,
        status: license.status,
        endDate: license.endDate,
        maxDevices: license.maxDevices,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/licenses/activate', (req, res) => {
  const { licenseKey, deviceId, deviceName, platform, appVersion } = req.body || {};
  const validation = validateLicenseAccess({
    licenseKey,
    deviceId,
    registerDevice: true,
    deviceInfo: { deviceName, platform, appVersion },
  });

  if (!validation.ok) {
    return res.json({
      success: false,
      error: validation.error,
    });
  }

  return res.json({
    success: true,
    licenseStatus: licenseStatusPayload(validation.license),
  });
});

app.post('/api/licenses/status', (req, res) => {
  const { licenseKey, deviceId } = req.body || {};
  const validation = validateLicenseAccess({ licenseKey, deviceId });

  if (!validation.ok) {
    return res.json({
      success: false,
      error: validation.error,
    });
  }

  return res.json({
    success: true,
    licenseStatus: licenseStatusPayload(validation.license),
  });
});

app.post('/api/licenses/deactivate-device', (req, res) => {
  const { licenseKey, deviceId } = req.body || {};
  const store = loadLicenses();
  const license = store.licenses.find((item) => normalizeLicenseKey(item.licenseKey) === normalizeLicenseKey(licenseKey));

  if (!license) {
    return res.json({
      success: false,
      error: 'Licence requise ou invalide.',
    });
  }

  const normalizedDeviceId = normalizeDeviceId(deviceId);
  license.activatedDevices = ensureArray(license.activatedDevices)
    .filter((device) => normalizeDeviceId(device.deviceId) !== normalizedDeviceId);
  license.updatedAt = new Date().toISOString();
  saveLicenses(store);

  return res.json({
    success: true,
    licenseStatus: licenseStatusPayload(license),
  });
});

app.post('/api/licenses/validate-generation', (req, res) => {
  const { licenseKey, deviceId, documentType } = req.body || {};
  const validation = validateLicenseAccess({ licenseKey, deviceId, documentType });

  if (!validation.ok) {
    return res.json({
      success: false,
      canGenerate: false,
      error: validation.error,
    });
  }

  return res.json({
    success: true,
    canGenerate: true,
  });
});

app.post('/api/auth/register-license', async (req, res, next) => {
  try {
    const configuredSecret = process.env.ADMIN_LICENSE_SECRET;

    if (!configuredSecret) {
      return res.json({
        success: false,
        error: 'ADMIN_LICENSE_SECRET est obligatoire pour créer une licence.',
      });
    }

    if (req.get('x-admin-secret') !== configuredSecret) {
      return res.json({
        success: false,
        error: 'Secret administrateur invalide.',
      });
    }

    ensureJwtSecretAvailable();

    const payload = req.body || {};
    const email = normalizeEmail(payload.email);

    if (!email || !isValidEmail(email)) {
      return res.json({
        success: false,
        error: 'Email obligatoire et valide requis.',
      });
    }

    if (typeof payload.password !== 'string' || payload.password.length < 8) {
      return res.json({
        success: false,
        error: 'Mot de passe obligatoire de minimum 8 caractères.',
      });
    }

    await licenseStoreReady;
    if (await licenseStore.findByEmail(email)) {
      return res.json({
        success: false,
        error: 'Une licence existe déjà pour cet email.',
      });
    }

    if (payload.plan !== 'pro') {
      return res.json({
        success: false,
        error: 'Plan invalide. Seul le plan pro est disponible.',
      });
    }

    if (!['primary', 'additional'].includes(payload.licenseType)) {
      return res.json({
        success: false,
        error: 'licenseType obligatoire: primary ou additional.',
      });
    }

    if (!['monthly', 'yearly'].includes(payload.billingCycle)) {
      return res.json({
        success: false,
        error: 'billingCycle obligatoire: monthly ou yearly.',
      });
    }

    if (!isValidIsoDate(payload.endDate)) {
      return res.json({
        success: false,
        error: 'endDate obligatoire au format YYYY-MM-DD.',
      });
    }

    const defaults = getPlanDefaults(payload.plan, payload.licenseType, payload.billingCycle);
    const now = new Date().toISOString();
    const userLicense = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(payload.password),
      plan: 'pro',
      licenseType: payload.licenseType,
      billingCycle: payload.billingCycle,
      price: defaults.price,
      currency: 'EUR',
      status: 'active',
      startDate: formatIsoDate(new Date()),
      endDate: payload.endDate,
      maxDevices: Number(payload.maxDevices ?? defaults.maxDevices),
      activatedDevices: [],
      monthlySimpleDocumentsLimit: Number(payload.monthlySimpleDocumentsLimit ?? defaults.monthlySimpleDocumentsLimit),
      monthlyRiskAnalysisLimit: Number(payload.monthlyRiskAnalysisLimit ?? defaults.monthlyRiskAnalysisLimit),
      usedSimpleDocumentsThisMonth: 0,
      usedRiskAnalysisThisMonth: 0,
      currentPeriod: getCurrentPeriod(),
      allowedFeatures: [...defaults.allowedFeatures],
      createdAt: now,
      updatedAt: now,
    };

    const createdLicense = await licenseStore.create(userLicense);
    if (!createdLicense) {
      return res.json({ success: false, error: 'Une licence existe déjà pour cet email.' });
    }

    return res.json({
      success: true,
      userLicense: publicRegisteredUserLicensePayload(createdLicense),
    });
  } catch (error) {
    if (error.isAuthConfigurationError) {
      return res.json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
});

app.post('/api/auth/admin-reset-password', async (req, res, next) => {
  try {
    const configuredSecret = process.env.ADMIN_LICENSE_SECRET;

    if (!configuredSecret) {
      return res.json({
        success: false,
        error: 'ADMIN_LICENSE_SECRET est obligatoire pour réinitialiser un mot de passe.',
      });
    }

    if (req.get('x-admin-secret') !== configuredSecret) {
      return res.json({
        success: false,
        error: 'Secret administrateur invalide.',
      });
    }

    const payload = req.body || {};
    const email = normalizeEmail(payload.email);

    if (!email || !isValidEmail(email)) {
      return res.json({
        success: false,
        error: 'Email obligatoire et valide requis.',
      });
    }

    if (typeof payload.newPassword !== 'string' || payload.newPassword.length < 8) {
      return res.json({
        success: false,
        error: 'Nouveau mot de passe obligatoire de minimum 8 caractères.',
      });
    }

    await licenseStoreReady;
    const userLicense = await licenseStore.findByEmail(email);

    if (!userLicense) {
      return res.json({
        success: false,
        error: 'Licence utilisateur introuvable.',
      });
    }

    await licenseStore.resetPassword(email, await hashPassword(payload.newPassword));

    return res.json({
      success: true,
      message: 'Mot de passe réinitialisé.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    ensureJwtSecretAvailable();

    const { email, password, deviceId, deviceName, platform, appVersion } = req.body || {};
    await licenseStoreReady;
    let userLicense = await licenseStore.findByEmail(email);

    if (!userLicense) {
      return res.json({
        success: false,
        error: 'Email ou mot de passe incorrect.',
      });
    }

    if (!(await verifyPassword(password, userLicense.passwordHash))) {
      return res.json({
        success: false,
        error: 'Email ou mot de passe incorrect.',
      });
    }

    const activeError = getLicenseActiveError(userLicense);
    if (activeError) {
      return res.json({
        success: false,
        error: activeError,
      });
    }

    const registration = await licenseStore.addDevice(userLicense, { deviceId, deviceName, platform, appVersion });
    if (!registration.ok) {
      return res.json({
        success: false,
        error: registration.error,
      });
    }

    userLicense = registration.license || userLicense;
    if (resetMonthlyUsageIfNeeded(userLicense)) {
      userLicense = await licenseStore.save(userLicense);
    }

    return res.json({
      success: true,
      token: generateAuthToken(userLicense),
      licenseStatus: userLicenseStatusPayload(userLicense),
    });
  } catch (error) {
    if (error.isAuthConfigurationError) {
      return res.json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const validation = await validateUserLicenseFromRequest(req);

    if (!validation.ok) {
      return res.json({
        success: false,
        error: validation.error,
      });
    }

    return res.json({
      success: true,
      licenseStatus: userLicenseStatusPayload(validation.userLicense),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout-device', async (req, res, next) => {
  try {
    const validation = await validateUserLicenseFromRequest(req);

    if (!validation.ok) {
      return res.json({
        success: false,
        error: validation.error,
      });
    }

    const normalizedDeviceId = normalizeDeviceId(req.body?.deviceId);
    if (!normalizedDeviceId) {
      return res.json({
        success: false,
        error: 'Identifiant appareil requis.',
      });
    }

    const updatedLicense = await licenseStore.removeDevice(validation.userLicense.id, normalizedDeviceId);

    return res.json({
      success: true,
      licenseStatus: userLicenseStatusPayload(updatedLicense),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/validate-generation', async (req, res, next) => {
  try {
    const validation = await validateUserGenerationAccess(req, {
      deviceId: req.body?.deviceId,
      documentType: req.body?.documentType,
    });

    if (!validation.ok) {
      return res.json({
        success: false,
        canGenerate: false,
        error: validation.error,
      });
    }

    return res.json({
      success: true,
      canGenerate: true,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-document', async (req, res, next) => {
  try {
    console.log('[RISK_RENDER_TRACE] route generate-document');
    const { documentType, formData, language, languageLabel, licenseKey, deviceId } = req.body || {};
    const documentDefinition = validateGenerateDocumentPayload(documentType, formData);
    const targetLanguage = resolveTargetLanguage(language, languageLabel, formData);
    let licenseValidation = null;
    let userLicenseValidation = null;
    const bearerToken = getBearerTokenFromRequest(req);

    if (bearerToken) {
      userLicenseValidation = await validateUserGenerationAccess(req, { deviceId, documentType });
      if (!userLicenseValidation.ok) {
        return res.json({
          success: false,
          error: userLicenseValidation.error || 'Connexion requise.',
        });
      }
    } else if (licenseKey && deviceId) {
      licenseValidation = validateLicenseAccess({ licenseKey, deviceId, documentType });
      if (!licenseValidation.ok) {
        return res.json({
          success: false,
          error: licenseValidation.error || 'Licence requise ou invalide.',
        });
      }
    } else if (!isUnlicensedGenerationAllowed()) {
      return res.json({
        success: false,
        error: 'Connexion requise.',
      });
    }

    const isInternalEmergencyPlan = documentDefinition.family === 'internal_emergency_plan';
    const isElectricalBtHtRiskAssessment = documentDefinition.family === 'electrical_bt_ht_risk_assessment';
    const isElevatorRiskAssessment = documentDefinition.family === 'elevator_risk_assessment';
    const isDeterministicDocument = isInternalEmergencyPlan ||
      isElectricalBtHtRiskAssessment ||
      isElevatorRiskAssessment;

    if (!isDeterministicDocument && !process.env.OPENAI_API_KEY) {
      const error = new Error('Configuration OpenAI manquante côté serveur.');
      error.status = 500;
      error.expose = true;
      throw error;
    }

    const openai = isDeterministicDocument
      ? null
      : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.info('Demande de génération reçue', {
      documentType,
      language: targetLanguage.code,
      formFields: Object.keys(formData).length,
    });

    let generatedDocument;

    if (isInternalEmergencyPlan) {
      generatedDocument = {
        document: renderInternalEmergencyPlanMarkdown(formData, language || targetLanguage.code),
        complementaryDocument: null,
      };
    } else if (isElectricalBtHtRiskAssessment) {
      generatedDocument = {
        document: renderElectricalBtHtRiskAssessmentMarkdown(formData, language || targetLanguage.code),
        complementaryDocument: null,
      };
    } else if (isElevatorRiskAssessment) {
      generatedDocument = {
        document: renderElevatorRiskAssessmentMarkdown(formData, language || targetLanguage.code),
        complementaryDocument: null,
      };
    } else if (documentDefinition.family === 'risk_assessment') {
      console.log('[RISK_RENDER_TRACE] using function: generateRiskAssessmentFast');
      const generatedRiskAssessment = await generateRiskAssessmentFast({
        openai,
        documentType,
        formData,
        languageCode: targetLanguage.code,
        languageLabel: targetLanguage.label,
      });
      const reference = generatedRiskAssessment.reference;
      const structuredData = ensureCompleteRiskAssessmentData(
        generatedRiskAssessment.structuredData,
        documentType,
        targetLanguage.code,
        formData,
      );

      console.log('[RISK_RENDER_TRACE] using function: renderRiskAssessmentFinalMarkdown');
      let markdown = renderRiskAssessmentFinalMarkdown(
        structuredData,
        targetLanguage.code,
      );
      console.log('[RISK_RENDER_TRACE] using function: finalizeRiskAssessmentMarkdown');
      let cleaned = finalizeRiskAssessmentMarkdown(markdown, targetLanguage.code, reference);

      try {
        assertRiskAssessmentMarkdownIsValid(cleaned, targetLanguage.code);
      } catch (validationError) {
        console.error('[RISK_RENDER_TRACE] validation failed before retry', {
          message: validationError.message,
        });
        cleaned = finalizeRiskAssessmentMarkdown(cleaned, targetLanguage.code, reference);
        try {
          assertRiskAssessmentMarkdownIsValid(cleaned, targetLanguage.code);
        } catch (retryError) {
          console.error('[RISK_RENDER_TRACE] validation failed after retry', {
            message: retryError.message,
          });
          return res.json({
            success: false,
            message: 'Le document n’a pas été exporté car la structure finale n’est pas valide.',
          });
        }
      }

      console.log('[RISK_RENDER_TRACE] final markdown preview:', cleaned.slice(0, 1500));
      generatedDocument = {
        document: cleaned,
        complementaryDocument: null,
      };
    } else {
      generatedDocument = processGeneratedDocument(
        (await openai.responses.create({
          model: OPENAI_MODEL,
          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
          instructions: SYSTEM_PROMPT,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: buildUserPrompt(
                    documentType,
                    formData,
                    targetLanguage.code,
                    targetLanguage.label,
                    documentDefinition,
                  ),
                },
              ],
            },
          ],
        })).output_text?.trim(),
        documentDefinition,
        targetLanguage.code,
      );
    }
    const { document, complementaryDocument } = generatedDocument;

    if (!document) {
      const error = new Error('La génération du document n’a pas produit de contenu.');
      error.status = 502;
      throw error;
    }

    if (licenseValidation?.license && licenseValidation?.store) {
      incrementUsage(licenseValidation.license, documentType);
      saveLicenses(licenseValidation.store);
    }
    if (userLicenseValidation?.userLicense) {
      incrementUsage(userLicenseValidation.userLicense, documentType);
      await licenseStore.save(userLicenseValidation.userLicense);
    }

    res.json({
      success: true,
      source: isDeterministicDocument ? 'deterministic_backend' : 'ai_backend',
      documentType: documentDefinition.labels[targetLanguage.code] || documentType,
      document,
      ...(complementaryDocument ? { complementaryDocument } : {}),
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

async function startServer() {
  await licenseStoreReady;
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
} else if (process.env.PREVENTIA_BACKEND_NO_START === '1') {
  console.info('preventia-backend importé sans démarrage serveur.');
} else {
  startServer().catch((error) => {
    console.error('Impossible d’initialiser le stockage des licences.', { message: error.message });
    process.exitCode = 1;
  });
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

  const documentDefinition = getDocumentDefinition(documentType);

  if (!documentDefinition) {
    const supportedTypes = DOCUMENT_DEFINITIONS.map((definition) => definition.labels.fr).join(', ');
    const error = new Error(
      `documentType inconnu: ${documentType}. Types supportés: ${supportedTypes}`,
    );
    error.status = 400;
    error.expose = true;
    throw error;
  }

  validateRequiredFields(documentDefinition, formData);

  return documentDefinition;
}

function getDocumentDefinition(documentType) {
  return DOCUMENT_DEFINITION_BY_TYPE.get(normalizeDocumentType(documentType));
}

function normalizeDocumentType(documentType) {
  return String(documentType || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function validateRequiredFields(documentDefinition, formData) {
  const missingFields = (documentDefinition.requiredFields || []).filter(
    (field) => typeof formData[field] !== 'string',
  );

  const missingGroups = (documentDefinition.requiredFieldGroups || []).filter(
    (group) => !group.some((field) => hasUsableStringValue(formData[field])),
  );

  if (missingFields.length === 0 && missingGroups.length === 0) {
    return;
  }

  const missingGroupLabels = missingGroups.map((group) => group.join(' ou '));
  const missingLabels = [...missingFields, ...missingGroupLabels];
  const error = new Error(`Champs formData manquants ou invalides: ${missingLabels.join(', ')}`);
  error.status = 400;
  throw error;
}

function hasUsableStringValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

const SIMPLE_PREVENTION_DOCUMENT_TYPES = [
  'Plan Interne d’Urgence',
  'PIU',
  'Plan d’urgence interne',
  'internal_emergency_plan',
  'Plan annuel d’action',
  'Plan global de prévention',
  'Rapport de visite sécurité',
  'Fiche de poste',
  'Fiche d’instruction sécurité',
  'Rapport d’accident ou d’incident',
];

const RISK_ANALYSIS_DOCUMENT_TYPES = [
  'Analyse de risques — Ascenseur',
  'Analyse de risques ascenseur',
  'Analyse ascenseur',
  'Ascenseur',
  'risk_assessment_elevator',
  'elevator_risk_assessment',
  'risk_assessment_electrical_bt_ht',
  'Analyse de risques générale',
  'Analyse de risques incendie et évacuation',
  'Analyse de risques produits chimiques',
  'Analyse de risques machines et équipements',
  'Analyse de risques ergonomie',
  'Analyse de risques manutention manuelle',
  'Analyse de risques travail en hauteur',
  'Analyse de risques travail isolé',
  'Analyse de risques psychosociaux',
  'Analyse de risques maternité',
  'Analyse de risques jeunes travailleurs',
  'Analyse de risques intérimaires',
];

const LICENSE_PLAN_DEFAULTS = {
  documents: {
    maxDevices: 2,
    monthlySimpleDocumentsLimit: 100,
    monthlyRiskAnalysisLimit: 0,
    allowedFeatures: ['documents'],
  },
  risks: {
    maxDevices: 2,
    monthlySimpleDocumentsLimit: 0,
    monthlyRiskAnalysisLimit: 40,
    allowedFeatures: ['riskAnalysis'],
  },
  pro: {
    maxDevices: 3,
    monthlySimpleDocumentsLimit: 100,
    monthlyRiskAnalysisLimit: 40,
    allowedFeatures: ['documents', 'riskAnalysis'],
  },
  enterprise: {
    maxDevices: 3,
    monthlySimpleDocumentsLimit: 100,
    monthlyRiskAnalysisLimit: 40,
    allowedFeatures: ['documents', 'riskAnalysis'],
  },
};

const USER_LICENSE_PLAN_DEFAULTS = {
  pro: {
    primary: {
      monthly: { price: 79 },
      yearly: { price: 790 },
    },
    additional: {
      monthly: { price: 39 },
      yearly: { price: 390 },
    },
    maxDevices: 3,
    monthlySimpleDocumentsLimit: 100,
    monthlyRiskAnalysisLimit: 40,
    allowedFeatures: ['documents', 'riskAnalysis'],
  },
};

const BILLING_PLANS = {
  primary_monthly: {
    id: 'primary_monthly',
    name: 'Licence principale',
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'monthly',
    price: 79,
    amountCents: 7900,
    currency: 'eur',
  },
  primary_yearly: {
    id: 'primary_yearly',
    name: 'Licence principale',
    plan: 'pro',
    licenseType: 'primary',
    billingCycle: 'yearly',
    price: 790,
    amountCents: 79000,
    currency: 'eur',
  },
  additional_monthly: {
    id: 'additional_monthly',
    name: 'Licence supplémentaire',
    plan: 'pro',
    licenseType: 'additional',
    billingCycle: 'monthly',
    price: 39,
    amountCents: 3900,
    currency: 'eur',
  },
  additional_yearly: {
    id: 'additional_yearly',
    name: 'Licence supplémentaire',
    plan: 'pro',
    licenseType: 'additional',
    billingCycle: 'yearly',
    price: 390,
    amountCents: 39000,
    currency: 'eur',
  },
};

let stripeClientCache = null;
let stripeClientSecret = null;

function loadLicenses() {
  try {
    if (!fs.existsSync(LICENSE_STORE_PATH)) {
      return { licenses: [] };
    }

    const parsed = JSON.parse(fs.readFileSync(LICENSE_STORE_PATH, 'utf8'));
    return {
      licenses: Array.isArray(parsed.licenses) ? parsed.licenses : [],
    };
  } catch (error) {
    console.error('[LICENSE_TRACE] load failed', { message: error.message });
    return { licenses: [] };
  }
}

function saveLicenses(store) {
  fs.mkdirSync(path.dirname(LICENSE_STORE_PATH), { recursive: true });
  fs.writeFileSync(
    LICENSE_STORE_PATH,
    `${JSON.stringify({ licenses: ensureArray(store.licenses) }, null, 2)}\n`,
    'utf8',
  );
}

function loadUserLicenses() {
  try {
    if (!fs.existsSync(USER_LICENSE_STORE_PATH)) {
      return { userLicenses: [] };
    }

    const parsed = JSON.parse(fs.readFileSync(USER_LICENSE_STORE_PATH, 'utf8'));
    return {
      userLicenses: Array.isArray(parsed.userLicenses) ? parsed.userLicenses : [],
    };
  } catch (error) {
    console.error('[USER_LICENSE_TRACE] load failed', { message: error.message });
    return { userLicenses: [] };
  }
}

function saveUserLicenses(store) {
  fs.mkdirSync(path.dirname(USER_LICENSE_STORE_PATH), { recursive: true });
  fs.writeFileSync(
    USER_LICENSE_STORE_PATH,
    `${JSON.stringify({ userLicenses: ensureArray(store.userLicenses) }, null, 2)}\n`,
    'utf8',
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function findUserLicenseByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const store = loadUserLicenses();
  return store.userLicenses.find((userLicense) => userLicense.email === normalizedEmail) || null;
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ''), 12);
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash || typeof password !== 'string') {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

function generateAuthToken(userLicense) {
  return jwt.sign(
    {
      sub: userLicense.id,
      email: userLicense.email,
      plan: userLicense.plan,
      licenseType: userLicense.licenseType,
    },
    getJwtSecret(),
    { expiresIn: '30d' },
  );
}

function verifyAuthToken(token) {
  try {
    return {
      ok: true,
      payload: jwt.verify(token, getJwtSecret()),
    };
  } catch (_error) {
    return {
      ok: false,
      error: 'Session invalide ou expirée.',
    };
  }
}

function getPublicBillingPlans() {
  return Object.values(BILLING_PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    licenseType: plan.licenseType,
    billingCycle: plan.billingCycle,
    price: plan.price,
    currency: plan.currency.toUpperCase(),
  }));
}

function renderLegalIndexPage() {
  return renderLegalPage({
    title: 'Informations légales — PreventIA Belgique',
    sections: [
      {
        paragraphs: [
          'Documents publics liés aux conditions d’utilisation, à la confidentialité et à l’annulation des abonnements PreventIA Belgique.',
        ],
      },
    ],
  });
}

function renderLegalPage({ title, sections }) {
  const body = sections
    .map((section) => {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '';
      const paragraphs = ensureArray(section.paragraphs)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');
      const items = ensureArray(section.items);
      const list = items.length > 0
        ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '';
      return `<section>${heading}${paragraphs}${list}</section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="fr-BE">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </main>
  <footer>
    <nav aria-label="Pages légales">
      <a href="/legal/terms">Conditions d’utilisation</a>
      <a href="/legal/privacy">Politique de confidentialité</a>
      <a href="/legal/cancellation">Annulation et remboursement</a>
    </nav>
  </footer>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStripeAvailability() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      error: 'STRIPE_SECRET_KEY n’est pas défini côté serveur. La facturation Stripe est indisponible.',
    };
  }

  return {
    ok: true,
    stripe: getStripeClient(),
  };
}

function getStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;

  if (!stripeClientCache || stripeClientSecret !== secret) {
    stripeClientCache = new Stripe(secret);
    stripeClientSecret = secret;
  }

  return stripeClientCache;
}

async function validateCheckoutPayload(payload = {}) {
  const email = normalizeEmail(payload.email);

  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Email obligatoire et valide requis.' };
  }

  if (typeof payload.password !== 'string' || payload.password.length < 8) {
    return { ok: false, error: 'Mot de passe obligatoire de minimum 8 caractères.' };
  }

  if (payload.password !== payload.passwordConfirmation) {
    return { ok: false, error: 'La confirmation du mot de passe ne correspond pas.' };
  }

  const firstName = sanitizeLicenseText(payload.firstName, 100);
  if (!firstName) {
    return { ok: false, error: 'Prénom obligatoire.' };
  }

  const lastName = sanitizeLicenseText(payload.lastName, 100);
  if (!lastName) {
    return { ok: false, error: 'Nom obligatoire.' };
  }

  const companyName = sanitizeLicenseText(payload.companyName, 160);
  if (!companyName) {
    return { ok: false, error: 'Nom de société obligatoire.' };
  }

  const vatNumber = sanitizeLicenseText(payload.vatNumber, 60);
  if (!vatNumber) {
    return { ok: false, error: 'Numéro de TVA obligatoire.' };
  }

  const addressLine1 = sanitizeLicenseText(payload.addressLine1, 200);
  if (!addressLine1) {
    return { ok: false, error: 'Adresse de facturation obligatoire.' };
  }

  const postalCode = sanitizeLicenseText(payload.postalCode, 30);
  if (!postalCode) {
    return { ok: false, error: 'Code postal obligatoire.' };
  }

  const city = sanitizeLicenseText(payload.city, 100);
  if (!city) {
    return { ok: false, error: 'Ville obligatoire.' };
  }

  const country = sanitizeLicenseText(payload.country, 2).toUpperCase();
  if (!country) {
    return { ok: false, error: 'Pays obligatoire.' };
  }

  const plan = BILLING_PLANS[String(payload.planId || '').trim()];
  if (!plan) {
    return { ok: false, error: 'Offre de facturation invalide.' };
  }

  if (payload.acceptTerms !== true) {
    return { ok: false, error: 'Vous devez accepter les conditions d’utilisation.' };
  }

  if (payload.acceptPrivacy !== true) {
    return { ok: false, error: 'Vous devez accepter la politique de confidentialité.' };
  }

  await licenseStoreReady;
  if (await licenseStore.findByEmail(email)) {
    return { ok: false, error: 'Une licence existe déjà pour cet email.' };
  }

  const acceptedAt = new Date().toISOString();

  return {
    ok: true,
    normalized: {
      email,
      passwordHash: await hashPassword(payload.password),
      firstName,
      lastName,
      companyName,
      vatNumber,
      addressLine1,
      postalCode,
      city,
      country,
      plan,
      acceptTermsAt: acceptedAt,
      acceptPrivacyAt: acceptedAt,
    },
  };
}

async function createStripeCheckoutSession(payload, stripe) {
  const metadata = buildCheckoutMetadata(payload);
  const successUrl = process.env.PREVENTIA_SUCCESS_URL ||
    `${getAppPublicUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = process.env.PREVENTIA_CANCEL_URL || `${getAppPublicUrl()}/billing/cancel`;

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: payload.email,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: payload.plan.currency,
          unit_amount: payload.plan.amountCents,
          recurring: {
            interval: payload.plan.billingCycle === 'yearly' ? 'year' : 'month',
          },
          product_data: {
            name: `PreventIA Pro - ${payload.plan.name}`,
          },
        },
      },
    ],
    metadata,
    subscription_data: {
      metadata: {
        email: metadata.email,
        plan: metadata.plan,
        licenseType: metadata.licenseType,
        billingCycle: metadata.billingCycle,
      },
    },
  });
}

function buildCheckoutMetadata(payload) {
  const defaults = getPlanDefaults(payload.plan.plan, payload.plan.licenseType, payload.plan.billingCycle);
  return {
    email: payload.email,
    passwordHash: payload.passwordHash,
    firstName: payload.firstName,
    lastName: payload.lastName,
    companyName: payload.companyName,
    vatNumber: payload.vatNumber,
    addressLine1: payload.addressLine1,
    postalCode: payload.postalCode,
    city: payload.city,
    country: payload.country,
    plan: payload.plan.plan,
    licenseType: payload.plan.licenseType,
    billingCycle: payload.plan.billingCycle,
    price: String(payload.plan.price),
    maxDevices: String(defaults.maxDevices),
    monthlySimpleDocumentsLimit: String(defaults.monthlySimpleDocumentsLimit),
    monthlyRiskAnalysisLimit: String(defaults.monthlyRiskAnalysisLimit),
    acceptTermsAt: payload.acceptTermsAt,
    acceptPrivacyAt: payload.acceptPrivacyAt,
  };
}

function getAppPublicUrl() {
  return String(process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function getBillingReturnUrl() {
  return process.env.PREVENTIA_SUCCESS_URL || `${getAppPublicUrl()}/billing`;
}

async function handleStripeWebhook(req, res) {
  const stripeAvailability = getStripeAvailability();
  if (!stripeAvailability.ok) {
    return res.status(503).json({
      success: false,
      error: stripeAvailability.error,
    });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'STRIPE_WEBHOOK_SECRET n’est pas défini côté serveur. Le webhook Stripe est indisponible.',
    });
  }

  let event;
  try {
    event = stripeAvailability.stripe.webhooks.constructEvent(
      req.body,
      req.get('stripe-signature') || '',
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (_error) {
    return res.status(400).json({
      success: false,
      error: 'Signature Stripe invalide.',
    });
  }

  try {
    await processStripeWebhookEvent(event, stripeAvailability.stripe);
    return res.json({ success: true });
  } catch (error) {
    console.error('[STRIPE_WEBHOOK_TRACE] processing failed', {
      message: error.message,
      type: event?.type,
    });
    return res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook Stripe.',
    });
  }
}

async function processStripeWebhookEvent(event, stripe) {
  const object = event?.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutSessionCompleted(object, stripe);
    return;
  }

  if (event.type === 'invoice.paid') {
    await updateLicenseFromInvoice(object, stripe, 'active');
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    await updateLicenseFromInvoice(object, stripe, 'past_due');
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    await updateUserLicenseBySubscription(object, 'cancelled');
    return;
  }

  if (event.type === 'customer.subscription.updated') {
    await updateUserLicenseBySubscription(object, mapStripeSubscriptionStatus(object.status));
  }
}

async function handleCheckoutSessionCompleted(session, stripe) {
  if (session.mode !== 'subscription') {
    return null;
  }

  let subscription = null;
  if (session.subscription && stripe) {
    subscription = await retrieveStripeSubscription(stripe, session.subscription);
  }

  return createUserLicenseFromCheckoutMetadata(session.metadata || {}, {
    stripeCustomerId: getStripeObjectId(session.customer),
    stripeSubscriptionId: getStripeObjectId(session.subscription),
    currentPeriodEnd: subscription?.current_period_end,
  });
}

function createUserLicenseFromCheckoutMetadata(metadata = {}, stripeContext = {}) {
  if (licenseStore.mode === 'postgres') {
    return createUserLicenseFromCheckoutMetadataPostgres(metadata, stripeContext);
  }
  const email = normalizeEmail(metadata.email);
  const store = loadUserLicenses();
  const existing = store.userLicenses.find((item) => item.email === email);
  if (existing) return existing;
  const userLicense = buildUserLicenseFromCheckoutMetadata(metadata, stripeContext);
  store.userLicenses.push(userLicense);
  saveUserLicenses(store);
  return userLicense;
}

async function createUserLicenseFromCheckoutMetadataPostgres(metadata, stripeContext) {
  await licenseStoreReady;
  const existing = await licenseStore.findByEmail(metadata.email);
  if (existing) return existing;
  const userLicense = buildUserLicenseFromCheckoutMetadata(metadata, stripeContext);
  return (await licenseStore.create(userLicense)) || licenseStore.findByEmail(metadata.email);
}

function buildUserLicenseFromCheckoutMetadata(metadata = {}, stripeContext = {}) {
  const email = normalizeEmail(metadata.email);
  if (!email || !isValidEmail(email)) {
    const error = new Error('Metadata Stripe incomplète: email invalide.');
    error.status = 400;
    throw error;
  }

  const plan = String(metadata.plan || 'pro');
  const licenseType = String(metadata.licenseType || '');
  const billingCycle = String(metadata.billingCycle || '');
  const defaults = getPlanDefaults(plan, licenseType, billingCycle);
  const now = new Date();
  const nowIso = now.toISOString();
  const billingAddress = buildBillingAddressFromMetadata(metadata);
  const userLicense = {
    id: crypto.randomUUID(),
    email,
    passwordHash: String(metadata.passwordHash || ''),
    firstName: sanitizeLicenseText(metadata.firstName, 100),
    lastName: sanitizeLicenseText(metadata.lastName, 100),
    companyName: sanitizeLicenseText(metadata.companyName, 160),
    vatNumber: sanitizeLicenseText(metadata.vatNumber, 60),
    ...(billingAddress ? { billingAddress } : {}),
    acceptTermsAt: String(metadata.acceptTermsAt || ''),
    acceptPrivacyAt: String(metadata.acceptPrivacyAt || ''),
    plan,
    licenseType,
    billingCycle,
    price: Number(metadata.price || defaults.price),
    currency: String(metadata.currency || 'EUR').toUpperCase(),
    status: 'active',
    startDate: formatIsoDate(now),
    endDate: resolveBillingEndDate(stripeContext.currentPeriodEnd, billingCycle, now),
    stripeCustomerId: stripeContext.stripeCustomerId || '',
    stripeSubscriptionId: stripeContext.stripeSubscriptionId || '',
    maxDevices: Number(metadata.maxDevices || defaults.maxDevices),
    activatedDevices: [],
    monthlySimpleDocumentsLimit: Number(metadata.monthlySimpleDocumentsLimit || defaults.monthlySimpleDocumentsLimit),
    monthlyRiskAnalysisLimit: Number(metadata.monthlyRiskAnalysisLimit || defaults.monthlyRiskAnalysisLimit),
    usedSimpleDocumentsThisMonth: 0,
    usedRiskAnalysisThisMonth: 0,
    currentPeriod: getCurrentPeriod(),
    allowedFeatures: parseAllowedFeatures(metadata.allowedFeatures, defaults.allowedFeatures),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (!userLicense.passwordHash) {
    const error = new Error('Metadata Stripe incomplète: passwordHash manquant.');
    error.status = 400;
    throw error;
  }

  return userLicense;
}

function buildBillingAddressFromMetadata(metadata = {}) {
  const billingAddress = {
    addressLine1: sanitizeLicenseText(metadata.addressLine1, 200),
    postalCode: sanitizeLicenseText(metadata.postalCode, 30),
    city: sanitizeLicenseText(metadata.city, 100),
    country: sanitizeLicenseText(metadata.country || 'BE', 2).toUpperCase(),
  };

  return Object.values(billingAddress).some(Boolean) ? billingAddress : null;
}

function parseAllowedFeatures(value, fallback) {
  const features = String(value || '')
    .split(',')
    .map((feature) => feature.trim())
    .filter(Boolean);
  return features.length > 0 ? features : [...fallback];
}

function resolveBillingEndDate(currentPeriodEnd, billingCycle, startDate = new Date()) {
  if (Number.isFinite(Number(currentPeriodEnd)) && Number(currentPeriodEnd) > 0) {
    return formatIsoDate(new Date(Number(currentPeriodEnd) * 1000));
  }

  const endDate = new Date(startDate);
  if (billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }
  return formatIsoDate(endDate);
}

async function updateLicenseFromInvoice(invoice, stripe, status) {
  const subscriptionId = getStripeObjectId(invoice.subscription) ||
    getStripeObjectId(invoice.parent?.subscription_details?.subscription);
  let subscription = null;

  if (subscriptionId && stripe) {
    subscription = await retrieveStripeSubscription(stripe, subscriptionId);
  }

  await updateUserLicenseBySubscription(
    {
      id: subscriptionId,
      customer: getStripeObjectId(invoice.customer),
      current_period_end: subscription?.current_period_end,
    },
    status,
  );
}

function getStripeObjectId(value) {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value?.id === 'string' ? value.id : '';
}

async function retrieveStripeSubscription(stripe, subscriptionId) {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error('[STRIPE_WEBHOOK_TRACE] subscription retrieve failed', { message: error.message });
    return null;
  }
}

async function updateUserLicenseBySubscription(subscription, status) {
  const subscriptionId = typeof subscription?.id === 'string' ? subscription.id : '';
  const customerId = typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id;
  await licenseStoreReady;
  const userLicense = await licenseStore.findByStripe({ subscriptionId, customerId });

  if (!userLicense) {
    return null;
  }

  userLicense.status = status;
  if (Number.isFinite(Number(subscription?.current_period_end)) && Number(subscription.current_period_end) > 0) {
    userLicense.endDate = formatIsoDate(new Date(Number(subscription.current_period_end) * 1000));
  }
  userLicense.updatedAt = new Date().toISOString();
  return licenseStore.save(userLicense);
}

function mapStripeSubscriptionStatus(status) {
  if (status === 'active') {
    return 'active';
  }

  if (status === 'past_due' || status === 'unpaid') {
    return 'past_due';
  }

  if (status === 'canceled') {
    return 'cancelled';
  }

  if (status === 'incomplete_expired') {
    return 'expired';
  }

  return String(status || 'past_due');
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'preventia-dev-jwt-secret';
  }

  const error = new Error('JWT_SECRET est obligatoire en production pour utiliser les sessions.');
  error.isAuthConfigurationError = true;
  throw error;
}

function ensureJwtSecretAvailable() {
  getJwtSecret();
}

function getPlanDefaults(plan, licenseType, billingCycle) {
  const planDefaults = USER_LICENSE_PLAN_DEFAULTS[plan];
  const price = planDefaults?.[licenseType]?.[billingCycle]?.price;

  if (!planDefaults || !Number.isFinite(price)) {
    const error = new Error('Configuration de plan invalide.');
    error.status = 400;
    throw error;
  }

  return {
    price,
    maxDevices: planDefaults.maxDevices,
    monthlySimpleDocumentsLimit: planDefaults.monthlySimpleDocumentsLimit,
    monthlyRiskAnalysisLimit: planDefaults.monthlyRiskAnalysisLimit,
    allowedFeatures: [...planDefaults.allowedFeatures],
  };
}

function getBearerTokenFromRequest(req) {
  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function validateUserLicenseFromRequest(req) {
  const token = getBearerTokenFromRequest(req);

  if (!token) {
    return { ok: false, error: 'Session requise.' };
  }

  const tokenValidation = verifyAuthToken(token);
  if (!tokenValidation.ok) {
    return tokenValidation;
  }

  await licenseStoreReady;
  const userLicense = await licenseStore.findById(tokenValidation.payload.sub);

  if (!userLicense) {
    return { ok: false, error: 'Licence utilisateur introuvable.' };
  }

  const monthlyReset = resetMonthlyUsageIfNeeded(userLicense);
  const activeError = getLicenseActiveError(userLicense);
  if (activeError) {
    if (monthlyReset) {
      await licenseStore.save(userLicense);
    }
    return { ok: false, error: activeError };
  }

  if (monthlyReset) {
    await licenseStore.save(userLicense);
  }

  return { ok: true, userLicense };
}

async function validateUserGenerationAccess(req, { deviceId, documentType }) {
  const validation = await validateUserLicenseFromRequest(req);

  if (!validation.ok) {
    return validation;
  }

  if (!normalizeDeviceId(deviceId)) {
    return { ok: false, error: 'Identifiant appareil requis.' };
  }

  if (!isDeviceActivated(validation.userLicense, deviceId)) {
    return { ok: false, error: 'Appareil non activé pour cette licence.' };
  }

  const existingDevice = ensureArray(validation.userLicense.activatedDevices)
    .find((device) => normalizeDeviceId(device.deviceId) === normalizeDeviceId(deviceId));
  const touchedDevice = await licenseStore.addDevice(validation.userLicense, existingDevice || { deviceId });
  if (touchedDevice.license) {
    validation.userLicense = touchedDevice.license;
  }

  if (!canUseDocumentType(validation.userLicense, documentType)) {
    await licenseStore.save(validation.userLicense);
    return {
      ok: false,
      error: 'Votre abonnement ne permet pas de générer ce type de document.',
    };
  }

  const quotaError = getQuotaError(validation.userLicense, documentType);
  if (quotaError) {
    await licenseStore.save(validation.userLicense);
    return { ok: false, error: quotaError };
  }

  await licenseStore.save(validation.userLicense);
  return validation;
}

function publicRegisteredUserLicensePayload(userLicense) {
  return {
    email: userLicense.email,
    plan: userLicense.plan,
    licenseType: userLicense.licenseType,
    billingCycle: userLicense.billingCycle,
    price: userLicense.price,
    currency: userLicense.currency,
    endDate: userLicense.endDate,
    maxDevices: userLicense.maxDevices,
  };
}

function userLicenseStatusPayload(userLicense) {
  resetMonthlyUsageIfNeeded(userLicense);
  return {
    email: userLicense.email,
    firstName: userLicense.firstName,
    lastName: userLicense.lastName,
    companyName: userLicense.companyName,
    vatNumber: userLicense.vatNumber,
    billingAddress: userLicense.billingAddress,
    plan: userLicense.plan,
    licenseType: userLicense.licenseType,
    billingCycle: userLicense.billingCycle,
    status: userLicense.status,
    price: userLicense.price,
    currency: userLicense.currency,
    endDate: userLicense.endDate,
    maxDevices: userLicense.maxDevices,
    activatedDevices: ensureArray(userLicense.activatedDevices).length,
    monthlySimpleDocumentsLimit: userLicense.monthlySimpleDocumentsLimit,
    monthlyRiskAnalysisLimit: userLicense.monthlyRiskAnalysisLimit,
    usedSimpleDocumentsThisMonth: userLicense.usedSimpleDocumentsThisMonth,
    usedRiskAnalysisThisMonth: userLicense.usedRiskAnalysisThisMonth,
    allowedFeatures: ensureArray(userLicense.allowedFeatures),
  };
}

function findLicenseByKey(licenseKey) {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  const store = loadLicenses();
  return store.licenses.find((license) => normalizeLicenseKey(license.licenseKey) === normalizedKey) || null;
}

function normalizeLicenseKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function generateLicenseKey() {
  const chunks = Array.from({ length: 4 }, () =>
    crypto.randomBytes(2).toString('hex').toUpperCase(),
  );
  return `PREV-${chunks.join('-')}`;
}

function getCurrentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function resetMonthlyUsageIfNeeded(license) {
  const currentPeriod = getCurrentPeriod();

  if (license.currentPeriod !== currentPeriod) {
    license.currentPeriod = currentPeriod;
    license.usedSimpleDocumentsThisMonth = 0;
    license.usedRiskAnalysisThisMonth = 0;
    license.updatedAt = new Date().toISOString();
    return true;
  }

  return false;
}

function isRiskAnalysisDocument(documentType = '') {
  const normalized = normalizeDocumentType(documentType);
  return RISK_ANALYSIS_DOCUMENT_TYPES.some((type) => normalizeDocumentType(type) === normalized) ||
    normalized.startsWith('analyse de risques') ||
    normalized.startsWith('risk assessment') ||
    normalized.startsWith('risicoanalyse') ||
    normalized.startsWith('gefahrdungsbeurteilung');
}

function isSimplePreventionDocument(documentType = '') {
  const normalized = normalizeDocumentType(documentType);
  return SIMPLE_PREVENTION_DOCUMENT_TYPES.some((type) => normalizeDocumentType(type) === normalized);
}

function canUseDocumentType(license, documentType) {
  const features = ensureArray(license?.allowedFeatures);

  if (isRiskAnalysisDocument(documentType)) {
    return features.includes('riskAnalysis');
  }

  if (isSimplePreventionDocument(documentType)) {
    return features.includes('documents');
  }

  return false;
}

function canUseDevice(license, deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId) {
    return false;
  }

  const devices = ensureArray(license?.activatedDevices);
  return devices.some((device) => normalizeDeviceId(device.deviceId) === normalizedDeviceId) ||
    devices.length < Number(license?.maxDevices || 0);
}

function registerDeviceIfAllowed(license, deviceInfo = {}) {
  const deviceId = normalizeDeviceId(deviceInfo.deviceId);

  if (!deviceId) {
    return {
      ok: false,
      error: 'Identifiant appareil requis.',
    };
  }

  license.activatedDevices = ensureArray(license.activatedDevices);
  const now = new Date().toISOString();
  const existingDevice = license.activatedDevices.find((device) => normalizeDeviceId(device.deviceId) === deviceId);

  if (existingDevice) {
    existingDevice.deviceName = sanitizeLicenseText(deviceInfo.deviceName, 120) || existingDevice.deviceName || '';
    existingDevice.platform = sanitizeLicenseText(deviceInfo.platform, 60) || existingDevice.platform || '';
    existingDevice.appVersion = sanitizeLicenseText(deviceInfo.appVersion, 40) || existingDevice.appVersion || '';
    existingDevice.lastSeenAt = now;
    license.updatedAt = now;
    return { ok: true, activated: false };
  }

  if (license.activatedDevices.length >= Number(license.maxDevices || 0)) {
    return {
      ok: false,
      error: 'Limite d’appareils atteinte pour cette licence.',
    };
  }

  license.activatedDevices.push({
    deviceId,
    deviceName: sanitizeLicenseText(deviceInfo.deviceName, 120),
    platform: sanitizeLicenseText(deviceInfo.platform, 60),
    appVersion: sanitizeLicenseText(deviceInfo.appVersion, 40),
    activatedAt: now,
    lastSeenAt: now,
  });
  license.updatedAt = now;

  return { ok: true, activated: true };
}

function incrementUsage(license, documentType) {
  resetMonthlyUsageIfNeeded(license);

  if (isRiskAnalysisDocument(documentType)) {
    license.usedRiskAnalysisThisMonth = Number(license.usedRiskAnalysisThisMonth || 0) + 1;
  } else if (isSimplePreventionDocument(documentType)) {
    license.usedSimpleDocumentsThisMonth = Number(license.usedSimpleDocumentsThisMonth || 0) + 1;
  }

  license.updatedAt = new Date().toISOString();
}

function createLicenseRecord(payload = {}) {
  const plan = String(payload.plan || '').trim();
  const defaults = LICENSE_PLAN_DEFAULTS[plan];

  if (!defaults) {
    const error = new Error('Plan de licence invalide.');
    error.status = 400;
    throw error;
  }

  if (!hasUsableStringValue(payload.companyName) || !hasUsableStringValue(payload.adminEmail)) {
    const error = new Error('companyName et adminEmail sont requis.');
    error.status = 400;
    throw error;
  }

  if (!isValidIsoDate(payload.endDate)) {
    const error = new Error('endDate doit être au format YYYY-MM-DD.');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();

  return {
    licenseKey: generateUniqueLicenseKey(),
    companyName: sanitizeLicenseText(payload.companyName, 160),
    adminEmail: sanitizeLicenseText(payload.adminEmail, 160),
    plan,
    status: 'active',
    startDate: formatIsoDate(new Date()),
    endDate: payload.endDate,
    maxDevices: Number(payload.maxDevices || defaults.maxDevices),
    monthlySimpleDocumentsLimit: Number(payload.monthlySimpleDocumentsLimit ?? defaults.monthlySimpleDocumentsLimit),
    monthlyRiskAnalysisLimit: Number(payload.monthlyRiskAnalysisLimit ?? defaults.monthlyRiskAnalysisLimit),
    usedSimpleDocumentsThisMonth: 0,
    usedRiskAnalysisThisMonth: 0,
    currentPeriod: getCurrentPeriod(),
    allowedFeatures: [...defaults.allowedFeatures],
    activatedDevices: [],
    createdAt: now,
    updatedAt: now,
  };
}

function generateUniqueLicenseKey() {
  const store = loadLicenses();
  let licenseKey = generateLicenseKey();

  while (store.licenses.some((license) => normalizeLicenseKey(license.licenseKey) === licenseKey)) {
    licenseKey = generateLicenseKey();
  }

  return licenseKey;
}

function validateLicenseAccess({ licenseKey, deviceId, documentType = '', registerDevice = false, deviceInfo = {} }) {
  const store = loadLicenses();
  const license = store.licenses.find((item) => normalizeLicenseKey(item.licenseKey) === normalizeLicenseKey(licenseKey));

  if (!license) {
    return { ok: false, error: 'Licence requise ou invalide.' };
  }

  const monthlyReset = resetMonthlyUsageIfNeeded(license);
  const activeError = getLicenseActiveError(license);

  if (activeError) {
    if (monthlyReset) {
      saveLicenses(store);
    }
    return { ok: false, error: activeError };
  }

  if (registerDevice) {
    const registration = registerDeviceIfAllowed(license, { ...deviceInfo, deviceId });
    if (!registration.ok) {
      if (monthlyReset) {
        saveLicenses(store);
      }
      return { ok: false, error: registration.error };
    }
  } else if (!isDeviceActivated(license, deviceId)) {
    if (monthlyReset) {
      saveLicenses(store);
    }
    return { ok: false, error: 'Appareil non activé pour cette licence.' };
  } else {
    touchDevice(license, deviceId);
  }

  if (documentType) {
    if (!canUseDocumentType(license, documentType)) {
      saveLicenses(store);
      return {
        ok: false,
        error: 'Votre abonnement ne permet pas de générer ce type de document.',
      };
    }

    const quotaError = getQuotaError(license, documentType);
    if (quotaError) {
      saveLicenses(store);
      return { ok: false, error: quotaError };
    }
  }

  saveLicenses(store);
  return { ok: true, license, store };
}

function getLicenseActiveError(license) {
  if (license.status !== 'active') {
    return 'Licence inactive.';
  }

  if (isLicenseExpired(license)) {
    return 'Licence expirée.';
  }

  return '';
}

function isLicenseExpired(license) {
  if (!isValidIsoDate(license.endDate)) {
    return true;
  }

  return license.endDate < formatIsoDate(new Date());
}

function getQuotaError(license, documentType) {
  if (isRiskAnalysisDocument(documentType)) {
    return Number(license.usedRiskAnalysisThisMonth || 0) >= Number(license.monthlyRiskAnalysisLimit || 0)
      ? 'Quota mensuel d’analyses de risques atteint.'
      : '';
  }

  if (isSimplePreventionDocument(documentType)) {
    return Number(license.usedSimpleDocumentsThisMonth || 0) >= Number(license.monthlySimpleDocumentsLimit || 0)
      ? 'Quota mensuel de documents atteint.'
      : '';
  }

  return 'Type de document non autorisé par la licence.';
}

function isDeviceActivated(license, deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  return Boolean(normalizedDeviceId) &&
    ensureArray(license?.activatedDevices)
      .some((device) => normalizeDeviceId(device.deviceId) === normalizedDeviceId);
}

function touchDevice(license, deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const device = ensureArray(license.activatedDevices)
    .find((item) => normalizeDeviceId(item.deviceId) === normalizedDeviceId);

  if (device) {
    device.lastSeenAt = new Date().toISOString();
    license.updatedAt = device.lastSeenAt;
  }
}

function licenseStatusPayload(license) {
  resetMonthlyUsageIfNeeded(license);
  return {
    plan: license.plan,
    companyName: license.companyName,
    vatNumber: license.vatNumber,
    billingAddress: license.billingAddress,
    endDate: license.endDate,
    maxDevices: license.maxDevices,
    activatedDevices: ensureArray(license.activatedDevices).length,
    monthlySimpleDocumentsLimit: license.monthlySimpleDocumentsLimit,
    monthlyRiskAnalysisLimit: license.monthlyRiskAnalysisLimit,
    usedSimpleDocumentsThisMonth: license.usedSimpleDocumentsThisMonth,
    usedRiskAnalysisThisMonth: license.usedRiskAnalysisThisMonth,
    allowedFeatures: ensureArray(license.allowedFeatures),
  };
}

function normalizeDeviceId(value) {
  return String(value || '').trim().slice(0, 160);
}

function sanitizeLicenseText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function isValidIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isUnlicensedGenerationAllowed() {
  return process.env.NODE_ENV !== 'production' &&
    String(process.env.ALLOW_UNLICENSED_GENERATION || '').toLowerCase() === 'true';
}

function getRiskLevel(score, language = 'fr') {
  if (!Number.isFinite(score)) {
    return null;
  }

  const labels = LANGUAGE_CONFIGS[language]?.riskLevels || LANGUAGE_CONFIGS.fr.riskLevels;

  if (score >= 1 && score <= 10) {
    return labels.low;
  }

  if (score >= 11 && score <= 30) {
    return labels.medium;
  }

  if (score >= 31 && score <= 60) {
    return labels.high;
  }

  if (score >= 61 && score <= 125) {
    return labels.critical;
  }

  return null;
}

function processGeneratedDocument(outputText, documentDefinition, language = 'fr') {
  const normalizedOutput = normalizeGeneratedDocument(outputText || '', documentDefinition, language);

  if (!documentDefinition?.hasSecondaryDocument) {
    return {
      document: normalizedOutput.trim(),
      complementaryDocument: null,
    };
  }

  const [document, complementaryDocument] = normalizedOutput
    .split(SECONDARY_DOCUMENT_SEPARATOR)
    .map((part) => part.trim());

  return {
    document,
    complementaryDocument: complementaryDocument || null,
  };
}

function normalizeGeneratedDocument(outputText, documentDefinition, language = 'fr') {
  if (documentDefinition?.family !== 'risk_assessment') {
    return normalizeRiskLevels(outputText || '');
  }

  const structuredData = parseRiskAssessmentStructuredOutput(outputText || '', language);
  const validatedData = validateRiskAssessmentStructuredData(structuredData, language);

  return finalizeRiskAssessmentMarkdown(
    normalizeKnownPhrases(renderRiskAssessmentMarkdown(validatedData, language)),
    language,
  );
}

async function generateStructuredRiskAssessmentInParts({
  openai,
  documentType,
  formData,
  languageCode = 'fr',
  languageLabel = 'Français',
}) {
  console.info('Début analyse structurée par blocs', {
    documentType,
    language: languageCode,
    formFields: Object.keys(formData || {}).length,
  });

  const blocks = getRiskAssessmentBlockDefinitions();
  const generatedBlocks = {};

  for (const block of blocks) {
    generatedBlocks[block.key] = await generateStructuredRiskAssessmentBlock({
      openai,
      block,
      documentType,
      formData,
      languageCode,
      languageLabel,
    });
  }

  const structuredData = assembleStructuredRiskAssessmentBlocks(generatedBlocks, languageCode);
  const validatedData = validateRiskAssessmentStructuredData(structuredData, languageCode);
  const document = finalizeRiskAssessmentMarkdown(
    normalizeKnownPhrases(renderRiskAssessmentMarkdown(validatedData, languageCode)),
    languageCode,
  );

  console.info('Renderer markdown OK');
  console.info('Longueur document final', { length: document.length });

  return {
    document,
    complementaryDocument: null,
  };
}

async function generateRiskAssessmentFast({
  openai,
  documentType,
  formData,
  languageCode = 'fr',
  languageLabel = 'Français',
}) {
  const startedAt = Date.now();
  console.info('Début génération analyse rapide', {
    documentType,
    language: languageCode,
    formFields: Object.keys(formData || {}).length,
  });

  const fixedSections = buildRiskAssessmentFixedSections(formData, documentType, languageCode);
  const fallbackRiskItems = buildFallbackRiskItems(formData, documentType, languageCode);
  let riskItems = fallbackRiskItems;

  try {
    console.info('Appel IA court démarré');
    const response = await callShortRiskAiWithTimeout({
      openai,
      documentType,
      formData,
      languageCode,
      languageLabel,
    });
    const parsed = safeParseAiJson(response.output_text);

    if (parsed.ok) {
      const aiRiskItems = transformFlatRiskItems(parsed.data, languageCode);
      if (aiRiskItems.mainRiskAssessment.initialAssessment.length > 0) {
        riskItems = aiRiskItems;
        console.info('Appel IA OK', {
          count: riskItems.mainRiskAssessment.initialAssessment.length,
        });
      } else {
        console.warn('Parsing IA KO, fallback utilisé', {
          error: 'Liste risks vide ou invalide',
        });
      }
    } else {
      console.warn('Parsing IA KO, fallback utilisé', {
        error: parsed.error,
        preview: parsed.preview,
      });
    }
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'AI_TIMEOUT') {
      console.warn('Appel IA timeout, fallback utilisé');
    } else {
      console.warn('Parsing IA KO, fallback utilisé', {
        error: error.message,
      });
    }
  }

  const completedRiskData = completeRiskAssessmentWithFallback({
    ...fixedSections,
    ...riskItems,
  }, {
    ...fixedSections,
    ...fallbackRiskItems,
  }, languageCode);

  const validatedData = ensureCompleteRiskAssessmentData(
    validateRiskAssessmentStructuredData(completedRiskData, languageCode),
    documentType,
    languageCode,
    formData,
  );

  console.info('Données structurées analyse de risques OK');
  console.info('Durée totale génération en ms', {
    durationMs: Date.now() - startedAt,
  });

  return {
    structuredData: validatedData,
    reference: validatedData.documentIdentification.reference,
    complementaryDocument: null,
  };
}

async function callShortRiskAiWithTimeout({
  openai,
  documentType,
  formData,
  languageCode,
  languageLabel,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    return await openai.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: 2500,
      instructions: `${SYSTEM_PROMPT}\n\nRéponds uniquement avec un JSON valide et court. Aucun Markdown.`,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildShortRiskItemsPrompt({
                documentType,
                formData,
                languageCode,
                languageLabel,
              }),
            },
          ],
        },
      ],
    }, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('Timeout appel IA court');
      timeoutError.code = 'AI_TIMEOUT';
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildShortRiskItemsPrompt({
  documentType,
  formData,
  languageCode,
  languageLabel,
}) {
  const languageConfig = LANGUAGE_CONFIGS[languageCode] || LANGUAGE_CONFIGS.fr;

  return `Type de document demandé : ${documentType}
Langue cible : ${languageCode} (${languageConfig.label || languageLabel})

Données formData à exploiter :
${JSON.stringify(formData, null, 2)}

Génère uniquement une liste JSON courte de 6 à 8 risques principaux.
Ne génère aucune section complète.
Ne génère aucun titre.
Ne génère aucun tableau Markdown.
Ne génère aucun séparateur ---.
Pas de texte avant ou après JSON.
Toutes les valeurs sont des chaînes courtes.
Rédige tout en ${languageConfig.label || languageLabel}.
Adapte les risques au type demandé : ${buildRiskSpecializationInstruction(documentType)}
STOP autorisé uniquement : ${getAllowedStopLevels(languageCode).join('; ')}
N’utilise jamais ces valeurs dans stopLevel : ${getForbiddenRiskLevelValues().join('; ')}
Si tu hésites sur le STOP, écris : ${getDefaultStopLevel(languageCode)}

Schéma JSON exact :
{
  "risks": [
    {
      "number": "1",
      "task": "",
      "hazard": "",
      "hazardousSituationOrScenario": "",
      "possibleRiskOrHarm": "",
      "exposed": "",
      "existingMeasures": "",
      "existingEvidence": "",
      "observedOrDeclaredElements": "",
      "elementsToConfirm": "",
      "severity": "",
      "probability": "",
      "exposure": "",
      "scoringJustification": "",
      "initialScore": "",
      "initialLevel": "",
      "additionalMeasure": "",
      "stopLevel": "",
      "responsible": "",
      "deadline": "",
      "residualScore": "",
      "residualLevel": "",
      "residualScoreJustification": "",
      "expectedEvidence": "",
      "photoToInsert": "",
      "annexToAttach": "",
      "priority": "",
      "blockingPoint": "",
      "externalAdvice": ""
    }
  ]
}`;
}

function transformFlatRiskItems(data, language = 'fr') {
  const placeholder = getLanguagePlaceholder(language);
  const risks = ensureArray(ensureObject(data).risks)
    .slice(0, 8)
    .map((risk, index) => {
      const row = ensureObject(risk);
      const number = cleanRiskNumber(row.number, index + 1);
      return buildStructuredRiskRowsFromFlatRisk({
        ...buildEmptyFlatRisk(number, placeholder, language),
        ...row,
        number,
      }, language);
    });

  return buildRiskCollectionsFromRows(risks, language);
}

function buildRiskCollectionsFromRows(rows, language = 'fr') {
  const riskLabel = (risk) => {
    const residualRisk = String(risk.residual.mainRisk || '').trim();
    return /^\d{1,2}\.\s+/.test(residualRisk)
      ? residualRisk
      : `${risk.initial.number}. ${residualRisk || risk.initial.hazard}`;
  };

  return {
    mainRiskAssessment: {
      initialAssessment: rows.map((risk) => risk.initial),
      measuresFollowUpValidation: rows.map((risk) => risk.followUp),
    },
    residualRiskAnalysis: rows.map((risk) => risk.residual),
    actionPriorities: rows.map((risk) => ({
      action: risk.followUp.additionalMeasure,
      relatedRisk: riskLabel(risk),
      responsible: risk.followUp.responsible,
      deadline: risk.followUp.deadline,
      expectedEvidence: risk.followUp.expectedEvidence,
      blockingPoint: risk.followUp.blockingPoint,
      externalAdvice: risk.followUp.externalAdvice,
      actionType: risk.followUp.stopLevel,
    })),
    draftActionPlan: rows.map((risk) => ({
      relatedRisk: riskLabel(risk),
      actionToPerform: risk.followUp.additionalMeasure,
      responsible: risk.followUp.responsible,
      deadline: risk.followUp.deadline,
      expectedEvidence: risk.followUp.expectedEvidence,
      photoAfterCorrection: risk.followUp.photoToInsert,
      standardStatus: getFallbackPhrase('standardStatus', language),
      paaOrPgpLink: risk.followUp.priority,
      blockingPoint: risk.followUp.blockingPoint,
      externalAdvice: risk.followUp.externalAdvice,
    })),
    blockingPointsBeforeValidation: rows.map((risk) => ({
      point: risk.initial.number,
      whyBlocking: risk.followUp.blockingPoint,
      expectedEvidence: risk.followUp.expectedEvidence,
      responsible: risk.followUp.responsible,
      deadline: risk.followUp.deadline,
      externalAdvice: risk.followUp.externalAdvice,
      liftingCondition: risk.residual.reductionCondition,
    })),
  };
}

function completeRiskAssessmentWithFallback(data, fallbackData, language = 'fr') {
  const fallback = ensureObject(fallbackData);
  const completed = {
    ...ensureObject(data),
    photoPlan: {
      ...ensureObject(data.photoPlan),
      photos: completeRowsWithFallback(
        ensureArray(ensureObject(data.photoPlan).photos),
        ensureArray(ensureObject(fallback.photoPlan).photos),
        language,
        'photoNumber',
      ),
    },
    hazardIdentification: completeRowsWithFallback(
      ensureArray(data.hazardIdentification),
      ensureArray(fallback.hazardIdentification),
      language,
    ),
    mainRiskAssessment: {
      ...ensureObject(data.mainRiskAssessment),
      initialAssessment: completeRowsWithFallback(
        ensureArray(ensureObject(data.mainRiskAssessment).initialAssessment),
        ensureArray(ensureObject(fallback.mainRiskAssessment).initialAssessment),
        language,
        'number',
      ),
      measuresFollowUpValidation: completeRowsWithFallback(
        ensureArray(ensureObject(data.mainRiskAssessment).measuresFollowUpValidation),
        ensureArray(ensureObject(fallback.mainRiskAssessment).measuresFollowUpValidation),
        language,
        'number',
      ),
    },
    residualRiskAnalysis: completeRowsWithFallback(
      ensureArray(data.residualRiskAnalysis),
      ensureArray(fallback.residualRiskAnalysis),
      language,
    ),
    actionPriorities: completeRowsWithFallback(
      ensureArray(data.actionPriorities),
      ensureArray(fallback.actionPriorities),
      language,
    ),
    draftActionPlan: completeRowsWithFallback(
      ensureArray(data.draftActionPlan),
      ensureArray(fallback.draftActionPlan),
      language,
    ),
  };

  return completed;
}

function ensureCompleteRiskAssessmentData(structuredData, documentType = '', language = 'fr', formData = {}) {
  const data = {
    ...ensureObject(structuredData),
    mainRiskAssessment: ensureObject(ensureObject(structuredData).mainRiskAssessment),
    photoPlan: ensureObject(ensureObject(structuredData).photoPlan),
  };

  if (!isFrenchFireEvacuationRiskAssessment(documentType, language)) {
    return data;
  }

  const canonical = buildCanonicalFireRiskAssessmentData(formData, documentType, language);
  data.mainRiskAssessment = {
    ...data.mainRiskAssessment,
    initialAssessment: shouldReplaceRiskTable(data.mainRiskAssessment.initialAssessment, 'initialAssessment')
      ? canonical.mainRiskAssessment.initialAssessment
      : data.mainRiskAssessment.initialAssessment,
    measuresFollowUpValidation: shouldReplaceRiskTable(
      data.mainRiskAssessment.measuresFollowUpValidation,
      'measuresFollowUpValidation',
    )
      ? canonical.mainRiskAssessment.measuresFollowUpValidation
      : data.mainRiskAssessment.measuresFollowUpValidation,
  };
  data.residualRiskAnalysis = shouldReplaceRiskTable(data.residualRiskAnalysis, 'residualRiskAnalysis')
    ? canonical.residualRiskAnalysis
    : data.residualRiskAnalysis;
  data.actionPriorities = shouldReplaceRiskTable(data.actionPriorities, 'actionPriorities')
    ? canonical.actionPriorities
    : data.actionPriorities;
  data.draftActionPlan = shouldReplaceRiskTable(data.draftActionPlan, 'draftActionPlan')
    ? canonical.draftActionPlan
    : data.draftActionPlan;
  data.photoPlan = {
    ...data.photoPlan,
    photos: shouldReplaceRiskTable(data.photoPlan.photos, 'photoPlan')
      ? canonical.photoPlan.photos
      : data.photoPlan.photos,
  };
  data.hazardIdentification = shouldReplaceRiskTable(data.hazardIdentification, 'hazardIdentification')
    ? canonical.hazardIdentification
    : data.hazardIdentification;

  console.info('[RISK_COMPLETION_TRACE] ensureCompleteRiskAssessmentData applied: true');
  console.info(`[RISK_COMPLETION_TRACE] initialAssessment rows: ${data.mainRiskAssessment.initialAssessment.length}`);
  console.info(`[RISK_COMPLETION_TRACE] followUp rows: ${data.mainRiskAssessment.measuresFollowUpValidation.length}`);
  console.info(`[RISK_COMPLETION_TRACE] residual rows: ${data.residualRiskAnalysis.length}`);
  console.info(`[RISK_COMPLETION_TRACE] actionPriorities rows: ${data.actionPriorities.length}`);
  console.info(`[RISK_COMPLETION_TRACE] draftActionPlan rows: ${data.draftActionPlan.length}`);

  return data;
}

function isFrenchFireEvacuationRiskAssessment(documentType = '', language = 'fr') {
  const normalizedType = normalizeDocumentType(documentType);
  return language === 'fr' &&
    (normalizedType.includes('incendie') || normalizedType.includes('evacuation') || normalizedType.includes('fire'));
}

function buildCanonicalFireRiskAssessmentData(formData = {}, documentType = '', language = 'fr') {
  const fixedSections = buildRiskAssessmentFixedSections(formData, documentType, language);
  const risks = buildCanonicalFireEvacuationRiskRows();

  return {
    mainRiskAssessment: {
      initialAssessment: risks.map((risk) => ({
        number: risk.number,
        task: risk.task,
        hazard: risk.hazard,
        hazardousSituationOrScenario: risk.hazardousSituationOrScenario,
        possibleRiskOrHarm: risk.possibleRiskOrHarm,
        exposed: risk.exposed,
        existingMeasures: risk.existingMeasures,
        existingEvidence: risk.existingEvidence,
        observedOrDeclaredElements: risk.observedOrDeclaredElements,
        elementsToConfirm: risk.elementsToConfirm,
        severity: risk.severity,
        probability: risk.probability,
        exposure: risk.exposure,
        scoringJustification: risk.scoringJustification,
        initialScore: risk.initialScore,
        initialLevel: risk.initialLevel,
      })),
      measuresFollowUpValidation: risks.map((risk) => ({
        number: risk.number,
        additionalMeasure: risk.additionalMeasure,
        stopLevel: risk.stopLevel,
        responsible: risk.responsible,
        deadline: risk.deadline,
        residualScore: risk.residualScore,
        residualLevel: risk.residualLevel,
        residualScoreJustification: risk.residualScoreJustification,
        expectedEvidence: risk.expectedEvidence,
        photoToInsert: risk.photoToInsert,
        annexToAttach: risk.annexToAttach,
        priority: risk.priority,
        blockingPoint: risk.blockingPoint,
        externalAdvice: risk.externalAdvice,
      })),
    },
    residualRiskAnalysis: risks.map((risk) => ({
      mainRisk: risk.hazard,
      initialScore: risk.initialScore,
      residualScore: risk.residualScore,
      reductionCondition: risk.residualScoreJustification,
      requiredEvidence: risk.expectedEvidence,
      standardStatus: getFallbackPhrase('standardStatus', language),
      blockingPoint: risk.blockingPoint,
      externalAdvice: risk.externalAdvice,
    })),
    actionPriorities: risks.map((risk) => ({
      action: risk.additionalMeasure,
      relatedRisk: risk.hazard,
      responsible: risk.responsible,
      deadline: risk.deadline,
      expectedEvidence: risk.expectedEvidence,
      blockingPoint: risk.blockingPoint,
      externalAdvice: risk.externalAdvice,
      actionType: risk.stopLevel,
    })),
    draftActionPlan: risks.map((risk) => ({
      relatedRisk: risk.hazard,
      actionToPerform: risk.additionalMeasure,
      responsible: risk.responsible,
      deadline: risk.deadline,
      expectedEvidence: risk.expectedEvidence,
      photoAfterCorrection: risk.photoToInsert,
      standardStatus: getFallbackPhrase('standardStatus', language),
      paaOrPgpLink: getFallbackPhrase('priority', language),
      blockingPoint: risk.blockingPoint,
      externalAdvice: risk.externalAdvice,
    })),
    photoPlan: {
      ...fixedSections.photoPlan,
      photos: risks.map((risk) => ({
        photoNumber: risk.number,
        areaOrTask: risk.task,
        whatPhotoMustShow: risk.photoToInsert,
        whyUseful: 'Confirmer le danger, les mesures existantes et la priorité.',
        whereToInsert: `Risque ${risk.number} et annexe photos.`,
        alsoAnnex: 'Oui',
        confidentialityPrecautions: 'Cadrage sans personne identifiable si possible.',
        relatedRisk: risk.hazard,
        relatedAction: risk.additionalMeasure,
        expectedEvidence: risk.expectedEvidence,
        relatedAnnex: risk.annexToAttach,
        beforeAfter: 'Avant et après correction si action réalisée.',
      })),
    },
    hazardIdentification: risks.map((risk) => ({
      hazardFamily: getRiskFamilyLabel(documentType, language),
      preciseHazard: risk.hazard,
      plausibleScenario: risk.hazardousSituationOrScenario,
      areaOrTask: risk.task,
      exposedPersons: risk.exposed,
      aggravatingFactors: risk.elementsToConfirm,
      knownExistingMeasures: risk.existingMeasures,
      evidenceToCheck: risk.existingEvidence,
      whatAdvisorMustDo: risk.elementsToConfirm,
      whereToDocumentEvidence: `Risque ${risk.number}, plan d’action et annexes.`,
      blockingBeforeValidation: risk.blockingPoint,
      photosToTake: risk.photoToInsert,
    })),
  };
}

function buildCanonicalFireEvacuationRiskRows() {
  return buildFireEvacuationFallbackRiskDetails().map((risk, index) => ({
    number: String(index + 1),
    ...risk,
    riskName: risk.hazard,
    hazard: risk.danger || risk.hazard,
  }));
}

function shouldReplaceRiskTable(rows, rowType = '') {
  const values = ensureArray(rows);

  if (values.length < 8) {
    return true;
  }

  const firstEight = values.slice(0, 8);
  return firstEight.some((row) => isIncompleteRiskRow(row, rowType));
}

function isIncompleteRiskRow(row, rowType = '') {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return true;
  }

  const entries = Object.entries(row);
  if (entries.length === 0) {
    return true;
  }

  const meaningfulEntries = entries.filter(([key]) => key !== 'number' && key !== 'photoNumber');
  const incompleteCount = meaningfulEntries.filter(([_key, value]) => isIncompleteRiskCell(value)).length;
  const incompleteRatio = meaningfulEntries.length === 0 ? 1 : incompleteCount / meaningfulEntries.length;

  if (incompleteRatio > 0.4) {
    return true;
  }

  if (meaningfulEntries.every(([_key, value]) => isIncompleteRiskCell(value))) {
    return true;
  }

  if (
    rowType === 'initialAssessment' &&
    ['task', 'hazard', 'hazardousSituationOrScenario', 'possibleRiskOrHarm'].some((key) => isIncompleteRiskCell(row[key]))
  ) {
    return true;
  }

  if (
    rowType === 'measuresFollowUpValidation' &&
    ['additionalMeasure', 'responsible', 'expectedEvidence'].some((key) => isIncompleteRiskCell(row[key]))
  ) {
    return true;
  }

  if (
    (rowType === 'actionPriorities' || rowType === 'draftActionPlan') &&
    isIncompleteRiskCell(row.relatedRisk)
  ) {
    return true;
  }

  return false;
}

function isIncompleteRiskCell(value) {
  const normalized = normalizeTableHeader(String(value ?? '').trim());
  const incompleteValues = new Set([
    '',
    'a completer',
    'à completer',
    'à compléter',
    'to complete',
    'to be completed',
    'aan te vullen',
    'zu ergänzen',
    'zu erganzen',
    'a determiner',
    'à déterminer',
    'to be determined',
    'te bepalen',
    'zu bestimmen',
    'undefined',
    'null',
  ].map(normalizeTableHeader));

  return incompleteValues.has(normalized);
}

function completeRowsWithFallback(rows, fallbackRows, language = 'fr', numberKey = null) {
  const sourceRows = ensureArray(rows).map(ensureObject);
  const fallback = ensureArray(fallbackRows).map(ensureObject);
  const maxLength = Math.max(sourceRows.length, fallback.length);

  return Array.from({ length: maxLength }, (_unused, index) => {
    const fallbackRow = fallback[index] || {};
    const sourceRow = findMatchingRiskRow(sourceRows, fallbackRow, index, numberKey) || {};
    return mergeRiskFallbackRow(sourceRow, fallbackRow, language);
  }).slice(0, 8);
}

function findMatchingRiskRow(rows, fallbackRow, index, numberKey = null) {
  if (numberKey) {
    const fallbackNumber = cleanRiskNumber(fallbackRow[numberKey], index + 1);
    return rows.find((row, rowIndex) => cleanRiskNumber(row[numberKey], rowIndex + 1) === fallbackNumber) || rows[index];
  }

  const fallbackNumber = extractRiskNumberFromRow(fallbackRow);
  if (fallbackNumber) {
    return rows.find((row) => extractRiskNumberFromRow(row) === fallbackNumber) || rows[index];
  }

  return rows[index];
}

function extractRiskNumberFromRow(row) {
  const values = Object.values(ensureObject(row)).map((value) => String(value || '').trim());
  const numbered = values.find((value) => /^\d{1,2}(?:\.|\s)/.test(value));
  return numbered?.match(/^(\d{1,2})/)?.[1] || '';
}

function mergeRiskFallbackRow(row, fallbackRow, language = 'fr') {
  const merged = { ...ensureObject(fallbackRow), ...ensureObject(row) };

  for (const key of Object.keys(ensureObject(fallbackRow))) {
    if (isIncompleteRiskValueForKey(key, merged[key], language)) {
      merged[key] = fallbackRow[key];
    }
  }

  return merged;
}

function isIncompleteRiskValueForKey(key, value, language = 'fr') {
  const cleaned = String(value ?? '').trim();

  if ((key === 'relatedRisk' || key === 'mainRisk') && /^\d{1,2}$/.test(cleaned)) {
    return true;
  }

  return isIncompleteRiskValue(value, language);
}

function isIncompleteRiskValue(value, language = 'fr') {
  const cleaned = String(value ?? '').trim();
  const placeholders = [
    getLanguagePlaceholder(language),
    getFallbackPhrase('toDetermine', language),
    'À compléter',
    'À déterminer',
    'To be completed',
    'To be determined',
    'Aan te vullen',
    'Te bepalen',
    'Zu ergänzen',
    'Zu bestimmen',
  ];

  return !cleaned || placeholders.includes(cleaned);
}

function buildStructuredRiskRowsFromFlatRisk(row, language = 'fr') {
  const number = cleanRiskNumber(row.number);
  const initial = {
    number,
    task: row.task,
    hazard: row.hazard,
    hazardousSituationOrScenario: row.hazardousSituationOrScenario,
    possibleRiskOrHarm: row.possibleRiskOrHarm,
    exposed: row.exposed,
    existingMeasures: row.existingMeasures,
    existingEvidence: row.existingEvidence,
    observedOrDeclaredElements: row.observedOrDeclaredElements,
    elementsToConfirm: row.elementsToConfirm,
    severity: row.severity,
    probability: row.probability,
    exposure: row.exposure,
    scoringJustification: row.scoringJustification,
    initialScore: row.initialScore,
    initialLevel: row.initialLevel,
  };
  const followUp = {
    number,
    additionalMeasure: row.additionalMeasure,
    stopLevel: normalizeStructuredStopLevel(row.stopLevel, language),
    responsible: row.responsible,
    deadline: row.deadline,
    residualScore: row.residualScore,
    residualLevel: row.residualLevel,
    residualScoreJustification: row.residualScoreJustification,
    expectedEvidence: row.expectedEvidence,
    photoToInsert: row.photoToInsert,
    annexToAttach: row.annexToAttach,
    priority: row.priority,
    blockingPoint: row.blockingPoint,
    externalAdvice: row.externalAdvice,
  };

  return {
    initial,
    followUp,
    residual: {
      mainRisk: row.hazard || row.possibleRiskOrHarm,
      initialScore: row.initialScore,
      residualScore: row.residualScore,
      reductionCondition: row.additionalMeasure,
      requiredEvidence: row.expectedEvidence,
      standardStatus: getFallbackPhrase('standardStatus', language),
      blockingPoint: row.blockingPoint,
      externalAdvice: row.externalAdvice,
    },
  };
}

function buildEmptyFlatRisk(number, placeholder, language = 'fr') {
  const initialScore = '27';
  const residualScore = '9';

  return {
    number,
    task: placeholder,
    hazard: placeholder,
    hazardousSituationOrScenario: placeholder,
    possibleRiskOrHarm: placeholder,
    exposed: placeholder,
    existingMeasures: placeholder,
    existingEvidence: placeholder,
    observedOrDeclaredElements: placeholder,
    elementsToConfirm: placeholder,
    severity: '3',
    probability: '3',
    exposure: '3',
    scoringJustification: placeholder,
    initialScore,
    initialLevel: getRiskLevel(Number(initialScore), language),
    additionalMeasure: placeholder,
    stopLevel: placeholder,
    responsible: placeholder,
    deadline: placeholder,
    residualScore,
    residualLevel: getRiskLevel(Number(residualScore), language),
    residualScoreJustification: placeholder,
    expectedEvidence: placeholder,
    photoToInsert: placeholder,
    annexToAttach: placeholder,
    priority: placeholder,
    blockingPoint: placeholder,
    externalAdvice: placeholder,
  };
}

function buildRiskAssessmentFixedSections(formData = {}, documentType = '', language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const placeholder = getLanguagePlaceholder(language);
  const pick = (...keys) => keys.map((key) => formData?.[key]).find(hasUsableStringValue) || placeholder;
  const sector = pick('secteurActivite', 'sector', 'activitySector');
  const site = pick('siteLieuTravail', 'site', 'lieu');
  const activity = pick('activitePoste', 'activite', 'descriptionActivite', 'context');
  const exposed = pick('travailleursExposes', 'nombreTravailleurs');
  const equipment = pick('machinesEquipements');
  const products = pick('produitsDangereux');
  const measures = pick('mesuresExistantes');
  const incidents = pick('accidentsIncidents');
  const cppt = pick('presenceCppt');
  const preventionService = pick('serviceInterneExterne');
  const constraints = pick('contraintesParticulieres', 'informationsComplementaires');
  const riskDetails = getFallbackRiskDetailsForDocument(documentType, formData, language).slice(0, 8);
  const riskNames = riskDetails.map((risk) => risk.hazard);
  const reference = resolveRiskAssessmentReference(formData, {
    documentIdentification: { type: documentType, site, company: sector },
  });

  return {
    documentIdentification: {
      type: documentType || config.title,
      reference,
      company: sector,
      site,
      services: preventionService,
      author: 'PreventIA Belgique',
      version: config.draftSuffix,
      visitDate: formatRiskAssessmentDate(new Date(), language),
      fieldCheckNote: 'Visite terrain, photos et preuves documentaires à confirmer avant validation.',
    },
    contextObjective: `Projet d’analyse de risques pour ${activity}. L’objectif est d’identifier les dangers principaux, de prioriser les mesures et de préparer les validations nécessaires sans conclure à une conformité définitive.`,
    regulatoryReferences: buildDeterministicRegulatoryReferences(documentType, language),
    glossary: buildDeterministicGlossary(language),
    scope: {
      includedPlaces: [site],
      excludedPlaces: ['Zones non décrites dans le formulaire ou non vérifiées sur site.'],
      activities: [activity],
      exposedJobs: [exposed],
      includedSituations: riskNames,
      scopeLimits: ['Analyse préparatoire basée sur les informations déclarées, à compléter par visite terrain et preuves.'],
    },
    informationSources: [
      buildSourceRow('Formulaire PreventIA', 'Oui', 'Données déclarées par le demandeur.', 'Formulaire conservé avec le dossier.', 'Dossier prévention', language),
      buildSourceRow('Visite terrain', 'À obtenir', 'Observation des zones, tâches et mesures existantes.', 'Rapport de visite et photos datées.', 'Annexes', language),
      buildSourceRow('Preuves des mesures existantes', 'À obtenir', measures, 'Rapports de contrôle, registres, photos ou attestations.', 'Annexes', language),
      buildSourceRow('Accidents ou incidents', 'À vérifier', incidents, 'Registre accidents/incidents et actions correctives.', 'Dossier prévention', language),
      buildSourceRow('Documents produits ou équipements', 'À vérifier', `${products}; ${equipment}`, 'FDS, notices, certificats et rapports de contrôle.', 'Annexes', language),
    ],
    assumptionsLimitations: {
      factsProvided: [sector, site, activity, exposed],
      partialObservations: ['Aucune observation terrain complète n’est garantie par la génération backend.'],
      missingInformation: ['Photos terrain, preuves documentaires, consultation travailleurs/CPPT et avis spécialisés si nécessaires.'],
      pointsToValidate: ['Cotation G x P x E, efficacité des mesures existantes, preuves attendues et responsabilités.'],
      limits: [constraints],
    },
    jobsTasksExposedWorkers: [
      {
        jobOrTask: activity,
        realActivityDescription: activity,
        frequency: 'Fréquence à confirmer sur le terrain.',
        exposureDuration: 'Durée d’exposition à préciser.',
        exposedWorkers: exposed,
        equipmentOrProductsUsed: `${equipment}; ${products}`,
        particularities: constraints,
        photosToTake: 'Vue générale du poste, danger, mesure existante et preuve après correction.',
        documentsToAttach: 'FDS, notices, rapports de contrôle, consignes et registres de formation.',
      },
    ],
    photoPlan: {
      intro: 'Plan photos à compléter par des images datées, non identifiantes et liées aux risques numérotés.',
      confidentialityRules: [
        'Éviter les visages et données personnelles non nécessaires.',
        'Photographier la zone, le danger, la mesure existante et la preuve après correction.',
      ],
      photos: riskDetails.map((risk, index) => ({
        photoNumber: String(index + 1),
        areaOrTask: risk.task || activity,
        whatPhotoMustShow: risk.photoToInsert || risk.hazard,
        whyUseful: 'Confirmer le danger, les mesures existantes et la priorité.',
        whereToInsert: `Risque ${index + 1} et annexe photos.`,
        alsoAnnex: 'Oui',
        confidentialityPrecautions: 'Cadrage sans personne identifiable si possible.',
        relatedRisk: `${index + 1}. ${risk.hazard}`,
        relatedAction: risk.additionalMeasure || 'Mesure complémentaire correspondante.',
        expectedEvidence: risk.expectedEvidence || 'Photo datée avant/après et preuve documentaire.',
        relatedAnnex: risk.annexToAttach || `Annexe photo ${index + 1}`,
        beforeAfter: 'Avant et après correction si action réalisée.',
      })),
    },
    hazardIdentification: riskDetails.map((risk, index) => ({
      hazardFamily: getRiskFamilyLabel(documentType, language),
      preciseHazard: risk.danger || risk.hazard,
      plausibleScenario: risk.hazardousSituationOrScenario || `Scénario lié à ${risk.hazard}.`,
      areaOrTask: risk.task || activity,
      exposedPersons: risk.exposed || exposed,
      aggravatingFactors: constraints,
      knownExistingMeasures: risk.existingMeasures || measures,
      evidenceToCheck: risk.existingEvidence || 'Photo, rapport de contrôle, registre ou procédure applicable.',
      whatAdvisorMustDo: risk.elementsToConfirm || 'Vérifier sur site, documenter les preuves et ajuster la cotation.',
      whereToDocumentEvidence: `Risque ${index + 1}, plan d’action et annexes.`,
      blockingBeforeValidation: risk.blockingPoint || 'Oui si preuve ou visite terrain manquante.',
      photosToTake: risk.photoToInsert || `Photo du risque ${index + 1}.`,
    })),
    scoringMethod: {
      formula: 'Score = Gravité x Probabilité x Exposition',
      severityScale: ['1 faible conséquence', '3 dommage significatif', '5 dommage grave ou irréversible'],
      probabilityScale: ['1 improbable', '3 possible', '5 probable ou déjà observé'],
      exposureScale: ['1 rare', '3 régulière', '5 fréquente ou prolongée'],
      thresholds: [formatRiskScale(language)],
      confirmationNote: config.provisionalScoreText,
    },
    paaPgpLink: {
      paaActions: ['Actions urgentes, preuves manquantes et corrections à court terme.'],
      pgpActions: ['Mesures structurelles, investissements et améliorations organisationnelles.'],
      cpptRole: `Consultation CPPT à confirmer: ${cppt}.`,
      managementFollowUp: 'Suivi par la direction, la ligne hiérarchique et le service prévention.',
    },
    documentsToCreateOrUpdate: buildDocumentsToCreateOrUpdate(documentType, language),
    actorsToConsult: buildActorsToConsult(documentType, language),
    requiredAnnexes: buildRequiredAnnexes(documentType, language),
    level3AdvisorLimits: 'Le conseiller en prévention niveau 3 peut préparer l’analyse, observer, documenter, suivre les actions et signaler les points bloquants. Les risques spécialisés, graves ou insuffisamment documentés doivent être validés par une personne compétente, le service externe, le médecin du travail, un organisme agréé ou un expert selon le sujet.',
    conclusion: '',
    validationStatement: config.finalMention,
  };
}

function buildSourceRow(source, available, comment, expectedEvidence, whereToFile) {
  return {
    source,
    available,
    comment,
    expectedEvidence,
    whereToFile,
  };
}

function resolveRiskAssessmentReference(formData = {}, fallbackData = {}) {
  const candidates = [
    formData.documentReference,
    formData.reference,
    formData.savedReference,
    formData.savedDocumentReference,
    formData.documentId,
    formData.id,
  ];
  const existingReference = candidates.find(hasUsableStringValue);

  return existingReference
    ? String(existingReference).trim()
    : buildRiskAssessmentReference(fallbackData);
}

function buildDeterministicRegulatoryReferences(documentType = '', language = 'fr') {
  const references = [
    'Code belge du bien-être au travail',
    'Livre Ier, Titre 2 – Politique du bien-être et système dynamique de gestion des risques',
    'Livre III – Lieux de travail',
    'Livre IX – Protections collectives et EPI',
  ];
  const normalizedType = normalizeDocumentType(documentType);

  if (normalizedType.includes('incendie')) {
    references.push('Livre III, Titre 3 – Prévention incendie');
    references.push('Livre III, Titre 6 – Signalisation de sécurité et de santé');
  }

  if (normalizedType.includes('chimique')) {
    references.push('Livre VI – Agents chimiques');
  }

  if (normalizedType.includes('machine') || normalizedType.includes('equipement')) {
    references.push('Livre IV – Équipements de travail');
  }

  if (normalizedType.includes('ergonomie') || normalizedType.includes('manutention')) {
    references.push('Livre VIII – Ergonomie et TMS');
  }

  return [...new Set(references)].slice(0, 7).map((reference) => ({
    reference,
    whyApplicable: 'Cadre belge applicable à l’identification, l’évaluation et la prévention des risques.',
    practicalConsequence: 'Définir mesures, responsabilités, preuves et suivi.',
    documentOrEvidence: 'Analyse de risques, plan d’action, preuves et avis éventuels.',
    validationOrAdvice: 'Validation par l’employeur et le conseiller en prévention; avis spécialisé si nécessaire.',
  }));
}

function buildDeterministicGlossary(language = 'fr') {
  const stop = getAllowedStopLevels(language).join(', ');
  return [
    { abbreviation: 'PAA', definition: 'Plan Annuel d’Action.' },
    { abbreviation: 'PGP', definition: 'Plan Global de Prévention.' },
    { abbreviation: 'CPPT', definition: 'Comité pour la Prévention et la Protection au Travail, si présent.' },
    { abbreviation: 'SIPPT/SEPPT', definition: 'Service interne ou externe de prévention et protection au travail.' },
    { abbreviation: 'STOP', definition: `Hiérarchie des mesures: ${stop}.` },
    { abbreviation: 'G x P x E', definition: 'Gravité x Probabilité x Exposition.' },
  ];
}

function buildDocumentsToCreateOrUpdate(documentType = '', language = 'fr') {
  const names = [
    'Rapport de visite terrain',
    'Plan d’action signé ou validé',
    'Registre de formation ou information',
    'Photos avant/après correction',
    'Preuves des contrôles périodiques',
  ];

  if (/incendie|evacuation|évacuation/i.test(documentType)) {
    names.push('Plan d’évacuation et registre exercices incendie', 'Inventaire produits dangereux et FDS');
  } else if (/chimique|chemical/i.test(documentType)) {
    names.push('Inventaire produits chimiques', 'Fiches de données de sécurité centralisées');
  } else if (/machine|equipement|équipement/i.test(documentType)) {
    names.push('Notices machines et marquage CE', 'Procédure de consignation maintenance');
  }

  return names.slice(0, 8).map((document, index) => ({
    document,
    whyCreateOrUpdate: 'Preuve nécessaire pour valider l’analyse et suivre les actions.',
    responsible: 'SIPPT / responsable de site',
    deadline: 'À planifier',
    expectedEvidence: 'Document daté, validé et classé.',
    relatedAnnex: `Annexe ${index + 1}`,
    priority: index < 3 ? 'Prioritaire' : 'À planifier',
  }));
}

function buildActorsToConsult(documentType = '', language = 'fr') {
  const actors = [
    'Employeur ou ligne hiérarchique',
    'Conseiller en prévention interne',
    'Travailleurs concernés',
    'CPPT si présent',
    'Service externe de prévention si nécessaire',
  ];

  if (/chimique|chemical/i.test(documentType)) {
    actors.push('Médecin du travail ou hygiéniste du travail');
  }

  if (/incendie|evacuation|évacuation/i.test(documentType)) {
    actors.push('Expert incendie ou service compétent');
  }

  if (/machine|equipement|équipement/i.test(documentType)) {
    actors.push('Personne compétente machines ou organisme agréé si nécessaire');
  }

  return actors.slice(0, 8).map((actor) => ({
    actor,
    expectedRole: 'Valider les informations, mesures et preuves selon ses compétences.',
    consultationMoment: 'Avant validation finale.',
    expectedEvidence: 'Avis, PV, mail de validation ou rapport.',
    mandatoryOrRecommended: 'À confirmer selon le risque.',
    limitForLevel3Advisor: 'Avis spécialisé requis si le sujet dépasse le niveau 3.',
  }));
}

function buildRequiredAnnexes(documentType = '', language = 'fr') {
  const annexes = [
    'Photos terrain datées',
    'Rapport de visite terrain',
    'Preuves des mesures existantes',
    'Registres de formation',
    'Plan d’action validé',
  ];

  if (/incendie|evacuation|évacuation/i.test(documentType)) {
    annexes.push('Rapports extincteurs, détection, éclairage de secours et portes coupe-feu', 'Plan d’évacuation');
  } else if (/chimique|chemical/i.test(documentType)) {
    annexes.push('FDS et inventaire produits chimiques', 'Preuves stockage et étiquetage CLP');
  } else if (/machine|equipement|équipement/i.test(documentType)) {
    annexes.push('Notices, marquage CE et contrôles machines', 'Procédure consignation maintenance');
  }

  return annexes.slice(0, 8).map((annex) => ({
    annex,
    mandatoryRecommendedOrDepending: 'Recommandé ou nécessaire selon le risque.',
    whyNecessary: 'Permet de confirmer la cotation, les mesures et la validation.',
    whoProvidesIt: 'Employeur, SIPPT, responsable de site ou expert compétent.',
    whereToFile: 'Dossier prévention.',
    status: 'À obtenir ou vérifier.',
  }));
}

function getRiskFamilyLabel(documentType = '', language = 'fr') {
  const normalizedType = normalizeDocumentType(documentType);
  if (normalizedType.includes('incendie')) {
    return 'Incendie et évacuation';
  }
  if (normalizedType.includes('chimique')) {
    return 'Produits chimiques';
  }
  if (normalizedType.includes('machine') || normalizedType.includes('equipement')) {
    return 'Machines et équipements';
  }
  return 'Prévention et sécurité';
}

async function generateStructuredRiskAssessmentBlock({
  openai,
  block,
  documentType,
  formData,
  languageCode,
  languageLabel,
}) {
  if (block.key === 'C') {
    console.info('Bloc C demandé avec schéma risks simplifié');
  } else {
    console.info(`Bloc ${block.label} demandé`);
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const request = {
      model: OPENAI_MODEL,
      max_output_tokens: Math.min(OPENAI_MAX_OUTPUT_TOKENS, attempt === 1 ? 3500 : 2200),
      instructions: block.key === 'C'
        ? `${SYSTEM_PROMPT}\n\nTu dois répondre uniquement avec un objet JSON valide.`
        : SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildRiskAssessmentBlockPrompt({
                block,
                documentType,
                formData,
                languageCode,
                languageLabel,
                retry: attempt === 2,
              }),
            },
          ],
        },
      ],
    };
    const response = await createOpenAiResponseWithOptionalJsonFormat(openai, request, block.key === 'C');

    const parsed = safeParseAiJson(response.output_text);

    if (parsed.ok && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
      const data = block.key === 'C'
        ? transformSimplifiedRiskBlockC(parsed.data, languageCode)
        : parsed.data;
      console.info(`Bloc ${block.label} parsing OK`, { attempt });
      return data;
    }

    console.warn(`Bloc ${block.label} parsing KO tentative ${attempt}`, {
      attempt,
      error: parsed.ok ? 'Le bloc JSON doit être un objet.' : parsed.error,
      preview: parsed.preview,
    });
  }

  if (block.key === 'C') {
    console.warn('Bloc C fallback utile généré');
  } else {
    console.warn(`Bloc ${block.label} fallback minimal utilisé`);
  }
  return buildFallbackRiskAssessmentBlock(block.key, languageCode, formData, documentType);
}

async function createOpenAiResponseWithOptionalJsonFormat(openai, request, useJsonFormat = false) {
  if (!useJsonFormat) {
    return openai.responses.create(request);
  }

  return openai.responses.create(request);
}

function safeParseAiJson(rawContent) {
  if (!rawContent) {
    return {
      ok: false,
      error: 'Contenu IA vide',
      preview: '',
    };
  }

  const preview = String(rawContent).slice(0, 1000);
  const cleaned = String(rawContent)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const extracted = firstBrace >= 0 && lastBrace > firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;
  const candidates = [
    extracted,
    extracted
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1'),
  ];

  for (const candidate of candidates) {
    try {
      return {
        ok: true,
        data: JSON.parse(candidate),
      };
    } catch (error) {
      if (candidate === candidates[candidates.length - 1]) {
        return {
          ok: false,
          error: error.message,
          preview,
        };
      }
    }
  }

  return {
    ok: false,
    error: 'JSON invalide',
    preview,
  };
}

function parseRiskAssessmentStructuredOutput(outputText, language = 'fr') {
  const parsed = safeParseAiJson(outputText);

  if (parsed.ok) {
    return parsed.data;
  }

  console.warn('Parsing JSON analyse de risques KO', {
    error: parsed.error,
    preview: parsed.preview,
  });

  return buildFallbackStructuredRiskAssessment(language);
}

function validateRiskAssessmentStructuredData(data, language = 'fr') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error('La génération structurée de l’analyse de risques est vide ou invalide.');
    error.status = 502;
    error.expose = true;
    throw error;
  }

  const validated = {
    ...data,
    documentIdentification: ensureObject(data.documentIdentification),
    contextObjective: ensureString(data.contextObjective),
    regulatoryReferences: ensureArray(data.regulatoryReferences),
    glossary: ensureArray(data.glossary),
    scope: ensureObject(data.scope),
    informationSources: ensureArray(data.informationSources),
    assumptionsLimitations: ensureObject(data.assumptionsLimitations),
    jobsTasksExposedWorkers: ensureArray(data.jobsTasksExposedWorkers),
    photoPlan: ensureObject(data.photoPlan),
    hazardIdentification: ensureArray(data.hazardIdentification),
    scoringMethod: ensureObject(data.scoringMethod),
    mainRiskAssessment: ensureObject(data.mainRiskAssessment),
    residualRiskAnalysis: ensureArray(data.residualRiskAnalysis),
    actionPriorities: ensureArray(data.actionPriorities),
    draftActionPlan: ensureArray(data.draftActionPlan),
    paaPgpLink: ensureObject(data.paaPgpLink),
    documentsToCreateOrUpdate: ensureArray(data.documentsToCreateOrUpdate),
    actorsToConsult: ensureArray(data.actorsToConsult),
    requiredAnnexes: ensureArray(data.requiredAnnexes),
    level3AdvisorLimits: ensureString(data.level3AdvisorLimits),
    blockingPointsBeforeValidation: ensureArray(data.blockingPointsBeforeValidation),
    conclusion: ensureString(data.conclusion),
    validationStatement: ensureString(data.validationStatement) || (LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr).finalMention,
  };

  validated.photoPlan.confidentialityRules = ensureArray(validated.photoPlan.confidentialityRules);
  validated.photoPlan.photos = ensureArray(validated.photoPlan.photos);
  validated.mainRiskAssessment.initialAssessment = ensureArray(validated.mainRiskAssessment.initialAssessment);
  validated.mainRiskAssessment.measuresFollowUpValidation = ensureArray(
    validated.mainRiskAssessment.measuresFollowUpValidation,
  );

  alignRiskAssessmentRows(validated, language);
  validated.mainRiskAssessment.measuresFollowUpValidation =
    validated.mainRiskAssessment.measuresFollowUpValidation.map((row) => ({
      ...ensureObject(row),
      stopLevel: normalizeStructuredStopLevel(ensureObject(row).stopLevel, language),
    }));
  hydrateRiskDerivedCollections(validated, language);
  cleanRiskAssessmentBlockCFields(validated, language);
  console.info('Nombre de risques dans bloc C final', {
    count: validated.mainRiskAssessment.initialAssessment.length,
  });

  if (looksLikeMarkdownTable(validated.conclusion)) {
    validated.conclusion = '';
  }

  validated.validationStatement = (LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr).finalMention;

  return validated;
}

function alignRiskAssessmentRows(data, language = 'fr') {
  const placeholder = getLanguagePlaceholder(language);
  const initialRows = data.mainRiskAssessment.initialAssessment.map(ensureObject);
  const followUpRows = data.mainRiskAssessment.measuresFollowUpValidation.map(ensureObject);
  const numbers = new Set();

  initialRows.forEach((row, index) => numbers.add(cleanRiskNumber(row.number, index + 1)));
  followUpRows.forEach((row, index) => numbers.add(cleanRiskNumber(row.number, index + 1)));

  if (numbers.size === 0) {
    for (let index = 1; index <= 8; index += 1) {
      numbers.add(String(index));
    }
  }

  const sortedNumbers = [...numbers].sort((left, right) => Number(left) - Number(right));
  data.mainRiskAssessment.initialAssessment = sortedNumbers.map((number) => ({
    ...buildEmptyInitialRiskRow(number, placeholder),
    ...initialRows.find((row) => cleanRiskNumber(row.number) === number),
    number,
  }));
  data.mainRiskAssessment.measuresFollowUpValidation = sortedNumbers.map((number) => ({
    ...buildEmptyFollowUpRiskRow(number, placeholder),
    ...followUpRows.find((row) => cleanRiskNumber(row.number) === number),
    number,
  }));
}

function hydrateRiskDerivedCollections(data, language = 'fr') {
  const initialRows = ensureArray(ensureObject(data.mainRiskAssessment).initialAssessment).map(ensureObject);
  const followUpRows = ensureArray(ensureObject(data.mainRiskAssessment).measuresFollowUpValidation).map(ensureObject);
  const rows = initialRows.slice(0, 8).map((initial, index) => {
    const number = cleanRiskNumber(initial.number, index + 1);
    const followUp = followUpRows.find((row) => cleanRiskNumber(row.number) === number) || followUpRows[index] || {};
    const mainRisk = `${number}. ${initial.hazard || initial.possibleRiskOrHarm || getLanguagePlaceholder(language)}`;

    return {
      number,
      mainRisk,
      initial,
      followUp,
      residual: {
        mainRisk,
        initialScore: initial.initialScore,
        residualScore: followUp.residualScore,
        reductionCondition: followUp.residualScoreJustification || followUp.additionalMeasure,
        requiredEvidence: followUp.expectedEvidence,
        standardStatus: getFallbackPhrase('standardStatus', language),
        blockingPoint: followUp.blockingPoint,
        externalAdvice: followUp.externalAdvice,
      },
      actionPriority: {
        action: followUp.additionalMeasure,
        relatedRisk: mainRisk,
        responsible: followUp.responsible,
        deadline: followUp.deadline,
        expectedEvidence: followUp.expectedEvidence,
        blockingPoint: followUp.blockingPoint,
        externalAdvice: followUp.externalAdvice,
        actionType: followUp.stopLevel,
      },
      draftAction: {
        relatedRisk: mainRisk,
        actionToPerform: followUp.additionalMeasure,
        responsible: followUp.responsible,
        deadline: followUp.deadline,
        expectedEvidence: followUp.expectedEvidence,
        photoAfterCorrection: followUp.photoToInsert,
        standardStatus: getFallbackPhrase('standardStatus', language),
        paaOrPgpLink: followUp.priority,
        blockingPoint: followUp.blockingPoint,
        externalAdvice: followUp.externalAdvice,
      },
    };
  });

  data.residualRiskAnalysis = completeRowsWithFallback(
    ensureArray(data.residualRiskAnalysis),
    rows.map((row) => row.residual),
    language,
  );
  data.actionPriorities = completeRowsWithFallback(
    ensureArray(data.actionPriorities),
    rows.map((row) => row.actionPriority),
    language,
  );
  data.draftActionPlan = completeRowsWithFallback(
    ensureArray(data.draftActionPlan),
    rows.map((row) => row.draftAction),
    language,
  );
}

function cleanRiskNumber(value, fallback = 1) {
  const raw = String(value || '').trim();
  return raw || String(fallback);
}

function buildEmptyInitialRiskRow(number, placeholder) {
  return {
    number,
    task: placeholder,
    hazard: placeholder,
    hazardousSituationOrScenario: placeholder,
    possibleRiskOrHarm: placeholder,
    exposed: placeholder,
    existingMeasures: placeholder,
    existingEvidence: placeholder,
    observedOrDeclaredElements: placeholder,
    elementsToConfirm: placeholder,
    severity: placeholder,
    probability: placeholder,
    exposure: placeholder,
    scoringJustification: placeholder,
    initialScore: placeholder,
    initialLevel: placeholder,
  };
}

function buildEmptyFollowUpRiskRow(number, placeholder) {
  return {
    number,
    additionalMeasure: placeholder,
    stopLevel: placeholder,
    responsible: placeholder,
    deadline: placeholder,
    residualScore: placeholder,
    residualLevel: placeholder,
    residualScoreJustification: placeholder,
    expectedEvidence: placeholder,
    photoToInsert: placeholder,
    annexToAttach: placeholder,
    priority: placeholder,
    blockingPoint: placeholder,
    externalAdvice: placeholder,
  };
}

function cleanRiskAssessmentBlockCFields(data, language = 'fr') {
  data.mainRiskAssessment.initialAssessment = ensureArray(data.mainRiskAssessment.initialAssessment)
    .slice(0, 8)
    .map((row, index) => cleanRiskBlockRow(row, language, cleanRiskNumber(ensureObject(row).number, index + 1)));
  data.mainRiskAssessment.measuresFollowUpValidation = ensureArray(data.mainRiskAssessment.measuresFollowUpValidation)
    .slice(0, 8)
    .map((row, index) => {
      const cleaned = cleanRiskBlockRow(row, language, cleanRiskNumber(ensureObject(row).number, index + 1));
      return {
        ...cleaned,
        stopLevel: normalizeStructuredStopLevel(cleaned.stopLevel, language),
      };
    });
  data.residualRiskAnalysis = ensureArray(data.residualRiskAnalysis)
    .slice(0, 8)
    .map((row) => cleanRiskBlockRow(row, language));
}

function cleanRiskBlockRow(row, language = 'fr', number = null) {
  const cleaned = Object.entries(ensureObject(row)).reduce((result, [key, value]) => ({
    ...result,
    [key]: sanitizeCompactRiskValue(value, language),
  }), {});

  if (number !== null) {
    cleaned.number = sanitizeCompactRiskValue(number, language, 24);
  }

  return cleaned;
}

function sanitizeCompactRiskValue(value, language = 'fr', maxLength = 180) {
  const cleaned = sanitizeMarkdownCell(value, language)
    .replace(/---+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return truncateTextAtWord(cleaned, maxLength);
}

function truncateTextAtWord(value, maxLength = 180) {
  if (typeof value !== 'string' || value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength + 1);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutIndex = lastSpace >= Math.floor(maxLength * 0.65) ? lastSpace : maxLength;

  return `${value.slice(0, cutIndex).trim()}...`;
}

function renderRiskAssessmentMarkdown(data, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const tableColumns = buildRiskSupportTableColumns(language);
  const reference = sanitizeMarkdownCell(data.documentIdentification.reference || buildRiskAssessmentReference(data), language);
  const date = sanitizeMarkdownCell(data.documentIdentification.visitDate || formatRiskAssessmentDate(new Date(), language), language);
  const lines = [
    titles.documentTitle,
    `${titles.referenceLabel} : ${reference}`,
    `${titles.dateLabel} : ${date}`,
    '',
  ];

  console.info('Using deterministic risk assessment renderer v2');

  const section = (index) => {
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }

    lines.push(`## ${index}. ${titles.sections[index - 1]}`);
    lines.push('');
  };

  section(1);
  lines.push(renderKeyValueTable(data.documentIdentification, getRiskIdentificationEntries(language), language));

  section(2);
  lines.push(renderParagraph(data.contextObjective, language));

  section(3);
  lines.push(renderTable(tableColumns.reference, data.regulatoryReferences, [
    'reference',
    'whyApplicable',
    'practicalConsequence',
    'documentOrEvidence',
    'validationOrAdvice',
  ], language));

  section(4);
  lines.push(renderTable('Abréviation | Définition', data.glossary, ['abbreviation', 'definition'], language));

  section(5);
  lines.push(renderScope(data.scope, language));

  section(6);
  lines.push(renderTable(tableColumns.sources, data.informationSources, [
    'source',
    'available',
    'comment',
    'expectedEvidence',
    'whereToFile',
  ], language));

  section(7);
  lines.push(renderAssumptions(data.assumptionsLimitations, language));

  section(8);
  lines.push(renderTable(tableColumns.jobs, data.jobsTasksExposedWorkers, [
    'jobOrTask',
    'realActivityDescription',
    'frequency',
    'exposureDuration',
    'exposedWorkers',
    'equipmentOrProductsUsed',
    'particularities',
    'photosToTake',
    'documentsToAttach',
  ], language));

  section(9);
  lines.push(renderParagraph(data.photoPlan.intro, language));
  lines.push(renderBulletList(data.photoPlan.confidentialityRules, language));
  lines.push(renderTable(tableColumns.photos, data.photoPlan.photos, [
    'photoNumber',
    'areaOrTask',
    'whatPhotoMustShow',
    'whyUseful',
    'whereToInsert',
    'alsoAnnex',
    'confidentialityPrecautions',
    'relatedRisk',
    'relatedAction',
    'expectedEvidence',
    'relatedAnnex',
    'beforeAfter',
  ], language));

  section(10);
  lines.push(renderTable(config.hazardTableColumns, data.hazardIdentification, [
    'hazardFamily',
    'preciseHazard',
    'plausibleScenario',
    'areaOrTask',
    'exposedPersons',
    'aggravatingFactors',
    'knownExistingMeasures',
    'evidenceToCheck',
    'whatAdvisorMustDo',
    'whereToDocumentEvidence',
    'blockingBeforeValidation',
    'photosToTake',
  ], language));

  section(11);
  lines.push(renderScoringMethod(data.scoringMethod, language));

  section(12);
  lines.push(config.riskLinkingSentence);
  lines.push('');
  lines.push(`### 12.1 ${config.riskInitialSubsectionTitle}`);
  lines.push('');
  const initialRows = data.mainRiskAssessment.initialAssessment;
  const followUpRows = data.mainRiskAssessment.measuresFollowUpValidation;
  const section121Table = renderMarkdownTable(config.riskInitialTableColumns, initialRows, [
    'number',
    'task',
    'hazard',
    'hazardousSituationOrScenario',
    'possibleRiskOrHarm',
    'exposed',
    'existingMeasures',
    'existingEvidence',
    'observedOrDeclaredElements',
    'elementsToConfirm',
    'severity',
    'probability',
    'exposure',
    'scoringJustification',
    'initialScore',
    'initialLevel',
  ], language);
  lines.push(section121Table);
  lines.push('');
  lines.push(`### 12.2 ${config.riskFollowUpSubsectionTitle}`);
  lines.push('');
  const section122Table = renderMarkdownTable(config.riskFollowUpTableColumns, followUpRows, [
    'number',
    'additionalMeasure',
    'stopLevel',
    'responsible',
    'deadline',
    'residualScore',
    'residualLevel',
    'residualScoreJustification',
    'expectedEvidence',
    'photoToInsert',
    'annexToAttach',
    'priority',
    'blockingPoint',
    'externalAdvice',
  ], language);
  lines.push(section122Table);

  section(13);
  lines.push(renderTable(config.residualTableColumns, data.residualRiskAnalysis, [
    'mainRisk',
    'initialScore',
    'residualScore',
    'reductionCondition',
    'requiredEvidence',
    'standardStatus',
    'blockingPoint',
    'externalAdvice',
  ], language));

  section(14);
  lines.push(renderTable(
    'Action | Risque concerné | Responsable | Échéance | Preuve attendue | Point bloquant oui/non | Avis externe oui/non | Type d’action',
    data.actionPriorities,
    ['action', 'relatedRisk', 'responsible', 'deadline', 'expectedEvidence', 'blockingPoint', 'externalAdvice', 'actionType'],
    language,
  ));

  section(15);
  lines.push(renderTable(config.actionTableColumns, data.draftActionPlan, [
    'relatedRisk',
    'actionToPerform',
    'responsible',
    'deadline',
    'expectedEvidence',
    'photoAfterCorrection',
    'standardStatus',
    'paaOrPgpLink',
    'blockingPoint',
    'externalAdvice',
  ], language));

  section(16);
  lines.push(renderPaaPgpLink(data.paaPgpLink, language));

  section(17);
  lines.push(renderTable(tableColumns.documents, data.documentsToCreateOrUpdate, [
    'document',
    'whyCreateOrUpdate',
    'responsible',
    'deadline',
    'expectedEvidence',
    'relatedAnnex',
    'priority',
  ], language));

  section(18);
  lines.push(renderTable(tableColumns.actors, data.actorsToConsult, [
    'actor',
    'expectedRole',
    'consultationMoment',
    'expectedEvidence',
    'mandatoryOrRecommended',
    'limitForLevel3Advisor',
  ], language));

  section(19);
  lines.push(renderTable(tableColumns.annexes, data.requiredAnnexes, [
    'annex',
    'mandatoryRecommendedOrDepending',
    'whyNecessary',
    'whoProvidesIt',
    'whereToFile',
    'status',
  ], language));

  section(20);
  lines.push(renderParagraph(data.level3AdvisorLimits, language));

  section(21);
  lines.push(renderTable(tableColumns.blockers, data.blockingPointsBeforeValidation, [
    'point',
    'point',
    'whyBlocking',
    'expectedEvidence',
    'responsible',
    'deadline',
    'externalAdvice',
    'liftingCondition',
  ], language));

  section(22);
  lines.push(renderParagraph(getRiskAssessmentConclusion(data, language), language));

  section(23);
  lines.push(config.finalMention);

  return ensureRiskAssessmentSection12Integrity(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), data, language);
}

function renderRiskAssessmentFinalMarkdown(data, language = 'fr') {
  console.log('[RISK_RENDER_TRACE] using function: renderRiskAssessmentFinalMarkdown');
  const rendered = renderRiskAssessmentMarkdown(data, language);
  const normalized = ensureRiskAssessmentSection12Integrity(rendered, data, language);

  if (language !== 'fr') {
    return normalized;
  }

  return stripMarkdownHeadingMarkers(normalized);
}

function stripMarkdownHeadingMarkers(markdown) {
  return String(markdown || '')
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+((?:\d{1,2}\.)|(?:\d{1,2}\.\d))\s+/, '$1 '))
    .join('\n');
}

function getRiskIdentificationEntries(language = 'fr') {
  const labels = {
    fr: [
      ['type', 'Type'],
      ['reference', 'Référence'],
      ['company', 'Entreprise ou secteur'],
      ['site', 'Site'],
      ['services', 'Service prévention'],
      ['author', 'Auteur'],
      ['version', 'Version'],
      ['visitDate', 'Date'],
      ['fieldCheckNote', 'Note de vérification terrain'],
    ],
    nl: [
      ['type', 'Type'],
      ['reference', 'Referentie'],
      ['company', 'Onderneming of sector'],
      ['site', 'Site'],
      ['services', 'Preventiedienst'],
      ['author', 'Auteur'],
      ['version', 'Versie'],
      ['visitDate', 'Datum'],
      ['fieldCheckNote', 'Nota terreincontrole'],
    ],
    en: [
      ['type', 'Type'],
      ['reference', 'Reference'],
      ['company', 'Company or sector'],
      ['site', 'Site'],
      ['services', 'Prevention service'],
      ['author', 'Author'],
      ['version', 'Version'],
      ['visitDate', 'Date'],
      ['fieldCheckNote', 'Field check note'],
    ],
    de: [
      ['type', 'Typ'],
      ['reference', 'Referenz'],
      ['company', 'Unternehmen oder Sektor'],
      ['site', 'Standort'],
      ['services', 'Präventionsdienst'],
      ['author', 'Autor'],
      ['version', 'Version'],
      ['visitDate', 'Datum'],
      ['fieldCheckNote', 'Hinweis zur Vor-Ort-Prüfung'],
    ],
  };

  return labels[language] || labels.fr;
}

function buildRiskAssessmentReference(data = {}) {
  const year = new Date().getFullYear();
  const raw = JSON.stringify(data.documentIdentification || data).split('').reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const number = String((raw % 9999) + 1).padStart(4, '0');
  return `AR-${year}-${number}`;
}

function formatRiskAssessmentDate(date = new Date(), language = 'fr') {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  if (language === 'en') {
    return `${year}-${month}-${day}`;
  }

  return `${day}/${month}/${year}`;
}

function getRiskAssessmentConclusion(data, language = 'fr') {
  const conclusion = ensureString(data.conclusion).trim();

  if (conclusion.length >= 120 && !conclusion.includes('|')) {
    return conclusion;
  }

  return buildStructuredFallbackRiskConclusion(data, language);
}

function ensureRiskAssessmentSection12Integrity(markdown, data, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const section122Heading = `### 12.2 ${config.riskFollowUpSubsectionTitle}`;
  const section13Heading = `## 13. ${titles.sections[12]}`;
  const section122Text = getTextBetween(markdown, section122Heading, section13Heading);

  if (!section122Text) {
    return markdown;
  }

  const forbiddenInFollowUp = [
    'Tâche | Danger',
    'Score initial',
    'Task | Hazard',
    'Initial score',
    'Taak | Gevaar',
    'Initiële score',
    'Aufgabe | Gefährdung',
    'Ausgangsbewertung',
  ];

  if (!forbiddenInFollowUp.some((value) => section122Text.includes(value))) {
    return markdown;
  }

  const section12Heading = `## 12. ${titles.sections[11]}`;
  const start = markdown.indexOf(section12Heading);
  const end = markdown.indexOf(section13Heading);

  if (start === -1 || end === -1 || end <= start) {
    return markdown;
  }

  const rebuiltSection12 = buildRiskAssessmentSection12Markdown(data, language);
  return `${markdown.slice(0, start)}${rebuiltSection12}\n\n${markdown.slice(end)}`;
}

function buildRiskAssessmentSection12Markdown(data, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const initialRows = ensureObject(data.mainRiskAssessment).initialAssessment || [];
  const followUpRows = ensureObject(data.mainRiskAssessment).measuresFollowUpValidation || [];
  const initialTable = renderMarkdownTable(config.riskInitialTableColumns, initialRows, [
    'number',
    'task',
    'hazard',
    'hazardousSituationOrScenario',
    'possibleRiskOrHarm',
    'exposed',
    'existingMeasures',
    'existingEvidence',
    'observedOrDeclaredElements',
    'elementsToConfirm',
    'severity',
    'probability',
    'exposure',
    'scoringJustification',
    'initialScore',
    'initialLevel',
  ], language);
  const followUpTable = renderMarkdownTable(config.riskFollowUpTableColumns, followUpRows, [
    'number',
    'additionalMeasure',
    'stopLevel',
    'responsible',
    'deadline',
    'residualScore',
    'residualLevel',
    'residualScoreJustification',
    'expectedEvidence',
    'photoToInsert',
    'annexToAttach',
    'priority',
    'blockingPoint',
    'externalAdvice',
  ], language);

  return [
    `## 12. ${titles.sections[11]}`,
    '',
    config.riskLinkingSentence,
    '',
    `### 12.1 ${config.riskInitialSubsectionTitle}`,
    '',
    initialTable,
    '',
    `### 12.2 ${config.riskFollowUpSubsectionTitle}`,
    '',
    followUpTable,
  ].join('\n');
}

function finalizeRiskAssessmentMarkdown(markdown, language = 'fr', reference = '') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const mainReference = sanitizeMarkdownCell(reference, language);
  let normalized = String(markdown || '')
    .replace(/[◊�]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/^Document Reference:\s*.+$/gim, '')
    .replace(/^#\s*Analyse de risques – Projet à valider\s*$/gim, '')
    .replace(/^Analyse de risques – Projet à valider\s*$/gim, '')
    .replace(/^#\s*Risk assessment – Draft for validation\s*$/gim, '')
    .replace(/^#\s*Risicoanalyse – Ontwerp te valideren\s*$/gim, '')
    .replace(/^#\s*Gefährdungsbeurteilung – Entwurf zur Validierung\s*$/gim, '');

  normalized = alignRiskAssessmentHeadingsToTitles(normalized, language);
  normalized = replaceWrongRiskHeadingWhenSectionContains(normalized, language, 4, 'Périmètre de l’analyse', /Abréviation\s*\|\s*Définition/i);
  normalized = replaceWrongRiskHeadingWhenSectionContains(normalized, language, 9, 'Tableau principal d’analyse des risques', /Numéro photo|Photo number|Fotonummer|Foto/i);
  normalized = replaceWrongRiskHeadingWhenSectionContains(normalized, language, 11, 'Priorités d’action', /Score\s*=\s*Gravité|Score\s*=\s*Severity|Score\s*=\s*Ernst|Score\s*=\s*Schwere/i);
  normalized = replaceWrongRiskHeadingWhenSectionContains(normalized, language, 16, 'Annexes nécessaires', /\bPAA\b|\bPGP\b|Plan Annuel|Annual Action Plan|Jaaractieplan|Jährlichen Aktionsplan/i);
  normalized = replaceWrongRiskHeadingWhenSectionContains(normalized, language, 17, 'Conclusion', /Document\s*\|\s*Pourquoi/i);
  normalized = removeDuplicateRiskSectionHeadings(normalized, language);
  normalized = ensureRiskConclusionSection(normalized, language);
  normalized = ensureRiskValidationSection(normalized, language);
  normalized = removeStandaloneMarkdownSeparators(normalized);
  normalized = removeDuplicateRiskMainTitle(normalized, language);
  normalized = ensureFinalMentionOnce(normalized, language);

  const validationHeading = `## 23. ${titles.sections[22]}`;
  normalized = setSectionContent(normalized, 23, { sections: titles.sections }, config.finalMention);

  if (!normalized.includes(validationHeading)) {
    normalized = `${normalized.trim()}\n\n${validationHeading}\n\n${config.finalMention}`;
  }

  if (mainReference && mainReference !== getLanguagePlaceholder(language)) {
    normalized = replaceSecondaryRiskReferences(normalized, mainReference);
  }

  if (language === 'fr') {
    normalized = enforceRiskAssessmentHeader(normalized, mainReference, language);
    normalized = stripMarkdownHeadingMarkers(normalized);
  }

  normalized = removeDuplicateConsecutiveReferenceDateBlocks(normalized);

  return normalized
    .split('\n')
    .filter((line) => line.trim() !== '---')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function removeDuplicateConsecutiveReferenceDateBlocks(markdown) {
  const lines = String(markdown || '').split('\n');
  const blocks = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const referenceMatch = lines[index].trim().match(/^(Référence|Reference)\s*:\s*(.+)$/i);
    const dateMatch = lines[index + 1].trim().match(/^Date\s*:\s*(.+)$/i);

    if (referenceMatch && dateMatch) {
      blocks.push({
        start: index,
        end: index + 1,
        reference: referenceMatch[2].trim(),
        date: dateMatch[1].trim(),
      });
    }
  }

  if (
    blocks.length < 2 ||
    blocks[0].reference !== blocks[1].reference ||
    blocks[0].date !== blocks[1].date
  ) {
    return markdown;
  }

  const between = lines.slice(blocks[0].end + 1, blocks[1].start);
  if (between.some((line) => line.trim())) {
    return markdown;
  }

  return lines
    .filter((_line, index) => index < blocks[1].start || index > blocks[1].end)
    .join('\n');
}

function replaceSecondaryRiskReferences(markdown, reference) {
  const escapedReference = escapeRegExp(reference);
  return String(markdown || '').replace(/\bAR-\d{4}-\d{4}\b/g, (value) =>
    new RegExp(`^${escapedReference}$`).test(value) ? value : reference,
  );
}

function enforceRiskAssessmentHeader(markdown, reference, language = 'fr') {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const lines = String(markdown || '').split('\n');
  const dateLine = lines.find((line) => /^Date\s*:/i.test(line.trim()));
  const date = dateLine?.replace(/^Date\s*:\s*/i, '').trim() || formatRiskAssessmentDate(new Date(), language);
  const resolvedReference = reference && reference !== getLanguagePlaceholder(language)
    ? reference
    : buildRiskAssessmentReference({ documentIdentification: { title: titles.documentTitle, date } });
  const body = lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (trimmed === titles.documentTitle || trimmed === config.title) {
        return false;
      }
      if (/^#?\s*Analyse de risques – Projet à valider$/i.test(trimmed)) {
        return false;
      }
      if (/^Référence\s*:/i.test(trimmed) || /^Reference\s*:/i.test(trimmed)) {
        return false;
      }
      if (/^Date\s*:/i.test(trimmed)) {
        return false;
      }
      return true;
    })
    .join('\n')
    .replace(/^\s+/, '');

  return [
    titles.documentTitle,
    `Référence : ${resolvedReference}`,
    `Date : ${date}`,
    '',
    body.trim(),
  ].join('\n');
}

function assertRiskAssessmentMarkdownIsValid(markdown, language = 'fr') {
  if (language !== 'fr') {
    return true;
  }

  const document = String(markdown || '');
  const required = [
    '4. Glossaire des abréviations utilisées',
    '5. Périmètre de l’analyse',
    '9. Plan photos',
    '11. Méthode de cotation',
    '12.1 Évaluation initiale des risques',
    '12.2 Mesures, suivi et validation',
    '16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention',
    '17. Documents à créer ou à mettre à jour',
    '22. Conclusion',
    '23. Mention de validation',
  ];
  const forbidden = [
    'Document Reference:',
    'Analyse de risques – Projet à valider',
    '4. Périmètre de l’analyse\n\nAbréviation',
    '4. Périmètre de l’analyse\n\n| Abréviation',
    '9. Tableau principal d’analyse des risques\n\nPlan photos',
    '9. Tableau principal d’analyse des risques\n\n| Numéro photo',
    '11. Priorités d’action\n\nScore =',
    '16. Annexes nécessaires\n\n• PAA',
    '16. Annexes nécessaires\n\n- PAA',
    '17. Conclusion\n\nDocument | Pourquoi',
    '17. Conclusion\n\n| Document | Pourquoi',
  ];

  for (const expected of required) {
    assert.ok(document.includes(expected), `Structure analyse de risques invalide: titre manquant "${expected}"`);
  }

  for (const value of forbidden) {
    assert.ok(!document.includes(value), `Structure analyse de risques invalide: contenu interdit "${value}"`);
  }

  const section121Index = document.indexOf('12.1 Évaluation initiale des risques');
  const section122Index = document.indexOf('12.2 Mesures, suivi et validation');
  assert.ok(
    section121Index !== -1 && section122Index !== -1 && section121Index < section122Index,
    'Structure analyse de risques invalide: 12.1 doit précéder 12.2',
  );

  const initialHeader = `| ${LANGUAGE_CONFIGS.fr.riskInitialTableColumns} |`;
  const followUpHeader = `| ${LANGUAGE_CONFIGS.fr.riskFollowUpTableColumns} |`;
  const initialBlock = document.slice(section121Index, section122Index);
  const followUpBlock = document.slice(section122Index, findNextRiskSectionIndex(document, section122Index));

  assert.ok(
    initialBlock.includes(initialHeader),
    'Structure analyse de risques invalide: en-têtes du tableau initial absents entre 12.1 et 12.2',
  );
  assert.ok(
    followUpBlock.includes(followUpHeader),
    'Structure analyse de risques invalide: en-têtes du tableau de suivi absents après 12.2',
  );
  assert.ok(
    !followUpBlock.includes('Tâche | Danger | Situation dangereuse'),
    'Structure analyse de risques invalide: en-têtes initiaux présents dans 12.2',
  );

  return true;
}

function findNextRiskSectionIndex(document, startIndex) {
  const match = document.slice(startIndex + 1).match(/\n(?:#{1,6}\s*)?\d{1,2}\.\s+/);
  return match?.index === undefined ? document.length : startIndex + 1 + match.index;
}

function alignRiskAssessmentHeadingsToTitles(document, language = 'fr') {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;

  return String(document || '')
    .split('\n')
    .map((line) => {
      const headingMatch = line.match(/^(#{1,6}\s*)?(\d{1,2})\.\s+.+$/);

      if (!headingMatch) {
        return line;
      }

      const sectionNumber = Number(headingMatch[2]);
      const expectedTitle = titles.sections[sectionNumber - 1];

      return expectedTitle ? `## ${sectionNumber}. ${expectedTitle}` : line;
    })
    .join('\n');
}

function replaceWrongRiskHeadingWhenSectionContains(document, language, sectionNumber, wrongTitle, contentPattern) {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const expectedHeading = `## ${sectionNumber}. ${titles.sections[sectionNumber - 1]}`;
  const wrongHeading = `## ${sectionNumber}. ${wrongTitle}`;

  if (!document.includes(wrongHeading)) {
    return document;
  }

  const sectionText = getSectionText(document, sectionNumber, { sections: titles.sections.map((title, index) =>
    index === sectionNumber - 1 ? wrongTitle : title,
  ) });

  return contentPattern.test(sectionText)
    ? document.replaceAll(wrongHeading, expectedHeading)
    : document;
}

function removeDuplicateRiskSectionHeadings(document, language = 'fr') {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const seen = new Set();

  return document
    .split('\n')
    .filter((line) => {
      const match = line.match(/^##\s+(\d{1,2})\.\s+(.+)$/);

      if (!match) {
        return true;
      }

      const sectionNumber = Number(match[1]);
      const expectedTitle = titles.sections[sectionNumber - 1];

      if (!expectedTitle || match[2] !== expectedTitle) {
        return true;
      }

      if (seen.has(sectionNumber)) {
        return false;
      }

      seen.add(sectionNumber);
      return true;
    })
    .join('\n');
}

function ensureRiskConclusionSection(document, language = 'fr') {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const conclusionHeading = `## 22. ${titles.sections[21]}`;
  const validationHeading = `## 23. ${titles.sections[22]}`;
  const fallbackConclusion = buildFallbackRiskConclusion(language);

  if (!document.includes(conclusionHeading)) {
    const validationIndex = document.indexOf(validationHeading);
    const block = `${conclusionHeading}\n\n${fallbackConclusion}\n\n`;
    return validationIndex === -1
      ? `${document.trim()}\n\n${block.trim()}`
      : `${document.slice(0, validationIndex)}${block}${document.slice(validationIndex)}`;
  }

  const sectionText = getSectionText(document, 22, { sections: titles.sections });
  if (sectionText.length < 120 || sectionText.includes('|')) {
    return setSectionContent(document, 22, { sections: titles.sections }, fallbackConclusion);
  }

  return document;
}

function ensureRiskValidationSection(document, language = 'fr') {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  const validationHeading = `## 23. ${titles.sections[22]}`;

  return document.includes(validationHeading)
    ? document
    : `${document.trim()}\n\n${validationHeading}\n\n${(LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr).finalMention}`;
}

function removeDuplicateRiskMainTitle(document, language = 'fr') {
  const titles = RISK_ASSESSMENT_TITLES[language] || RISK_ASSESSMENT_TITLES.fr;
  let seenTitle = false;

  return document
    .split('\n')
    .filter((line) => {
      const normalizedLine = line.replace(/^#\s*/, '').trim();

      if (normalizedLine !== titles.documentTitle) {
        return true;
      }

      if (seenTitle) {
        return false;
      }

      seenTitle = true;
      return true;
    })
    .join('\n');
}

function getTextBetween(document, startMarker, endMarker) {
  const start = document.indexOf(startMarker);

  if (start === -1) {
    return '';
  }

  const afterStart = start + startMarker.length;
  const end = document.indexOf(endMarker, afterStart);

  return end === -1
    ? document.slice(afterStart)
    : document.slice(afterStart, end);
}

function renderTable(header, rows, keys, language = 'fr') {
  const headers = header.split('|').map((value) => value.trim());
  const safeRows = ensureArray(rows);
  const renderedRows = safeRows.length > 0 ? safeRows : [{}];

  return [
    formatMarkdownRow(headers),
    formatMarkdownRow(headers.map(() => '---')),
    ...renderedRows.map((row) =>
      formatMarkdownRow(keys.map((key) => {
        const value = ensureObject(row)[key];
        return key === 'stopLevel'
          ? normalizeStructuredStopLevel(value, language)
          : sanitizeMarkdownCell(value, language);
      })),
    ),
  ].join('\n');
}

function renderMarkdownTable(header, rows, keys, language = 'fr') {
  return renderTable(header, rows, keys, language);
}

function renderKeyValueTable(data, entries, language = 'fr') {
  return renderTable('Champ | Valeur', entries.map(([key, label]) => ({
    label,
    value: ensureObject(data)[key],
  })), ['label', 'value'], language);
}

function renderScope(scope, language = 'fr') {
  const labels = {
    fr: [
      ['includedPlaces', 'Lieux inclus'],
      ['excludedPlaces', 'Lieux exclus'],
      ['activities', 'Services ou activités concernés'],
      ['exposedJobs', 'Postes exposés'],
      ['includedSituations', 'Situations incluses'],
      ['scopeLimits', 'Limites du périmètre'],
    ],
    nl: [
      ['includedPlaces', 'Inbegrepen plaatsen'],
      ['excludedPlaces', 'Uitgesloten plaatsen'],
      ['activities', 'Betrokken diensten of activiteiten'],
      ['exposedJobs', 'Blootgestelde functies'],
      ['includedSituations', 'Inbegrepen situaties'],
      ['scopeLimits', 'Grenzen van de afbakening'],
    ],
    en: [
      ['includedPlaces', 'Included places'],
      ['excludedPlaces', 'Excluded places'],
      ['activities', 'Services or activities concerned'],
      ['exposedJobs', 'Exposed jobs'],
      ['includedSituations', 'Included situations'],
      ['scopeLimits', 'Scope limits'],
    ],
    de: [
      ['includedPlaces', 'Einbezogene Orte'],
      ['excludedPlaces', 'Ausgeschlossene Orte'],
      ['activities', 'Betroffene Dienste oder Tätigkeiten'],
      ['exposedJobs', 'Exponierte Arbeitsplätze'],
      ['includedSituations', 'Einbezogene Situationen'],
      ['scopeLimits', 'Grenzen des Umfangs'],
    ],
  };

  return (labels[language] || labels.fr)
    .map(([key, label]) => `- ${label}: ${sanitizeMarkdownCell(ensureArray(scope[key]).join(', '), language)}`)
    .join('\n');
}

function renderAssumptions(value, language = 'fr') {
  const data = ensureObject(value);
  return [
    ['factsProvided', 'Faits fournis'],
    ['partialObservations', 'Observations partielles'],
    ['missingInformation', 'Informations manquantes'],
    ['pointsToValidate', 'Points à valider'],
    ['limits', 'Limites'],
  ]
    .map(([key, label]) => `- ${label}: ${sanitizeMarkdownCell(ensureArray(data[key]).join(', '), language)}`)
    .join('\n');
}

function renderScoringMethod(value, language = 'fr') {
  const data = ensureObject(value);
  return [
    sanitizeMarkdownCell(data.formula || 'Score = Gravité × Probabilité × Exposition', language),
    `- Gravité: ${sanitizeMarkdownCell(ensureArray(data.severityScale).join(', '), language)}`,
    `- Probabilité: ${sanitizeMarkdownCell(ensureArray(data.probabilityScale).join(', '), language)}`,
    `- Exposition: ${sanitizeMarkdownCell(ensureArray(data.exposureScale).join(', '), language)}`,
    `- Seuils: ${sanitizeMarkdownCell(ensureArray(data.thresholds).join(', '), language)}`,
    `- Confirmation: ${sanitizeMarkdownCell(data.confirmationNote, language)}`,
  ].join('\n');
}

function renderPaaPgpLink(value, language = 'fr') {
  const data = ensureObject(value);
  return [
    `- PAA: ${sanitizeMarkdownCell(ensureArray(data.paaActions).join(', '), language)}`,
    `- PGP: ${sanitizeMarkdownCell(ensureArray(data.pgpActions).join(', '), language)}`,
    `- CPPT: ${sanitizeMarkdownCell(data.cpptRole, language)}`,
    `- Suivi direction/service prévention: ${sanitizeMarkdownCell(data.managementFollowUp, language)}`,
  ].join('\n');
}

function renderBulletList(values, language = 'fr') {
  const items = ensureArray(values);
  return (items.length > 0 ? items : [getLanguagePlaceholder(language)])
    .map((item) => `- ${sanitizeMarkdownCell(item, language)}`)
    .join('\n');
}

function renderParagraph(value, language = 'fr') {
  return sanitizeMarkdownCell(value, language);
}

function sanitizeMarkdownCell(value, language = 'fr') {
  const placeholder = getLanguagePlaceholder(language);
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const cleaned = text
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '/')
    .replace(/---+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /^-+$/.test(cleaned) || cleaned === 'undefined' || cleaned === 'null') {
    return placeholder;
  }

  return cleaned.length > 500 ? `${cleaned.slice(0, 497).trim()}...` : cleaned;
}

function normalizeStructuredStopLevel(value, language = 'fr') {
  const raw = sanitizeMarkdownCell(value, language);
  const normalizedRaw = normalizeTableHeader(raw);
  const allowedLevels = getAllowedStopLevels(language);
  const matchingAllowed = allowedLevels.find((level) => normalizeTableHeader(level) === normalizedRaw);

  if (matchingAllowed) {
    return matchingAllowed;
  }

  if (getForbiddenRiskLevelValues().includes(normalizedRaw)) {
    return getDefaultStopLevel(language);
  }

  if (/technique|technisch|technical|techn/.test(normalizedRaw)) {
    return getTechnicalStopLevel(language);
  }

  return getDefaultStopLevel(language);
}

function getAllowedStopLevels(language = 'fr') {
  const values = {
    fr: [
      'Suppression/Substitution',
      'Suppression/Substitution + Technique + Organisationnelle',
      'Technique',
      'Organisationnelle',
      'Protection individuelle',
      'Technique + Organisationnelle',
      'Organisationnelle + Protection individuelle',
      'Technique + Organisationnelle + Protection individuelle',
    ],
    nl: [
      'Eliminatie/substitutie',
      'Technisch',
      'Organisatorisch',
      'Persoonlijke bescherming',
      'Technisch + Organisatorisch',
      'Organisatorisch + Persoonlijke bescherming',
      'Technisch + Organisatorisch + Persoonlijke bescherming',
    ],
    en: [
      'Elimination/substitution',
      'Technical',
      'Organisational',
      'Personal protection',
      'Technical + Organisational',
      'Organisational + Personal protection',
      'Technical + Organisational + Personal protection',
    ],
    de: [
      'Beseitigung/Substitution',
      'Technisch',
      'Organisatorisch',
      'Persönlicher Schutz',
      'Technisch + Organisatorisch',
      'Organisatorisch + Persönlicher Schutz',
      'Technisch + Organisatorisch + Persönlicher Schutz',
    ],
  };

  return values[language] || values.fr;
}

function getDefaultStopLevel(language = 'fr') {
  return {
    fr: 'Organisationnelle',
    nl: 'Organisatorisch',
    en: 'Organisational',
    de: 'Organisatorisch',
  }[language] || 'Organisationnelle';
}

function getTechnicalStopLevel(language = 'fr') {
  return {
    fr: 'Technique',
    nl: 'Technisch',
    en: 'Technical',
    de: 'Technisch',
  }[language] || 'Technique';
}

function getForbiddenRiskLevelValues() {
  return [
    'faible',
    'moyen',
    'eleve',
    'critique',
    'low',
    'medium',
    'high',
    'critical',
    'laag',
    'gemiddeld',
    'hoog',
    'kritiek',
    'niedrig',
    'mittel',
    'hoch',
    'kritisch',
  ];
}

function buildStructuredFallbackRiskConclusion(data, language = 'fr') {
  const templates = {
    fr:
      'Ce document constitue une base d’analyse de risques destinée à aider le conseiller en prévention dans la préparation, la vérification et le suivi des actions. Il ne peut pas être considéré comme une analyse finalisée tant que la visite terrain, les photos, les preuves documentaires, les avis nécessaires et les validations internes n’ont pas été complétés. Les risques prioritaires doivent être traités dans le Plan Annuel d’Action lorsque l’action est urgente ou corrective. Les actions structurelles doivent être intégrées au Plan Global de Prévention. Le document peut être présenté au CPPT comme base de discussion et de priorisation, mais il doit être validé par l’employeur, le conseiller en prévention et, si nécessaire, le service externe ou un expert compétent.',
    nl:
      'Dit document vormt een basis voor risicoanalyse om de preventieadviseur te helpen bij de voorbereiding, controle en opvolging van acties. Het mag niet als een definitieve analyse worden beschouwd zolang het terreinbezoek, de foto’s, de documentaire bewijzen, de noodzakelijke adviezen en de interne validaties niet zijn aangevuld. Prioritaire risico’s moeten in het Jaaractieplan worden behandeld wanneer de actie dringend of corrigerend is. Structurele acties moeten in het Globaal Preventieplan worden opgenomen. Het document kan aan het CPBW worden voorgelegd als basis voor bespreking en prioritering, maar het moet worden gevalideerd door de werkgever, de preventieadviseur en, indien nodig, de externe dienst of een bevoegde expert.',
    en:
      'This document is a risk assessment basis intended to help the prevention advisor prepare, verify and follow up actions. It cannot be considered a final assessment until the site visit, photos, documentary evidence, necessary opinions and internal validations have been completed. Priority risks must be addressed in the Annual Action Plan when the action is urgent or corrective. Structural actions must be included in the Global Prevention Plan. The document may be presented to the health and safety committee as a basis for discussion and prioritisation, but it must be validated by the employer, the prevention advisor and, if necessary, the external service or a competent expert.',
    de:
      'Dieses Dokument bildet eine Grundlage für die Gefährdungsbeurteilung und soll den Präventionsberater bei Vorbereitung, Prüfung und Nachverfolgung der Maßnahmen unterstützen. Es kann nicht als endgültige Beurteilung gelten, solange Vor-Ort-Begehung, Fotos, dokumentierte Nachweise, erforderliche Stellungnahmen und interne Validierungen nicht abgeschlossen sind. Prioritäre Risiken sind im Jährlichen Aktionsplan zu behandeln, wenn die Maßnahme dringend oder korrigierend ist. Strukturelle Maßnahmen sind in den Globalen Präventionsplan aufzunehmen. Das Dokument kann dem AGS/CPPT als Grundlage für Diskussion und Priorisierung vorgelegt werden, muss jedoch vom Arbeitgeber, vom Präventionsberater und erforderlichenfalls vom externen Dienst oder einem zuständigen Experten validiert werden.',
  };

  return templates[language] || templates.fr;
}

function looksLikeMarkdownTable(value) {
  return String(value || '').trim().startsWith('|');
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
}

function ensureString(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return typeof value === 'string' ? value : '';
}

function getLanguagePlaceholder(language = 'fr') {
  return {
    fr: 'À compléter',
    nl: 'Aan te vullen',
    en: 'To be completed',
    de: 'Zu ergänzen',
  }[language] || 'À compléter';
}

function normalizeRiskLevels(markdownDocument) {
  if (typeof markdownDocument !== 'string') {
    return markdownDocument;
  }

  return normalizeMarkdownTables(removeStandaloneMarkdownSeparators(normalizeKnownPhrases(markdownDocument)));
}

function normalizeRiskAssessmentFinalOutput(document, language = 'fr') {
  const withoutSeparators = removeStandaloneMarkdownSeparators(document);
  const withAlignedHeadings = alignRiskAssessmentHeadings(withoutSeparators, language);
  const withSection12 = normalizeRiskAssessmentSection12(withAlignedHeadings, language);
  const withRequiredSections = ensureRiskAssessmentRequiredSections(withSection12, language);

  return ensureFinalMentionOnce(withRequiredSections, language);
}

function alignRiskAssessmentHeadings(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;

  if (typeof document !== 'string') {
    return document;
  }

  return document
    .split('\n')
    .map((line) => {
      const headingMatch = line.match(/^##\s+(\d{1,2})\.\s+.+$/);

      if (!headingMatch) {
        return line;
      }

      const sectionNumber = Number(headingMatch[1]);
      const expectedTitle = config.sections[sectionNumber - 1];

      return expectedTitle ? `## ${sectionNumber}. ${expectedTitle}` : line;
    })
    .join('\n');
}

function normalizeRiskAssessmentSection12(document, language = 'fr') {
  return normalizeRiskAssessmentStopLevels(
    normalizeRiskAssessmentSection12Tables(
      normalizeRiskAssessmentSection12Spacing(document, language),
      language,
    ),
    language,
  );
}

function normalizeRiskAssessmentSection12Spacing(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;

  if (typeof document !== 'string') {
    return document;
  }

  let normalized = document
    .replace(
      new RegExp(`###\\s+12\\.1\\s+[^\\n]+`, 'g'),
      `### 12.1 ${config.riskInitialSubsectionTitle}`,
    )
    .replace(
      new RegExp(`###\\s+12\\.2\\s+[^\\n]+`, 'g'),
      `### 12.2 ${config.riskFollowUpSubsectionTitle}`,
    )
    .replace(
      new RegExp(`\\n(?=###\\s+12\\.1\\s+${escapeRegExp(config.riskInitialSubsectionTitle)})`, 'g'),
      '\n\n',
    )
    .replace(
      new RegExp(`\\n(?=###\\s+12\\.2\\s+${escapeRegExp(config.riskFollowUpSubsectionTitle)})`, 'g'),
      '\n\n',
    );

  const section12Heading = `## 12. ${config.sections[11]}`;
  const section12Index = normalized.indexOf(section12Heading);
  const section121Index = normalized.indexOf(`### 12.1 ${config.riskInitialSubsectionTitle}`);

  if (
    section12Index !== -1 &&
    section121Index !== -1 &&
    section12Index < section121Index &&
    !normalized.slice(section12Index, section121Index).includes(config.riskLinkingSentence)
  ) {
    normalized = `${normalized.slice(0, section12Index + section12Heading.length)}\n\n${config.riskLinkingSentence}\n${normalized.slice(section12Index + section12Heading.length)}`;
  }

  return normalized;
}

function normalizeRiskAssessmentSection12Tables(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;

  if (typeof document !== 'string') {
    return document;
  }

  const section121Heading = `### 12.1 ${config.riskInitialSubsectionTitle}`;
  const section122Heading = `### 12.2 ${config.riskFollowUpSubsectionTitle}`;
  let normalized = replaceFirstTableHeaderAfterHeading(
    document,
    section121Heading,
    config.riskInitialTableColumns,
  );

  normalized = replaceFirstTableHeaderAfterHeading(
    normalized,
    section122Heading,
    config.riskFollowUpTableColumns,
  );

  return normalized;
}

function replaceFirstTableHeaderAfterHeading(document, heading, expectedColumns) {
  const headingIndex = document.indexOf(heading);

  if (headingIndex === -1) {
    return document;
  }

  const afterHeadingIndex = headingIndex + heading.length;
  const before = document.slice(0, afterHeadingIndex);
  const after = document.slice(afterHeadingIndex);
  const tableHeaderMatch = after.match(/\n\|[^\n]+\|/);

  if (!tableHeaderMatch || tableHeaderMatch.index === undefined) {
    return document;
  }

  const headerStart = tableHeaderMatch.index;
  const headerEnd = headerStart + tableHeaderMatch[0].length;
  const expectedHeader = `\n| ${expectedColumns} |`;
  const expectedSeparator = `\n| ${expectedColumns
    .split('|')
    .map(() => '---')
    .join(' | ')} |`;
  const afterHeader = after.slice(headerEnd);
  const separatorMatch = afterHeader.match(/^\n\|[\s:|-]+\|/);

  if (separatorMatch) {
    return `${before}${after.slice(0, headerStart)}${expectedHeader}${expectedSeparator}${afterHeader.slice(separatorMatch[0].length)}`;
  }

  return `${before}${after.slice(0, headerStart)}${expectedHeader}${expectedSeparator}${after.slice(headerEnd)}`;
}

function normalizeRiskAssessmentStopLevels(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const defaultStopLevel = config.stopLevels.split(';').map((value) => value.trim())[2] || config.stopLevels.split(';')[0];
  const riskLevelValues = Object.values(config.riskLevels).map(normalizeTableHeader);
  const lines = document.split('\n');
  const output = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    if (isMarkdownTableRow(line) && isMarkdownTableRow(nextLine) && isMarkdownTableSeparator(splitMarkdownRow(nextLine))) {
      const tableLines = [line, nextLine];
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }

      output.push(...normalizeStopLevelTableBlock(tableLines, riskLevelValues, defaultStopLevel));
      continue;
    }

    output.push(line);
    index += 1;
  }

  return output.join('\n');
}

function normalizeStopLevelTableBlock(tableLines, riskLevelValues, defaultStopLevel) {
  const headers = splitMarkdownRow(tableLines[0]);
  const stopColumnIndex = headers.findIndex((header) => normalizeTableHeader(header).includes('stop'));

  if (stopColumnIndex === -1) {
    return tableLines;
  }

  return tableLines.map((line, index) => {
    if (index < 2 || !isMarkdownTableRow(line)) {
      return line;
    }

    const cells = splitMarkdownRow(line);
    const stopValue = normalizeTableHeader(cells[stopColumnIndex] || '');

    if (riskLevelValues.includes(stopValue)) {
      cells[stopColumnIndex] = defaultStopLevel;
    }

    return formatMarkdownRow(cells);
  });
}

function ensureRiskAssessmentRequiredSections(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const conclusionHeading = `## 22. ${config.sections[21]}`;
  const validationHeading = `## 23. ${config.sections[22]}`;
  let normalized = document.trim();

  if (!normalized.includes(conclusionHeading)) {
    const validationIndex = normalized.indexOf(validationHeading);
    const conclusionBlock = `${conclusionHeading}\n\n${buildFallbackRiskConclusion(language)}\n\n`;
    normalized = validationIndex === -1
      ? `${normalized}\n\n${conclusionBlock.trim()}`
      : `${normalized.slice(0, validationIndex)}${conclusionBlock}${normalized.slice(validationIndex)}`;
  } else if (isRiskConclusionMissingOrTableOnly(normalized, language)) {
    normalized = insertFallbackConclusionText(normalized, language);
  }

  if (!normalized.includes(validationHeading)) {
    normalized = `${normalized}\n\n${validationHeading}\n\n${config.finalMention}`;
  }

  return setSectionContent(normalized, 23, config, config.finalMention);
}

function isRiskConclusionMissingOrTableOnly(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const sectionText = getSectionText(document, 22, config);
  const nonEmptyLines = sectionText.split('\n').map((line) => line.trim()).filter(Boolean);

  return nonEmptyLines.length === 0 || nonEmptyLines[0].startsWith('|');
}

function insertFallbackConclusionText(document, language = 'fr') {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const conclusionHeading = `## 22. ${config.sections[21]}`;
  const headingIndex = document.indexOf(conclusionHeading);

  if (headingIndex === -1) {
    return document;
  }

  const insertIndex = headingIndex + conclusionHeading.length;
  return `${document.slice(0, insertIndex)}\n\n${buildFallbackRiskConclusion(language)}\n${document.slice(insertIndex)}`;
}

function getSectionText(document, sectionNumber, config) {
  const heading = `## ${sectionNumber}. ${config.sections[sectionNumber - 1]}`;
  const start = document.indexOf(heading);

  if (start === -1) {
    return '';
  }

  const afterHeading = start + heading.length;
  const nextSectionMatch = document.slice(afterHeading).match(/\n##\s+\d{1,2}\.\s+/);
  const end = nextSectionMatch?.index === undefined
    ? document.length
    : afterHeading + nextSectionMatch.index;

  return document.slice(afterHeading, end).trim();
}

function setSectionContent(document, sectionNumber, config, content) {
  const heading = `## ${sectionNumber}. ${config.sections[sectionNumber - 1]}`;
  const start = document.indexOf(heading);

  if (start === -1) {
    return document;
  }

  const afterHeading = start + heading.length;
  const nextSectionMatch = document.slice(afterHeading).match(/\n##\s+\d{1,2}\.\s+/);
  const end = nextSectionMatch?.index === undefined
    ? document.length
    : afterHeading + nextSectionMatch.index;

  return `${document.slice(0, afterHeading)}\n\n${content.trim()}${document.slice(end)}`;
}

function buildFallbackRiskConclusion(language = 'fr') {
  return buildStructuredFallbackRiskConclusion({}, language);
}

function removeStandaloneMarkdownSeparators(document) {
  if (typeof document !== 'string') {
    return document;
  }

  return document
    .split('\n')
    .filter((line) => !isStandaloneMarkdownSeparator(line))
    .join('\n');
}

function removeMarkdownSeparatorRows(document) {
  if (typeof document !== 'string') {
    return document;
  }

  return document
    .split('\n')
    .filter((line) => {
      if (!isMarkdownTableRow(line)) {
        return true;
      }

      const cells = splitMarkdownRow(line.trim());
      return !isMarkdownTableSeparator(cells);
    })
    .join('\n');
}

function isStandaloneMarkdownSeparator(line) {
  if (typeof line !== 'string') {
    return false;
  }

  const trimmed = line.trim();

  if (/^-{3,}$/.test(trimmed)) {
    return true;
  }

  if (!isMarkdownTableRow(trimmed)) {
    return false;
  }

  const cells = splitMarkdownRow(trimmed);
  return cells.length === 1 && isMarkdownTableSeparator(cells);
}

function ensureFinalMentionOnce(document, language = 'fr') {
  const finalMention = LANGUAGE_CONFIGS[language]?.finalMention;

  if (!finalMention || typeof document !== 'string') {
    return document;
  }

  const lastIndex = document.lastIndexOf(finalMention);
  if (lastIndex === -1) {
    return document;
  }

  const beforeLast = document.slice(0, lastIndex).replaceAll(finalMention, '').trimEnd();
  const lastAndAfter = document.slice(lastIndex);

  return `${beforeLast ? `${beforeLast}\n\n` : ''}${lastAndAfter}`;
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

    if (
      normalizedHeader.includes('score') ||
      normalizedHeader.includes('punktzahl') ||
      normalizedHeader.includes('ausgangsbewertung') ||
      normalizedHeader.includes('restrisikobewertung')
    ) {
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
    normalizedHeaders.includes('ausgangsbewertung') ||
    normalizedHeaders.includes('restrisikobewertung') ||
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

  if (normalizedHeader.includes('niveau')) {
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
    [10, 'Faible'],
    [11, 'Moyen'],
    [30, 'Moyen'],
    [31, 'Élevé'],
    [48, 'Élevé'],
    [60, 'Élevé'],
    [61, 'Critique'],
    [100, 'Critique'],
  ];

  for (const [score, expected] of cases) {
    assert.equal(getRiskLevel(score), expected, `Score ${score} should map to ${expected}`);
  }

  const normalized = normalizeRiskLevels(`| Score initial | Niveau de risque initial | Moyens nécessaires | Budget estimatif si possible |
| --- | --- | --- | --- |
| 10 | Moyen | €500 | Information à compléter |
| 30 | Élevé | Utlisation sécurisée | PDV requise pour EPI |
| 31 | Moyen | Fréquence d'interventions augm. | € pour reformation |
| 30 | Moyen | à compléter | Information à compléter |
`);

  assert.match(normalized, /\|\s*10\s*\|\s*Faible\s*\|/);
  assert.match(normalized, /\|\s*30\s*\|\s*Moyen\s*\|/);
  assert.match(normalized, /\|\s*31\s*\|\s*Élevé\s*\|/);
  assert.match(normalized, /Utilisation sécurisée/);
  assert.match(normalized, /procédure de vérification des EPI requise/);
  assert.match(normalized, /\|\s*à prévoir\s*\|/);
  assert.match(normalized, /à estimer/);
  assert.doesNotMatch(normalizeRiskLevels('Avant\n---\nAprès'), /^---$/m);
  assert.doesNotMatch(normalizeRiskLevels('Avant\n| --- |\nAprès'), /^\| --- \|$/m);

  const structuredRiskSample = getRiskAssessmentJsonSchema();
  structuredRiskSample.documentIdentification.type = 'Analyse de risques générale';
  structuredRiskSample.contextObjective = 'Analyse provisoire de risques à valider.';
  structuredRiskSample.glossary = [{ abbreviation: 'PAA', definition: 'Plan Annuel d’Action.' }];
  structuredRiskSample.scope.includedPlaces = ['Atelier'];
  structuredRiskSample.photoPlan.photos = [{ photoNumber: '1', areaOrTask: 'Atelier' }];
  structuredRiskSample.mainRiskAssessment.initialAssessment = [
    {
      number: '1',
      task: 'Maintenance',
      hazard: 'Machine',
      hazardousSituationOrScenario: 'Contact avec organe mobile',
      possibleRiskOrHarm: 'Blessure',
      exposed: 'Agents',
      severity: '3',
      probability: '3',
      exposure: '3',
      scoringJustification: 'Exposition régulière',
      initialScore: '27',
      initialLevel: 'Moyen',
    },
  ];
  structuredRiskSample.mainRiskAssessment.measuresFollowUpValidation = [
    {
      number: '1',
      additionalMeasure: 'Vérifier le carter',
      stopLevel: 'Moyen',
      responsible: 'SIPPT',
      residualScore: '9',
      residualLevel: 'Faible',
      blockingPoint: 'Oui',
      externalAdvice: 'Non',
    },
  ];
  structuredRiskSample.conclusion = '| Document | Pourquoi |';
  structuredRiskSample.validationStatement = 'Texte en trop.';

  const renderedRiskDocument = processGeneratedDocument(
    JSON.stringify(structuredRiskSample),
    getDocumentDefinition('Analyse de risques générale'),
    'fr',
  ).document;

  assert.match(renderedRiskDocument, /## 4\. Glossaire des abréviations utilisées/);
  assert.match(renderedRiskDocument, /## 5\. Périmètre de l’analyse/);
  assert.match(renderedRiskDocument, /## 9\. Plan photos/);
  assert.doesNotMatch(renderedRiskDocument, /## 9\. Tableau principal d’analyse des risques/);
  assert.match(renderedRiskDocument, /## 11\. Méthode de cotation/);
  assert.doesNotMatch(renderedRiskDocument, /## 11\. Priorités d’action/);
  assert.match(renderedRiskDocument, new RegExp(escapeRegExp(LANGUAGE_CONFIGS.fr.riskLinkingSentence)));
  assert.match(renderedRiskDocument, /\n\n### 12\.1 Évaluation initiale des risques/);
  assert.match(renderedRiskDocument, /\n\n### 12\.2 Mesures, suivi et validation/);
  assert.match(renderedRiskDocument, new RegExp(escapeRegExp(`| ${LANGUAGE_CONFIGS.fr.riskInitialTableColumns} |`)));
  assert.match(renderedRiskDocument, new RegExp(escapeRegExp(`| ${LANGUAGE_CONFIGS.fr.riskFollowUpTableColumns} |`)));
  assert.doesNotMatch(renderedRiskDocument, /\|\s*Vérifier le carter\s*\|\s*Moyen\s*\|/);
  assert.match(renderedRiskDocument, /\|\s*Vérifier le carter\s*\|\s*Organisationnelle\s*\|/);
  assert.match(renderedRiskDocument, /## 16\. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention/);
  assert.doesNotMatch(renderedRiskDocument, /## 16\. Annexes nécessaires/);
  assert.match(renderedRiskDocument, /## 17\. Documents à créer ou à mettre à jour/);
  assert.match(renderedRiskDocument, /## 22\. Conclusion/);
  assert.match(renderedRiskDocument, /## 23\. Mention de validation/);
  assert.doesNotMatch(renderedRiskDocument, /Document Reference:/);
  assert.doesNotMatch(renderedRiskDocument, /^#?\s*Analyse de risques – Projet à valider\s*$/m);
  assert.doesNotMatch(renderedRiskDocument, /## 4\. Périmètre de l’analyse\n\n\| Abréviation \| Définition \|/);
  assert.doesNotMatch(renderedRiskDocument, /## 9\. Tableau principal d’analyse des risques\n\n/);
  assert.doesNotMatch(renderedRiskDocument, /## 11\. Priorités d’action\n\nScore =/);
  assert.doesNotMatch(renderedRiskDocument, /## 16\. Annexes nécessaires\n\n.*\bPAA\b/s);
  assert.doesNotMatch(renderedRiskDocument, /## 17\. Conclusion\n\n\| Document \| Pourquoi/s);
  assert.doesNotMatch(renderedRiskDocument, /--- ---/);
  assert.equal(
    renderedRiskDocument.split(LANGUAGE_CONFIGS.fr.finalMention).length - 1,
    1,
    'Final validation statement should appear once in risk assessments',
  );

  const blockCSchema = getRiskAssessmentBlockDefinitions().find((block) => block.key === 'C').schema;
  assert.deepEqual(Object.keys(blockCSchema), ['risks']);
  assert.equal(blockCSchema.risks[0].initial.task, '');
  assert.equal(blockCSchema.risks[0].followUp.stopLevel, '');
  assert.equal(blockCSchema.risks[0].residual.mainRisk, '');

  const transformedBlockC = transformSimplifiedRiskBlockC({
    risks: [
      {
        number: '7',
        initial: {
          task: 'Recharge batteries',
          hazard: 'Échauffement batterie',
          initialScore: '36',
        },
        followUp: {
          additionalMeasure: 'Isoler la zone',
          stopLevel: 'Critique',
          residualScore: '9',
        },
        residual: {
          mainRisk: 'Incendie batterie',
        },
      },
    ],
  }, 'fr');
  assert.equal(transformedBlockC.mainRiskAssessment.initialAssessment[0].number, '7');
  assert.equal(transformedBlockC.mainRiskAssessment.measuresFollowUpValidation[0].number, '7');
  assert.equal(
    transformedBlockC.mainRiskAssessment.measuresFollowUpValidation[0].stopLevel,
    'Organisationnelle',
  );
  assert.equal(transformedBlockC.residualRiskAnalysis[0].initialScore, '36');

  const fallbackFireFormData = {
    activitePoste: 'Stockage et recharge dans un atelier',
    produitsDangereux: 'Solvants inflammables et batteries lithium-ion',
    machinesEquipements: 'Chargeurs de batteries et armoires de stockage',
    travailleursExposes: 'Agents, visiteurs et intérimaires',
    accidentsIncidents: 'Départ de feu évité',
    mesuresExistantes: 'Extincteurs et consignes affichées',
    contraintesParticulieres: 'Issues parfois encombrées',
  };
  const fallbackFireBlockC = buildFallbackRiskAssessmentBlock(
    'C',
    'fr',
    fallbackFireFormData,
    'Analyse de risques incendie et évacuation',
  );
  assert.equal(fallbackFireBlockC.mainRiskAssessment.initialAssessment.length, 8);
  assert.match(fallbackFireBlockC.mainRiskAssessment.initialAssessment[0].hazard, /Incendie lié aux produits inflammables/);
  assert.equal(fallbackFireBlockC.mainRiskAssessment.measuresFollowUpValidation[0].stopLevel, 'Technique + Organisationnelle');
  assert.equal(fallbackFireBlockC.residualRiskAnalysis.length, 8);

  const deterministicFireDocument = finalizeRiskAssessmentMarkdown(renderRiskAssessmentMarkdown(validateRiskAssessmentStructuredData({
    ...buildRiskAssessmentFixedSections(fallbackFireFormData, 'Analyse de risques incendie et évacuation', 'fr'),
    ...buildFallbackRiskItems(fallbackFireFormData, 'Analyse de risques incendie et évacuation', 'fr'),
  }, 'fr'), 'fr'), 'fr');
  const section122Text = getTextBetween(
    deterministicFireDocument,
    '### 12.2 Mesures, suivi et validation',
    '## 13. Analyse des risques résiduels',
  );

  [
    '## 4. Glossaire des abréviations utilisées',
    '## 5. Périmètre de l’analyse',
    '## 9. Plan photos',
    '## 11. Méthode de cotation',
    '### 12.1 Évaluation initiale des risques',
    '### 12.2 Mesures, suivi et validation',
    '## 16. Lien avec le Plan Annuel d’Action et le Plan Global de Prévention',
    '## 17. Documents à créer ou à mettre à jour',
    '## 22. Conclusion',
    '## 23. Mention de validation',
  ].forEach((expected) => assert.match(deterministicFireDocument, new RegExp(escapeRegExp(expected))));
  assert.doesNotMatch(deterministicFireDocument, /Document Reference:/);
  assert.doesNotMatch(deterministicFireDocument, /^#?\s*Analyse de risques – Projet à valider\s*$/m);
  assert.doesNotMatch(deterministicFireDocument, /## 4\. Périmètre de l’analyse\n\n\| Abréviation \| Définition \|/);
  assert.doesNotMatch(deterministicFireDocument, /## 9\. Tableau principal d’analyse des risques\n\n/);
  assert.doesNotMatch(deterministicFireDocument, /## 11\. Priorités d’action\n\nScore =/);
  assert.doesNotMatch(deterministicFireDocument, /## 16\. Annexes nécessaires\n\n.*\bPAA\b/s);
  assert.doesNotMatch(deterministicFireDocument, /## 17\. Conclusion\n\n\| Document \| Pourquoi/s);
  assert.doesNotMatch(deterministicFireDocument, /--- ---/);
  assert.doesNotMatch(section122Text, /Tâche\s*\|\s*Danger/);
  assert.doesNotMatch(section122Text, /Score initial/);
  assert.doesNotMatch(section122Text, /\|\s*Moyen\s*\|/);
  assert.match(deterministicFireDocument, /Stockage et manutention de solvants/);
  assert.match(deterministicFireDocument, /Centraliser FDS, vérifier étiquetage CLP/);

  const normalizedDutch = normalizeRiskLevels(`| Nr. | Activiteit | Score | Niveau |
| --- | --- | --- | --- |
| 1 | Onderhoud | 10 | Gemiddeld |
| 2 | Onderhoud | 30 | Hoog |
| 3 | Onderhoud | 31 | Gemiddeld |
`);

  assert.match(normalizedDutch, /\|\s*1\s*\|\s*Onderhoud\s*\|\s*10\s*\|\s*Laag\s*\|/);
  assert.match(normalizedDutch, /\|\s*2\s*\|\s*Onderhoud\s*\|\s*30\s*\|\s*Gemiddeld\s*\|/);
  assert.match(normalizedDutch, /\|\s*3\s*\|\s*Onderhoud\s*\|\s*31\s*\|\s*Hoog\s*\|/);

  const normalizedGerman = normalizeRiskLevels(`| Nr. | Tätigkeit oder Aufgabe | Punktzahl | Niveau |
| --- | --- | --- | --- |
| 1 | Wartung | 10 | Mittel |
| 2 | Wartung | 30 | Hoch |
| 3 | Wartung | 31 | Mittel |
`);

  assert.match(normalizedGerman, /\|\s*1\s*\|\s*Wartung\s*\|\s*10\s*\|\s*Niedrig\s*\|/);
  assert.match(normalizedGerman, /\|\s*2\s*\|\s*Wartung\s*\|\s*30\s*\|\s*Mittel\s*\|/);
  assert.match(normalizedGerman, /\|\s*3\s*\|\s*Wartung\s*\|\s*31\s*\|\s*Hoch\s*\|/);

  runInternalDocumentTypeTests();
  runRiskPromptQualityTests();

  console.info('Internal risk normalization and document template checks passed.');
}

function runInternalDocumentTypeTests() {
  const minimalFormData = {
    secteurActivite: 'Service technique communal',
    siteLieuTravail: 'Atelier central',
    activitePoste: 'Maintenance, voirie et interventions techniques',
    machinesEquipements: 'Outillage électroportatif, tondeuses, véhicules utilitaires',
    accidentsIncidents: 'Incident de manutention sans incapacité',
    informationsComplementaires: 'Présence de coactivité avec citoyens et sous-traitants.',
  };

  for (const definition of NEW_DOCUMENT_DEFINITIONS) {
    assert.equal(
      validateGenerateDocumentPayload(definition.labels.fr, minimalFormData),
      definition,
      `${definition.labels.fr} should validate with minimal adapted fields`,
    );
  }

  const annualDefinition = getDocumentDefinition('Plan annuel d’action');
  const expectedTitles = {
    fr: 'Plan annuel d’action – Projet à adapter et à valider',
    nl: 'Jaaractieplan – Ontwerp aan te passen en te valideren',
    en: 'Annual Action Plan – Draft to be adapted and validated',
    de: 'Jährlicher Aktionsplan – Entwurf zur Anpassung und Validierung',
  };
  const expectedFallbacks = {
    fr: LANGUAGE_CONFIGS.fr.missingInfo,
    nl: LANGUAGE_CONFIGS.nl.missingInfo,
    en: LANGUAGE_CONFIGS.en.missingInfo,
    de: LANGUAGE_CONFIGS.de.missingInfo,
  };

  for (const language of ['fr', 'nl', 'en', 'de']) {
    const prompt = buildUserPrompt(
      'Plan annuel d’action',
      minimalFormData,
      language,
      LANGUAGE_CONFIGS[language].label,
      annualDefinition,
    );

    assert.match(prompt, new RegExp(escapeRegExp(`# ${expectedTitles[language]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(expectedFallbacks[language])));
  }

  const safetyVisitDefinition = getDocumentDefinition('Rapport de visite sécurité');
  const splitDocument = processGeneratedDocument(
    `# Rapport principal\n\nContenu\n${SECONDARY_DOCUMENT_SEPARATOR}\n# ${LANGUAGE_CONFIGS.fr.secondaryTitle}\n\nSuivi`,
    safetyVisitDefinition,
  );

  assert.equal(splitDocument.document, '# Rapport principal\n\nContenu');
  assert.equal(splitDocument.complementaryDocument, `# ${LANGUAGE_CONFIGS.fr.secondaryTitle}\n\nSuivi`);
}

function runRiskPromptQualityTests() {
  const formData = {
    secteurActivite: 'Atelier technique communal',
    nombreTravailleurs: '35',
    siteLieuTravail: 'Atelier central et dépôt',
    activitePoste: 'Maintenance, stockage, intervention sur machines et produits',
    machinesEquipements: 'Scie, perceuse à colonne, outillage électroportatif, chariots',
    produitsDangereux: 'Solvants inflammables, aérosols, batteries lithium-ion, huiles',
    travailleursExposes: 'Agents techniques, magasiniers, intérimaires et sous-traitants',
    accidentsIncidents: 'Presque accident lors d’une manutention et départ de feu évité',
    mesuresExistantes: 'Extincteurs, ventilation générale, procédures partielles',
    presenceCppt: 'Oui',
    serviceInterneExterne: 'SIPPT et SEPPT',
    contraintesParticulieres: 'Coactivité avec chauffeurs et visiteurs',
    informationsComplementaires:
      'FDS incomplètes, visite terrain à confirmer, rapports de contrôle non joints.',
  };
  const cases = RISK_DOCUMENT_TYPES.flatMap((documentType) =>
    ['fr', 'nl', 'en', 'de'].map((language) => [documentType, language]),
  );

  for (const [documentType, language] of cases) {
    const config = LANGUAGE_CONFIGS[language];
    const prompt = buildUserPrompt(documentType, formData, language, config.label);

    assert.match(prompt, /Réponds uniquement avec un JSON valide/);
    assert.match(prompt, /Ne génère aucun titre markdown/);
    assert.match(prompt, /aucun tableau markdown/);
    assert.match(prompt, /Schéma JSON interne obligatoire/);
    assert.match(prompt, /"documentIdentification"/);
    assert.match(prompt, /"mainRiskAssessment"/);
    assert.match(prompt, /"initialAssessment"/);
    assert.match(prompt, /"measuresFollowUpValidation"/);
    assert.match(prompt, /"stopLevel"/);
    assert.match(prompt, /"conclusion"/);
    assert.match(prompt, /"validationStatement"/);
    assert.match(prompt, new RegExp(escapeRegExp(config.finalMention)));
    assert.match(prompt, new RegExp(escapeRegExp(getAllowedStopLevels(language).join('; '))));
    assert.doesNotMatch(prompt, /## 4\./);
    assert.doesNotMatch(prompt, /\| N° \|/);
    assert.match(prompt, /Score =|Scoremethode|Risk scoring method|Bewertungsmethode/);
    assert.match(prompt, /1-10/);
    assert.match(prompt, /61-125/);
  }

  const renderCases = [
    ['Analyse de risques incendie et évacuation', 'fr'],
    ['Analyse de risques produits chimiques', 'fr'],
    ['Analyse de risques machines et équipements', 'fr'],
    ['Analyse de risques ergonomie', 'fr'],
    ['Analyse de risques générale', 'nl'],
    ['Analyse de risques générale', 'en'],
    ['Analyse de risques générale', 'de'],
  ];

  for (const [documentType, language] of renderCases) {
    const config = LANGUAGE_CONFIGS[language];
    const sample = validateRiskAssessmentStructuredData(getRiskAssessmentJsonSchema(), language);
    sample.documentIdentification.type = documentType;
    sample.glossary = [{ abbreviation: 'STOP', definition: 'Hiérarchie des mesures de prévention.' }];
    sample.scope.includedPlaces = ['Atelier'];
    sample.photoPlan.photos = [{ photoNumber: '1', areaOrTask: 'Atelier' }];
    sample.mainRiskAssessment.initialAssessment[0].number = '1';
    sample.mainRiskAssessment.measuresFollowUpValidation[0].number = '1';
    sample.mainRiskAssessment.measuresFollowUpValidation[0].stopLevel = getDefaultStopLevel(language);

    const document = renderRiskAssessmentMarkdown(sample, language);
    assert.match(document, new RegExp(escapeRegExp(`## 4. ${config.sections[3]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 5. ${config.sections[4]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 9. ${config.sections[8]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 11. ${config.sections[10]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 16. ${config.sections[15]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 17. ${config.sections[16]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 18. ${config.sections[17]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 19. ${config.sections[18]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 22. ${config.sections[21]}`)));
    assert.match(document, new RegExp(escapeRegExp(`## 23. ${config.sections[22]}`)));
    assert.match(document, new RegExp(escapeRegExp(`### 12.1 ${config.riskInitialSubsectionTitle}`)));
    assert.match(document, new RegExp(escapeRegExp(`### 12.2 ${config.riskFollowUpSubsectionTitle}`)));
    assert.match(document, new RegExp(escapeRegExp(`| ${config.riskInitialTableColumns} |`)));
    assert.match(document, new RegExp(escapeRegExp(`| ${config.riskFollowUpTableColumns} |`)));
    assert.doesNotMatch(document, new RegExp(escapeRegExp(`## 9. ${config.sections[11]}`)));
    assert.doesNotMatch(document, new RegExp(escapeRegExp(`## 11. ${config.sections[13]}`)));
    assert.doesNotMatch(document, new RegExp(escapeRegExp(`## 16. ${config.sections[18]}`)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserPrompt(
  documentType,
  formData,
  language = 'fr',
  languageLabel = 'Français',
  documentDefinition = getDocumentDefinition(documentType),
) {
  if (documentDefinition?.family === 'risk_assessment') {
    return buildRiskUserPrompt(documentType, formData, language, languageLabel);
  }

  return buildPreventionDocumentPrompt(
    documentType,
    formData,
    language,
    languageLabel,
    documentDefinition,
  );
}

function buildRiskUserPrompt(documentType, formData, language = 'fr', languageLabel = 'Français') {
  const languageConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const resolvedLanguageLabel = languageConfig.label || languageLabel;

  return buildStructuredRiskUserPrompt(documentType, formData, language, resolvedLanguageLabel);

  const riskScale = formatRiskScale(language);
  const scoringMethodInstruction = buildRiskScoringMethodInstruction(language);
  const abbreviationGlossaryInstruction = buildAbbreviationGlossaryInstruction(language);
  const sectionPlacementRules = buildRiskSectionPlacementRules(language);
  const businessBlockInstruction = buildBusinessBlockInstruction(language);
  const advisorHelpBlockInstruction = buildAdvisorHelpBlockInstruction(language);
  const actionTypeInstruction = buildActionTypeInstruction(language);
  const specializationInstruction = buildRiskSpecializationInstruction(documentType);
  const evidenceInstruction = buildRiskEvidenceInstruction(documentType, language);
  const photoInstruction = buildRiskPhotoInstruction(documentType, language);
  const tableColumns = buildRiskSupportTableColumns(language);
  const photoPlanInstruction = buildRiskPhotoPlanInstruction(documentType, language);
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
3. Respecte exactement cette structure de ${languageConfig.sections.length} sections, dans cet ordre, avec ces titres traduits :
${structure}
Do not renumber, rename, merge or skip these sections. If a generated heading number does not match the title above, rewrite it before answering.
4. The entire document must be written in the target language. Do not mix languages. Use the translated headings, tables, risk levels and final statement from the language configuration. Do not use these non-target headings or terms: ${languageConfig.forbiddenTerms.join('; ')}.
5. Apply this strict placement matrix before answering. If content is under the wrong heading, move it to the correct section and keep the original section focused:
${sectionPlacementRules}
6. Section 3 must contain a Markdown table with exactly these columns in the target language: ${tableColumns.reference}. Select the relevant Belgian references from the general and theme-specific references: Law of 4 August 1996, Code on Well-being at Work, Book I Title 2, Global Prevention Plan, Annual Action Plan, internal prevention service, health and safety committee consultation if applicable, and depending on the topic Book III, Book III Title 3, Book III Title 6, Book IV, Book VI, Book VIII, Book VIII Title 3, Book I Title 3, Book IX and specific worker rules. Do not invent precise articles. If uncertain, write: ${languageConfig.referenceToCheck}
7. Section 4 must be titled exactly "${languageConfig.sections[3]}". It must contain only abbreviations and important technical terms actually used in the generated document. Do not add a large generic glossary. If ATEX, CMR, CLP or TMS is not used in this analysis, do not explain it. The section must not be empty: detect the abbreviations used and include the relevant ones only. Never place sites, activities, exposed workers or perimeter limits here. Use definitions in ${resolvedLanguageLabel}: ${abbreviationGlossaryInstruction}
8. At the first natural important occurrence in the body text, write the full term followed by the abbreviation in parentheses, for example the target-language equivalent of "Plan Annuel d’Action (PAA)", "Plan Global de Prévention (PGP)", "Comité pour la Prévention et la Protection au Travail (CPPT)", "Fiche de Données de Sécurité (FDS)" and "Équipement de Protection Individuelle (EPI)".
9. Section 6 must contain a Markdown table with exactly these columns: ${tableColumns.sources}. Include, where relevant, site visit, workstation observation, photos, worker interviews, line management consultation, health and safety committee consultation, external service opinion, occupational physician opinion, inspection reports, technical sheets, SDS, accident/incident register, training register, plans, instructions, checklist, questionnaire and environmental measurements.
10. Section 5 must contain only scope information: included sites, excluded sites, concerned activities, concerned workers, included situations and scope limits. It must not contain glossary definitions. Section 7 must distinguish facts provided, observations, declarations, cautious assumptions, available evidence, missing evidence and limits. Do not place blocking-point synthesis here; it belongs only in section 21. Never turn an assumption into a fact and never state that the analysis is complete or final.
11. Section 8 must contain a Markdown table with exactly these columns: ${tableColumns.jobs}. It must identify real activities, exposure frequency and duration, exposed workers, equipment/products, specific constraints, photos to take and documents to attach.
12. Section 9 is mandatory and must contain the purpose of photos plus a Markdown table with exactly these columns: ${tableColumns.photos}. For each photo, state the photo number, area or task, what it must show, why it is useful, where to insert it, whether it also goes in an annex, confidentiality precautions, linked risk number if possible, linked action, expected evidence, linked annex and before/after correction indication. Explain that photos objectify findings, illustrate risk situations and keep before/after evidence. Include these photo rules: no faces unless necessary, avoid visible personal data, mask number plates if not useful, take a general photo then a detail photo, take before and after correction photos, date photos, identify the area and keep originals in the evidence file. Adapt the rows to the analysis type: ${photoPlanInstruction}
13. Section 10 must always contain 6 to 8 concrete hazards in a Markdown table with exactly these columns: ${languageConfig.hazardTableColumns}. Each row must explain what to verify, how to verify it, which proof and photo to add, and whether it blocks validation. Never write only "to be checked" or an equivalent.
14. Section 11 must be titled exactly "${languageConfig.sections[10]}" and must explain the formula, scales, thresholds and interpretation. Use this content in the target language: ${scoringMethodInstruction}
15. Section 12 must be titled exactly "${languageConfig.sections[11]}". It must not contain one wide main table. It must follow this exact sequence:
First, write this sentence exactly in the target language:
${languageConfig.riskLinkingSentence}
Then write:
### 12.1 ${languageConfig.riskInitialSubsectionTitle}
Then insert only table 12.1. Table 12.1 must contain 8 complete risk rows with exactly these columns: ${languageConfig.riskInitialTableColumns}.
After the final row of table 12.1, insert one blank line and a short target-language transition sentence meaning "The following table lists the follow-up measures for the same risk numbers." Then write:
### 12.2 ${languageConfig.riskFollowUpSubsectionTitle}
Then insert only table 12.2. Table 12.2 must contain the same 8 risk numbers, in the same order, with exactly these columns: ${languageConfig.riskFollowUpTableColumns}.
Never write heading 12.2 before table 12.1. Never attach table 12.2 directly to table 12.1 without the transition sentence and a blank line. Never use the 12.1 header for table 12.2. Never mix 12.1 columns with 12.2 columns. Split the information that would previously have been in one wide table between 12.1 and 12.2. No risk may disappear. The number column must be identical in 12.1 and 12.2. Keep photo to insert, annex to attach, blocking point yes/no, external opinion/advice yes/no, residual scores and scoring justifications. The STOP level column must contain only one of these values: ${languageConfig.stopLevels}. Never write risk levels such as ${Object.values(languageConfig.riskLevels).join(', ')} in the STOP level column. Do not leave generic cells. If information is unavailable, write an actionable instruction such as the target-language equivalent of "To be confirmed by site visit. Expected evidence: photo of the area and inspection report." Use this wording only as supporting text when useful, never as the whole section: ${languageConfig.provisionalScoreText}
16. Blocking point yes/no and external opinion yes/no are mandatory wherever those columns appear. Use only these blocking values in the target language: ${tableColumns.blockingValues}. Mark blocking yes when missing proof, inspection, site visit, specialist opinion or validation can significantly change risk evaluation or prevent document validation. Mark blocking no when the point can be completed without challenging overall validability. Mark to be determined only when the backend lacks enough information. Never leave the cells empty. Typical blocking points include missing site visit, SDS for dangerous products, electrical inspection report, fire equipment inspection, ATEX analysis where explosive atmosphere is possible, external service opinion for specialised risks, occupational physician opinion for vulnerable workers or health exposure, CPPT consultation when applicable, proof of existing measures, score justification, or a critical risk without immediate action.
17. Before finalising section 12, verify each score and level: ${riskScale}. Score must equal Severity/Gravity x Probability x Exposure and remain coherent with the justifications.
18. In section 12 and section 15, use STOP levels in the target language. STOP means eliminate or substitute the hazard, technical measures, organisational measures, then personal protection if necessary. Use exactly these levels only: ${languageConfig.stopLevels}. Do not use risk-level labels in STOP cells.
19. Section 13 must be a synthetic residual risk analysis, not a copy of the main table. If you use a table, use this compact header only: ${languageConfig.residualTableColumns}. It must identify significant residual risks, conditions to confirm lower scores, missing evidence, standardised status, blocking point yes/no and external opinion yes/no in every row.
20. Section 14 must contain at least 4 structured priorities. Each priority must contain ${languageConfig.priorityLabels}, expected proof, photo or annex where relevant, blocking point yes/no, external opinion yes/no and whether it should be treated as urgent, structural or validation-related. Do not explain the G x P x E method here.
21. Section 15 must always contain 6 to 8 action plan items. Every action must start with a concrete action verb in the target language equivalent of: verify, remove, replace, clear, repair, train, display, control, record, isolate, update, centralise, test or have validated. Use this Markdown table header: ${languageConfig.actionTableColumns}. Do not place this action plan table in section 16. Use only these standardised statuses in action and follow-up tables: ${languageConfig.standardStatuses}. The blocking point and external opinion columns must be filled in every row. Action types to balance: ${actionTypeInstruction}.
22. Section 16 must contain only the link with the Annual Action Plan and the Global Prevention Plan: which urgent actions feed the Annual Action Plan and which structural actions feed the Global Prevention Plan. Do not place actors, annexes, documents to create, the action plan table or consultation details here. First important occurrence must write the full PAA/AAP/JAP and PGP/GPP terms with abbreviations.
23. Section 17 must contain only one Markdown table with exactly these columns: ${tableColumns.documents}. Section 18 must contain only one Markdown table with exactly these columns: ${tableColumns.actors}. Section 19 must contain only one Markdown table with exactly these columns: ${tableColumns.annexes}. Keep documents to create/update, actors and annexes/supporting evidence separate. Use concrete documents and proofs: ${evidenceInstruction} Do not add PAA/PGP links in section 19 and do not add documents-to-create content in section 22.
24. Section 20 must explain simply that the level 3 prevention advisor can prepare, observe, document, report and follow actions, but that certain subjects must be validated by a competent person or expert. Include examples requiring external opinion if present: ATEX, significant chemical exposure, complex fire risk, compartmentation, ventilation, sprinklers, electrical conformity, rack stability, dangerous machines, serious or critical risks, complex psychosocial risks, health surveillance, young workers, pregnant workers and vulnerable workers.
25. Section 21 must summarize blocking points before validation in a Markdown table with exactly these columns: ${tableColumns.blockers}. It must state the number of blocking points, related risk or theme, why it is blocking, expected proof, responsible person, deadline, external opinion yes/no and removal condition. If no blocking point exists, state "0" in the target language and keep one concise row explaining the condition.
26. Use short practical inserts only where useful inside the relevant sections, not as a separate section. Allowed insert labels only: field check, evidence to obtain, photo to take, blocking point, external opinion recommended, immediate action. Target-language labels may be used. Do not overuse inserts; each must be brief and practical. Guidance: ${advisorHelpBlockInstruction}
27. Section 22 conclusion must be a real drafted conclusion in paragraphs, never a table and never a bullet-only placeholder. It must answer clearly: main risks, blocking points, urgent actions, recommended external opinions, missing documents and photos, whether the assessment can feed the Annual Action Plan, whether it can feed the Global Prevention Plan, whether it can be presented to the health and safety committee, why it cannot yet be considered finalised, and the minimum conditions to remove before validation. Do not place the list of documents to create or update here; it belongs only in section 17. If one or more blocking points are present, state clearly that the assessment cannot be finalised as it stands until the blocking points are removed. Never write that it is finalized, compliant or legally complete.
28. Section ${languageConfig.sections.length} must contain exactly this final translated statement, once:
${languageConfig.finalMention}
29. Before answering, perform a strict mental quality check: all ${languageConfig.sections.length} sections are present and ordered; glossary is only section 4; scope is section 5 and never contains the glossary; photo plan is only section 9; scoring method is only section 11; main risk table is only section 12; section 12 contains both 12.1 "${languageConfig.riskInitialSubsectionTitle}" and 12.2 "${languageConfig.riskFollowUpSubsectionTitle}"; there is no single main table with 25 or more columns; priorities are section 14 and not the scoring method; PAA/PGP link is only section 16 and never in annexes; documents to create/update are only section 17 and never in the conclusion; actors are only section 18; annexes are only section 19; conclusion is separate, drafted, not a table and contains no final validation statement; final statement appears once in section 23. Do not include visible Markdown horizontal separators such as "---", "----" or "| --- |". Headings match the target language exactly; Belgian references are present; abbreviations used are explained in ${resolvedLanguageLabel}; scope, sources, assumptions and limits are clear; jobs/tasks/workers are described; photo plan is present; hazards are detailed; G x P x E scoring and justifications are present; existing measures, existing evidence, complementary measures, STOP level, responsible persons, deadlines, expected proofs, residual risks, action plan, PAA/PGP link, documents, actors, annexes, level 3 limits, blocking points, conclusion and final statement are present. Verify that point bloquant yes/no and external opinion yes/no columns are present where required, standardised statuses are used and no section is empty. If an item is missing, add it or clearly mark it as to be completed with an actionable proof request.
30. Rappel RGPD dans la langue cible : ${languageConfig.gdprReminder}
31. Garde une réponse concise pour éviter les timeouts.`;
}

function buildStructuredRiskUserPrompt(documentType, formData, language = 'fr', languageLabel = 'Français') {
  const languageConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const riskScale = formatRiskScale(language);
  const specializationInstruction = buildRiskSpecializationInstruction(documentType);
  const evidenceInstruction = buildRiskEvidenceInstruction(documentType, language);
  const photoInstruction = buildRiskPhotoInstruction(documentType, language);
  const photoPlanInstruction = buildRiskPhotoPlanInstruction(documentType, language);
  const scoringMethodInstruction = buildRiskScoringMethodInstruction(language);

  return `Type de document demandé : ${documentType}
Langue cible déterminée par le backend : ${language} (${languageLabel})

Données formData à exploiter :
${JSON.stringify(formData, null, 2)}

Réponds uniquement avec un JSON valide. Ne mets aucun texte avant ou après le JSON. Ne mets pas de bloc markdown.
Ne génère aucun titre markdown, aucun tableau markdown et aucun séparateur markdown. Le backend reconstruira les titres et tableaux.
Utilise uniquement les champs du schéma JSON fourni. Remplis chaque section avec du contenu professionnel dans la langue cible.
Ne déclare jamais le document finalisé, conforme ou juridiquement complet.
Distingue faits fournis, hypothèses prudentes, preuves manquantes et points à valider.

Schéma JSON interne obligatoire :
${JSON.stringify(getRiskAssessmentJsonSchema(), null, 2)}

Règles métier :
- Produis 6 à 8 dangers concrets dans hazardIdentification.
- Produis 8 risques cohérents dans mainRiskAssessment.initialAssessment.
- Produis une ligne correspondante dans mainRiskAssessment.measuresFollowUpValidation pour chaque risque initial, avec le même number.
- Score = Gravité x Probabilité x Exposition. Vérifie les niveaux : ${riskScale}.
- mainRiskAssessment.measuresFollowUpValidation[].stopLevel doit utiliser uniquement une valeur autorisée : ${getAllowedStopLevels(language).join('; ')}.
- N’utilise jamais ces valeurs dans stopLevel : ${getForbiddenRiskLevelValues().join('; ')}.
- Si une information manque, écris une instruction concrète de validation et une preuve attendue, pas un simple placeholder.
- La conclusion doit être un paragraphe rédigé, jamais un tableau.
- validationStatement doit reprendre exactement : ${languageConfig.finalMention}
- Adapte les risques au type demandé : ${specializationInstruction}
- Preuves et documents attendus : ${evidenceInstruction}
- Photos attendues : ${photoInstruction}
- Plan photos : ${photoPlanInstruction}
- Méthode de cotation à renseigner dans scoringMethod : ${scoringMethodInstruction}`;
}

function getRiskAssessmentJsonSchema() {
  return {
    documentIdentification: {
      type: '',
      reference: '',
      company: '',
      site: '',
      services: '',
      author: '',
      version: '',
      visitDate: '',
      fieldCheckNote: '',
    },
    contextObjective: '',
    regulatoryReferences: [
      {
        reference: '',
        whyApplicable: '',
        practicalConsequence: '',
        documentOrEvidence: '',
        validationOrAdvice: '',
      },
    ],
    glossary: [{ abbreviation: '', definition: '' }],
    scope: {
      includedPlaces: [],
      excludedPlaces: [],
      activities: [],
      exposedJobs: [],
      includedSituations: [],
      scopeLimits: [],
    },
    informationSources: [
      {
        source: '',
        available: '',
        comment: '',
        expectedEvidence: '',
        whereToFile: '',
      },
    ],
    assumptionsLimitations: {
      factsProvided: [],
      partialObservations: [],
      missingInformation: [],
      pointsToValidate: [],
      limits: [],
    },
    jobsTasksExposedWorkers: [
      {
        jobOrTask: '',
        realActivityDescription: '',
        frequency: '',
        exposureDuration: '',
        exposedWorkers: '',
        equipmentOrProductsUsed: '',
        particularities: '',
        photosToTake: '',
        documentsToAttach: '',
      },
    ],
    photoPlan: {
      intro: '',
      confidentialityRules: [],
      photos: [
        {
          photoNumber: '',
          areaOrTask: '',
          whatPhotoMustShow: '',
          whyUseful: '',
          whereToInsert: '',
          alsoAnnex: '',
          confidentialityPrecautions: '',
          relatedRisk: '',
          relatedAction: '',
          expectedEvidence: '',
          relatedAnnex: '',
          beforeAfter: '',
        },
      ],
    },
    hazardIdentification: [
      {
        hazardFamily: '',
        preciseHazard: '',
        plausibleScenario: '',
        areaOrTask: '',
        exposedPersons: '',
        aggravatingFactors: '',
        knownExistingMeasures: '',
        evidenceToCheck: '',
        whatAdvisorMustDo: '',
        whereToDocumentEvidence: '',
        blockingBeforeValidation: '',
        photosToTake: '',
      },
    ],
    scoringMethod: {
      formula: 'Score = Gravité × Probabilité × Exposition',
      severityScale: [],
      probabilityScale: [],
      exposureScale: [],
      thresholds: [],
      confirmationNote: '',
    },
    mainRiskAssessment: {
      intro: '',
      initialAssessment: [
        {
          number: '',
          task: '',
          hazard: '',
          hazardousSituationOrScenario: '',
          possibleRiskOrHarm: '',
          exposed: '',
          existingMeasures: '',
          existingEvidence: '',
          observedOrDeclaredElements: '',
          elementsToConfirm: '',
          severity: '',
          probability: '',
          exposure: '',
          scoringJustification: '',
          initialScore: '',
          initialLevel: '',
        },
      ],
      measuresFollowUpValidation: [
        {
          number: '',
          additionalMeasure: '',
          stopLevel: '',
          responsible: '',
          deadline: '',
          residualScore: '',
          residualLevel: '',
          residualScoreJustification: '',
          expectedEvidence: '',
          photoToInsert: '',
          annexToAttach: '',
          priority: '',
          blockingPoint: '',
          externalAdvice: '',
        },
      ],
    },
    residualRiskAnalysis: [
      {
        mainRisk: '',
        initialScore: '',
        residualScore: '',
        reductionCondition: '',
        requiredEvidence: '',
        standardStatus: '',
        blockingPoint: '',
        externalAdvice: '',
      },
    ],
    actionPriorities: [
      {
        action: '',
        relatedRisk: '',
        responsible: '',
        deadline: '',
        expectedEvidence: '',
        blockingPoint: '',
        externalAdvice: '',
        actionType: '',
      },
    ],
    draftActionPlan: [
      {
        relatedRisk: '',
        actionToPerform: '',
        responsible: '',
        deadline: '',
        expectedEvidence: '',
        photoAfterCorrection: '',
        standardStatus: '',
        paaOrPgpLink: '',
        blockingPoint: '',
        externalAdvice: '',
      },
    ],
    paaPgpLink: {
      paaActions: [],
      pgpActions: [],
      cpptRole: '',
      managementFollowUp: '',
    },
    documentsToCreateOrUpdate: [
      {
        document: '',
        whyCreateOrUpdate: '',
        responsible: '',
        deadline: '',
        expectedEvidence: '',
        relatedAnnex: '',
        priority: '',
      },
    ],
    actorsToConsult: [
      {
        actor: '',
        expectedRole: '',
        consultationMoment: '',
        expectedEvidence: '',
        mandatoryOrRecommended: '',
        limitForLevel3Advisor: '',
      },
    ],
    requiredAnnexes: [
      {
        annex: '',
        mandatoryRecommendedOrDepending: '',
        whyNecessary: '',
        whoProvidesIt: '',
        whereToFile: '',
        status: '',
      },
    ],
    level3AdvisorLimits: '',
    blockingPointsBeforeValidation: [
      {
        point: '',
        whyBlocking: '',
        expectedEvidence: '',
        responsible: '',
        deadline: '',
        externalAdvice: '',
        liftingCondition: '',
      },
    ],
    conclusion: '',
    validationStatement: '',
  };
}

function getRiskAssessmentBlockDefinitions() {
  const schema = getRiskAssessmentJsonSchema();

  return [
    {
      key: 'A',
      label: 'A',
      title: 'Identification et cadrage',
      fields: [
        'documentIdentification',
        'contextObjective',
        'regulatoryReferences',
        'glossary',
        'scope',
        'informationSources',
        'assumptionsLimitations',
      ],
      schema: pickObjectKeys(schema, [
        'documentIdentification',
        'contextObjective',
        'regulatoryReferences',
        'glossary',
        'scope',
        'informationSources',
        'assumptionsLimitations',
      ]),
    },
    {
      key: 'B',
      label: 'B',
      title: 'Analyse terrain',
      fields: [
        'jobsTasksExposedWorkers',
        'photoPlan',
        'hazardIdentification',
        'scoringMethod',
      ],
      schema: pickObjectKeys(schema, [
        'jobsTasksExposedWorkers',
        'photoPlan',
        'hazardIdentification',
        'scoringMethod',
      ]),
    },
    {
      key: 'C',
      label: 'C',
      title: 'Analyse des risques',
      fields: ['risks'],
      schema: getSimplifiedRiskBlockCSchema(),
    },
    {
      key: 'D',
      label: 'D',
      title: 'Actions et validation',
      fields: [
        'actionPriorities',
        'draftActionPlan',
        'paaPgpLink',
        'documentsToCreateOrUpdate',
        'actorsToConsult',
        'requiredAnnexes',
        'level3AdvisorLimits',
        'blockingPointsBeforeValidation',
        'conclusion',
        'validationStatement',
      ],
      schema: pickObjectKeys(schema, [
        'actionPriorities',
        'draftActionPlan',
        'paaPgpLink',
        'documentsToCreateOrUpdate',
        'actorsToConsult',
        'requiredAnnexes',
        'level3AdvisorLimits',
        'blockingPointsBeforeValidation',
        'conclusion',
        'validationStatement',
      ]),
    },
  ];
}

function getSimplifiedRiskBlockCSchema() {
  return {
    risks: [
      {
        number: '1',
        initial: {
          task: '',
          hazard: '',
          hazardousSituationOrScenario: '',
          possibleRiskOrHarm: '',
          exposed: '',
          existingMeasures: '',
          existingEvidence: '',
          observedOrDeclaredElements: '',
          elementsToConfirm: '',
          severity: '',
          probability: '',
          exposure: '',
          scoringJustification: '',
          initialScore: '',
          initialLevel: '',
        },
        followUp: {
          additionalMeasure: '',
          stopLevel: '',
          responsible: '',
          deadline: '',
          residualScore: '',
          residualLevel: '',
          residualScoreJustification: '',
          expectedEvidence: '',
          photoToInsert: '',
          annexToAttach: '',
          priority: '',
          blockingPoint: '',
          externalAdvice: '',
        },
        residual: {
          mainRisk: '',
          initialScore: '',
          residualScore: '',
          reductionCondition: '',
          requiredEvidence: '',
          standardStatus: '',
          blockingPoint: '',
          externalAdvice: '',
        },
      },
    ],
  };
}

function pickObjectKeys(value, keys) {
  return keys.reduce((result, key) => ({
    ...result,
    [key]: value[key],
  }), {});
}

function buildRiskAssessmentBlockPrompt({
  block,
  documentType,
  formData,
  languageCode,
  languageLabel,
  retry = false,
}) {
  const languageConfig = LANGUAGE_CONFIGS[languageCode] || LANGUAGE_CONFIGS.fr;
  const tableLimits = retry
    ? `Limites strictes pour ce nouvel essai :
- regulatoryReferences : max 6
- informationSources : max 8
- jobsTasksExposedWorkers : max 8
- photoPlan.photos : max 8
- hazardIdentification : max 8
- initialAssessment : max 8
- measuresFollowUpValidation : max 8
- residualRiskAnalysis : max 8
- draftActionPlan : max 8
- requiredAnnexes : max 8
- actorsToConsult : max 8
- blockingPointsBeforeValidation : max 8`
    : 'Longueur attendue : reste concis, vise 6 à 8 lignes maximum dans les listes de risques, actions, annexes et acteurs.';
  const blockCInstructions = block.key === 'C'
    ? `
Règles strictes bloc C :
- Génère uniquement {"risks":[...]} selon le schéma fourni.
- Génère 6 risques par défaut.
- Génère maximum 8 risques si le formulaire contient beaucoup d'informations.
- Chaque risque contient obligatoirement initial, followUp et residual.
- Ne génère jamais trois tableaux séparés dans le JSON.
- Toutes les valeurs doivent être des chaînes simples.
- Pas de tableau dans les champs texte.
- Pas de guillemets non échappés dans les valeurs.
- Pas de retour ligne dans les valeurs.
- Phrases courtes et cellules compactes.
- N'écris aucune longue explication dans ce bloc.
- followUp.stopLevel doit utiliser uniquement : ${getAllowedStopLevels(languageCode).join('; ')}
- Si tu hésites sur le STOP, écris : ${getDefaultStopLevel(languageCode)}`
    : '';

  return `Type de document demandé : ${documentType}
Langue cible : ${languageCode} (${languageConfig.label || languageLabel})
Bloc demandé : ${block.label} - ${block.title}

Données formData à exploiter :
${JSON.stringify(formData, null, 2)}

Réponds uniquement avec un JSON valide.
Interdits : markdown, bloc \`\`\`json, bloc \`\`\`, tableaux markdown, séparateurs ---, texte avant ou après JSON.
Ne génère aucun titre de document : le renderer backend gère les titres et l’ordre.
Utilise uniquement les champs du schéma de ce bloc.
Si une information manque, écris une instruction concrète de validation et une preuve attendue.
Ne déclare jamais le document finalisé, conforme ou juridiquement complet.

Schéma JSON de ce bloc uniquement :
${JSON.stringify(block.schema, null, 2)}

Règles utiles :
- Rédige tout en ${languageConfig.label || languageLabel}.
- Adapte le contenu au document : ${buildRiskSpecializationInstruction(documentType)}
- Méthode de cotation : ${buildRiskScoringMethodInstruction(languageCode)}
- Preuves et documents attendus : ${buildRiskEvidenceInstruction(documentType, languageCode)}
- Photos attendues : ${buildRiskPhotoInstruction(documentType, languageCode)}
- STOP autorisé uniquement dans measuresFollowUpValidation[].stopLevel : ${getAllowedStopLevels(languageCode).join('; ')}
- N’utilise jamais ces valeurs dans stopLevel : ${getForbiddenRiskLevelValues().join('; ')}
- validationStatement, si demandé dans ce bloc, doit reprendre exactement : ${languageConfig.finalMention}
${blockCInstructions}
${tableLimits}`;
}

function transformSimplifiedRiskBlockC(blockC, language = 'fr') {
  const placeholder = getLanguagePlaceholder(language);
  const risks = ensureArray(ensureObject(blockC).risks)
    .slice(0, 8)
    .map((risk, index) => {
      const riskObject = ensureObject(risk);
      const number = cleanRiskNumber(riskObject.number, index + 1);
      const initial = ensureObject(riskObject.initial);
      const followUp = ensureObject(riskObject.followUp);
      const residual = ensureObject(riskObject.residual);

      return {
        number,
        initial: {
          ...buildEmptyInitialRiskRow(number, placeholder),
          ...initial,
          number,
        },
        followUp: {
          ...buildEmptyFollowUpRiskRow(number, placeholder),
          ...followUp,
          number,
          stopLevel: normalizeStructuredStopLevel(followUp.stopLevel, language),
        },
        residual: {
          mainRisk: residual.mainRisk || initial.hazard || initial.possibleRiskOrHarm || number,
          initialScore: residual.initialScore || initial.initialScore || placeholder,
          residualScore: residual.residualScore || followUp.residualScore || placeholder,
          reductionCondition: residual.reductionCondition || followUp.additionalMeasure || placeholder,
          requiredEvidence: residual.requiredEvidence || followUp.expectedEvidence || placeholder,
          standardStatus: residual.standardStatus || placeholder,
          blockingPoint: residual.blockingPoint || followUp.blockingPoint || placeholder,
          externalAdvice: residual.externalAdvice || followUp.externalAdvice || placeholder,
        },
      };
    });

  return {
    mainRiskAssessment: {
      initialAssessment: risks.map((risk) => risk.initial),
      measuresFollowUpValidation: risks.map((risk) => risk.followUp),
    },
    residualRiskAnalysis: risks.map((risk) => risk.residual),
  };
}

function assembleStructuredRiskAssessmentBlocks(blocks, language = 'fr') {
  return validateRiskAssessmentStructuredData({
    ...buildFallbackStructuredRiskAssessment(language),
    ...ensureObject(blocks.A),
    ...ensureObject(blocks.B),
    ...ensureObject(blocks.C),
    ...ensureObject(blocks.D),
  }, language);
}

function buildFallbackStructuredRiskAssessment(language = 'fr') {
  return assembleFallbackStructuredRiskAssessment([
    buildFallbackRiskAssessmentBlock('A', language),
    buildFallbackRiskAssessmentBlock('B', language),
    buildFallbackRiskAssessmentBlock('C', language),
    buildFallbackRiskAssessmentBlock('D', language),
  ], language);
}

function assembleFallbackStructuredRiskAssessment(parts, language = 'fr') {
  return {
    ...getRiskAssessmentJsonSchema(),
    ...parts.reduce((result, part) => ({ ...result, ...part }), {}),
    validationStatement: (LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr).finalMention,
  };
}

function buildFallbackRiskAssessmentBlock(blockKey, language = 'fr', formData = {}, documentType = '') {
  const placeholder = getLanguagePlaceholder(language);
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const scoringMethodText = buildRiskScoringMethodInstruction(language);
  const defaultRows = Array.from({ length: 4 }, (_unused, index) => String(index + 1));

  if (blockKey === 'A') {
    return {
      documentIdentification: {
        type: placeholder,
        reference: placeholder,
        company: placeholder,
        site: placeholder,
        services: placeholder,
        author: placeholder,
        version: 'Projet',
        visitDate: placeholder,
        fieldCheckNote: placeholder,
      },
      contextObjective: placeholder,
      regulatoryReferences: defaultRows.slice(0, 3).map((number) => ({
        reference: number === '1' ? 'Code belge du bien-être au travail' : placeholder,
        whyApplicable: placeholder,
        practicalConsequence: placeholder,
        documentOrEvidence: placeholder,
        validationOrAdvice: placeholder,
      })),
      glossary: [
        { abbreviation: 'PAA', definition: placeholder },
        { abbreviation: 'PGP', definition: placeholder },
        { abbreviation: 'STOP', definition: placeholder },
      ],
      scope: {
        includedPlaces: [placeholder],
        excludedPlaces: [placeholder],
        activities: [placeholder],
        exposedJobs: [placeholder],
        includedSituations: [placeholder],
        scopeLimits: [placeholder],
      },
      informationSources: defaultRows.map(() => ({
        source: placeholder,
        available: placeholder,
        comment: placeholder,
        expectedEvidence: placeholder,
        whereToFile: placeholder,
      })),
      assumptionsLimitations: {
        factsProvided: [placeholder],
        partialObservations: [placeholder],
        missingInformation: [placeholder],
        pointsToValidate: [placeholder],
        limits: [placeholder],
      },
    };
  }

  if (blockKey === 'B') {
    return {
      jobsTasksExposedWorkers: defaultRows.map(() => ({
        jobOrTask: placeholder,
        realActivityDescription: placeholder,
        frequency: placeholder,
        exposureDuration: placeholder,
        exposedWorkers: placeholder,
        equipmentOrProductsUsed: placeholder,
        particularities: placeholder,
        photosToTake: placeholder,
        documentsToAttach: placeholder,
      })),
      photoPlan: {
        intro: placeholder,
        confidentialityRules: [placeholder],
        photos: defaultRows.map((number) => ({
          photoNumber: number,
          areaOrTask: placeholder,
          whatPhotoMustShow: placeholder,
          whyUseful: placeholder,
          whereToInsert: placeholder,
          alsoAnnex: placeholder,
          confidentialityPrecautions: placeholder,
          relatedRisk: number,
          relatedAction: placeholder,
          expectedEvidence: placeholder,
          relatedAnnex: placeholder,
          beforeAfter: placeholder,
        })),
      },
      hazardIdentification: defaultRows.map(() => ({
        hazardFamily: placeholder,
        preciseHazard: placeholder,
        plausibleScenario: placeholder,
        areaOrTask: placeholder,
        exposedPersons: placeholder,
        aggravatingFactors: placeholder,
        knownExistingMeasures: placeholder,
        evidenceToCheck: placeholder,
        whatAdvisorMustDo: placeholder,
        whereToDocumentEvidence: placeholder,
        blockingBeforeValidation: placeholder,
        photosToTake: placeholder,
      })),
      scoringMethod: {
        formula: scoringMethodText.split('.')[0] || 'Score = Gravité × Probabilité × Exposition',
        severityScale: [placeholder],
        probabilityScale: [placeholder],
        exposureScale: [placeholder],
        thresholds: [formatRiskScale(language)],
        confirmationNote: placeholder,
      },
    };
  }

  if (blockKey === 'C') {
    return buildUsefulFallbackRiskBlockC(language, formData, documentType);
  }

  return {
    actionPriorities: defaultRows.map((number) => ({
      action: placeholder,
      relatedRisk: number,
      responsible: placeholder,
      deadline: placeholder,
      expectedEvidence: placeholder,
      blockingPoint: placeholder,
      externalAdvice: placeholder,
      actionType: placeholder,
    })),
    draftActionPlan: defaultRows.map((number) => ({
      relatedRisk: number,
      actionToPerform: placeholder,
      responsible: placeholder,
      deadline: placeholder,
      expectedEvidence: placeholder,
      photoAfterCorrection: placeholder,
      standardStatus: placeholder,
      paaOrPgpLink: placeholder,
      blockingPoint: placeholder,
      externalAdvice: placeholder,
    })),
    paaPgpLink: {
      paaActions: [placeholder],
      pgpActions: [placeholder],
      cpptRole: placeholder,
      managementFollowUp: placeholder,
    },
    documentsToCreateOrUpdate: defaultRows.map(() => ({
      document: placeholder,
      whyCreateOrUpdate: placeholder,
      responsible: placeholder,
      deadline: placeholder,
      expectedEvidence: placeholder,
      relatedAnnex: placeholder,
      priority: placeholder,
    })),
    actorsToConsult: defaultRows.map(() => ({
      actor: placeholder,
      expectedRole: placeholder,
      consultationMoment: placeholder,
      expectedEvidence: placeholder,
      mandatoryOrRecommended: placeholder,
      limitForLevel3Advisor: placeholder,
    })),
    requiredAnnexes: defaultRows.map(() => ({
      annex: placeholder,
      mandatoryRecommendedOrDepending: placeholder,
      whyNecessary: placeholder,
      whoProvidesIt: placeholder,
      whereToFile: placeholder,
      status: placeholder,
    })),
    level3AdvisorLimits: placeholder,
    blockingPointsBeforeValidation: defaultRows.map((number) => ({
      point: number,
      whyBlocking: placeholder,
      expectedEvidence: placeholder,
      responsible: placeholder,
      deadline: placeholder,
      externalAdvice: placeholder,
      liftingCondition: placeholder,
    })),
    conclusion: placeholder,
    validationStatement: config.finalMention,
  };
}

function buildUsefulFallbackRiskBlockC(language = 'fr', formData = {}, documentType = '') {
  const sourceContext = buildFallbackRiskSourceContext(formData, language);
  const risks = getFallbackRiskDetailsForDocument(documentType, formData, language);

  const simplifiedBlock = {
    risks: risks.slice(0, 8).map((risk, index) =>
      buildFallbackSimplifiedRisk(String(index + 1), risk, sourceContext, language),
    ),
  };

  return transformSimplifiedRiskBlockC(simplifiedBlock, language);
}

function buildFallbackRiskItems(formData = {}, documentType = '', language = 'fr') {
  const sourceContext = buildFallbackRiskSourceContext(formData, language);
  const fallbackDetails = getFallbackRiskDetailsForDocument(documentType, formData, language);
  const rows = fallbackDetails
    .slice(0, 8)
    .map((risk, index) => buildFallbackSimplifiedRisk(String(index + 1), risk, sourceContext, language))
    .map((risk) => ({
      initial: risk.initial,
      followUp: {
        ...risk.followUp,
        stopLevel: normalizeStructuredStopLevel(risk.followUp.stopLevel, language),
      },
      residual: risk.residual,
    }));

  const collections = buildRiskCollectionsFromRows(rows, language);

  if (
    language === 'fr' &&
    rows.length === 8 &&
    fallbackDetails[0]?.hazard === 'Incendie lié aux produits inflammables'
  ) {
    console.info('[RISK_FALLBACK_TRACE] complete fire fallback risks count: 8');
    console.info(
      `[RISK_FALLBACK_TRACE] initialAssessment: ${collections.mainRiskAssessment.initialAssessment.length} ` +
      `followUp: ${collections.mainRiskAssessment.measuresFollowUpValidation.length} ` +
      `residual: ${collections.residualRiskAnalysis.length} ` +
      `actions: ${collections.actionPriorities.length} draft: ${collections.draftActionPlan.length}`,
    );
  }

  return collections;
}

function buildFallbackRiskSourceContext(formData = {}, language = 'fr') {
  const placeholder = getLanguagePlaceholder(language);
  const pick = (key) => sanitizeCompactRiskValue(formData?.[key], language, 120);

  return {
    activity: pick('activitePoste'),
    products: pick('produitsDangereux'),
    equipment: pick('machinesEquipements'),
    exposed: pick('travailleursExposes'),
    incidents: pick('accidentsIncidents'),
    measures: pick('mesuresExistantes'),
    constraints: pick('contraintesParticulieres'),
    placeholder,
  };
}

function getFallbackRiskNamesForDocument(documentType = '', formData = {}, language = 'fr') {
  return getFallbackRiskDetailsForDocument(documentType, formData, language).map((risk) => risk.hazard);
}

function getFallbackRiskDetailsForDocument(documentType = '', formData = {}, language = 'fr') {
  const normalizedType = normalizeDocumentType(documentType);

  if (
    language === 'fr' &&
    (normalizedType.includes('incendie') || normalizedType.includes('evacuation') || normalizedType.includes('fire'))
  ) {
    return buildFireEvacuationFallbackRiskDetails();
  }

  if (normalizedType.includes('incendie') || normalizedType.includes('evacuation') || normalizedType.includes('fire')) {
    return [
      'Incendie lié aux produits inflammables',
      'Incendie lié à la charge de batteries',
      'Obstruction des issues de secours',
      'Accessibilité des extincteurs ou moyens d’extinction',
      'Portes coupe-feu / compartimentage',
      'Évacuation des travailleurs, visiteurs ou intérimaires',
      'Accès pompiers',
      'Produits dangereux / incompatibilités / FDS manquantes',
    ].map((hazard) => ({ hazard }));
  }

  if (normalizedType.includes('chimique') || normalizedType.includes('chemical')) {
    return [
      'FDS manquantes ou incomplètes',
      'Stockage incompatible',
      'Exposition par inhalation ou contact',
      'Déversement accidentel',
      'Étiquetage CLP insuffisant',
      'Déchets dangereux',
      'EPI inadaptés',
      'Avis médecin du travail ou hygiéniste à prévoir',
    ].map((hazard) => ({ hazard }));
  }

  if (normalizedType.includes('machine') || normalizedType.includes('equipement')) {
    return [
      'Protection machine absente ou insuffisante',
      'Arrêt d’urgence à vérifier',
      'Maintenance ou consignation insuffisante',
      'Formation opérateurs incomplète',
      'Risque de coincement / écrasement',
      'Notice ou marquage CE à vérifier',
      'Accès maintenance',
      'EPI ou consignes insuffisants',
    ].map((hazard) => ({ hazard }));
  }

  return buildGenericFallbackRiskNames(formData).map((hazard) => ({ hazard }));
}

function buildGenericFallbackRiskNames(formData = {}) {
  const risks = [];

  if (hasUsableStringValue(formData.produitsDangereux)) {
    risks.push('Exposition aux produits dangereux');
  }

  if (hasUsableStringValue(formData.machinesEquipements)) {
    risks.push('Utilisation de machines ou équipements');
  }

  risks.push('Activité du poste à valider sur le terrain');

  if (hasUsableStringValue(formData.travailleursExposes)) {
    risks.push('Exposition des travailleurs concernés');
  }

  if (hasUsableStringValue(formData.accidentsIncidents)) {
    risks.push('Risque lié aux accidents ou incidents déclarés');
  }

  risks.push('Efficacité des mesures existantes');
  risks.push('Contraintes particulières de l’activité');
  risks.push('Preuves et validations manquantes');

  return [...new Set(risks)].slice(0, 6);
}

function buildFireEvacuationFallbackRiskDetails() {
  return [
    {
      hazard: 'Incendie lié aux produits inflammables',
      task: 'Stockage et manutention de solvants, aérosols, peintures ou produits inflammables',
      danger: 'Inflammation de produits combustibles ou inflammables',
      hazardousSituationOrScenario: 'Fuite, déversement, stockage incompatible, source d’ignition ou ventilation insuffisante',
      possibleRiskOrHarm: 'Brûlures, intoxication par fumées, propagation incendie, explosion secondaire',
      exposed: 'Caristes, préparateurs, réceptionnaires, techniciens, agents nettoyage, chauffeurs externes',
      existingMeasures: 'Armoires de sécurité, consignes incendie, interdiction de fumer, extincteurs',
      existingEvidence: 'FDS, inventaire produits, photos stockage, rapport contrôle extincteurs',
      observedOrDeclaredElements: 'Produits inflammables déclarés, incidents mineurs signalés, FDS incomplètes possibles',
      elementsToConfirm: 'Quantités stockées, ventilation, compatibilité, séparation et sources d’ignition',
      severity: '5',
      probability: '3',
      exposure: '4',
      scoringJustification: 'Gravité élevée en raison du potentiel de propagation et d’exposition aux fumées',
      initialScore: '60',
      initialLevel: 'Élevé',
      additionalMeasure: 'Vérifier compatibilité, ventilation, quantités stockées et séparation des produits',
      stopLevel: 'Technique + Organisationnelle',
      responsible: 'SIPPT / responsable de site',
      deadline: 'À planifier avant validation',
      residualScore: '20',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction attendue après preuves, séparation et contrôle des sources d’ignition',
      expectedEvidence: 'FDS centralisées, photos stockage, rapport de vérification',
      photoToInsert: 'Photo du local produits inflammables avant/après correction',
      annexToAttach: 'Annexe photos et FDS',
      priority: 'Haute',
      blockingPoint: 'Oui',
      externalAdvice: 'Oui',
    },
    {
      hazard: 'Incendie lié à la charge de batteries',
      task: 'Charge de batteries lithium-ion ou plomb-acide',
      danger: 'Échauffement, court-circuit, dégagement de gaz ou départ de feu',
      hazardousSituationOrScenario: 'Chargeur défectueux, local mal ventilé, proximité de matières combustibles',
      possibleRiskOrHarm: 'Incendie localisé, fumées toxiques, propagation à l’entrepôt',
      exposed: 'Caristes, techniciens maintenance, équipiers d’intervention, travailleurs proches du local',
      existingMeasures: 'Zone de charge définie, consignes, extincteurs adaptés',
      existingEvidence: 'Rapport maintenance chargeurs, photos du local, notice fabricant',
      observedOrDeclaredElements: 'Début d’échauffement batterie déclaré en 2025',
      elementsToConfirm: 'Ventilation, éloignement combustibles, état chargeurs et procédure incident batterie',
      severity: '5',
      probability: '3',
      exposure: '3',
      scoringJustification: 'Risque élevé en cas d’échauffement ou de court-circuit dans une zone de charge',
      initialScore: '45',
      initialLevel: 'Élevé',
      additionalMeasure: 'Contrôler chargeurs, ventilation, éloignement combustibles et procédure incident batterie',
      stopLevel: 'Technique + Organisationnelle',
      responsible: 'Maintenance / SIPPT',
      deadline: 'À planifier avant validation',
      residualScore: '15',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction attendue après contrôle technique et procédure spécifique',
      expectedEvidence: 'Rapport maintenance, photo local batteries, procédure incident batterie',
      photoToInsert: 'Photo zone de charge batteries et dégagement autour des chargeurs',
      annexToAttach: 'Annexe maintenance batteries',
      priority: 'Haute',
      blockingPoint: 'Oui',
      externalAdvice: 'Oui',
    },
    {
      hazard: 'Obstruction des issues de secours',
      task: 'Circulation et évacuation dans les zones de stockage et quais',
      danger: 'Issue, couloir ou voie d’évacuation encombré',
      hazardousSituationOrScenario: 'Palettes, films plastiques, déchets ou marchandises devant une sortie',
      possibleRiskOrHarm: 'Évacuation retardée, panique, exposition prolongée aux fumées',
      exposed: 'Tous les travailleurs, visiteurs, chauffeurs externes et intérimaires',
      existingMeasures: 'Consignes évacuation, signalisation, contrôles internes',
      existingEvidence: 'Photos avant/après, check-list inspection, exercice évacuation',
      observedOrDeclaredElements: 'Issue de secours obstruée par film plastique déclarée',
      elementsToConfirm: 'État réel des issues, marquage au sol, fréquence des contrôles',
      severity: '5',
      probability: '4',
      exposure: '4',
      scoringJustification: 'Risque critique car l’évacuation peut être retardée en situation d’urgence',
      initialScore: '80',
      initialLevel: 'Critique',
      additionalMeasure: 'Dégager les voies, marquer les zones interdites au stockage et contrôler quotidiennement',
      stopLevel: 'Organisationnelle',
      responsible: 'Responsable logistique / ligne hiérarchique',
      deadline: 'Immédiat',
      residualScore: '20',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction après dégagement permanent et contrôle quotidien documenté',
      expectedEvidence: 'Photos avant/après, check-list de contrôle, consigne stockage',
      photoToInsert: 'Photo de chaque issue avant/après dégagement',
      annexToAttach: 'Annexe évacuation',
      priority: 'Urgente',
      blockingPoint: 'Oui',
      externalAdvice: 'Non',
    },
    {
      hazard: 'Accessibilité des moyens d’extinction',
      task: 'Intervention initiale en cas de départ de feu',
      danger: 'Extincteur, dévidoir ou bouton d’alarme inaccessible',
      hazardousSituationOrScenario: 'Équipement masqué par palettes, racks ou marchandises',
      possibleRiskOrHarm: 'Retard d’intervention et aggravation de l’incendie',
      exposed: 'Équipiers d’intervention, travailleurs proches, visiteurs',
      existingMeasures: 'Extincteurs présents, signalisation, contrôles périodiques',
      existingEvidence: 'Rapport contrôle extincteurs, photos, registre inspection',
      observedOrDeclaredElements: 'Extincteur partiellement masqué par palettes déclaré',
      elementsToConfirm: 'Accessibilité réelle, signalisation, marquage et contrôle périodique',
      severity: '5',
      probability: '3',
      exposure: '3',
      scoringJustification: 'Intervention initiale retardée si l’équipement est inaccessible',
      initialScore: '45',
      initialLevel: 'Élevé',
      additionalMeasure: 'Rendre les équipements visibles et accessibles, ajouter marquage au sol si nécessaire',
      stopLevel: 'Technique + Organisationnelle',
      responsible: 'Responsable site / SIPPT',
      deadline: 'Court terme',
      residualScore: '15',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction après accessibilité prouvée et contrôle périodique',
      expectedEvidence: 'Photo, rapport extincteurs, registre d’inspection',
      photoToInsert: 'Photo extincteurs avant/après dégagement',
      annexToAttach: 'Annexe moyens d’extinction',
      priority: 'Haute',
      blockingPoint: 'Oui',
      externalAdvice: 'Non',
    },
    {
      hazard: 'Portes coupe-feu et compartimentage',
      task: 'Séparation des zones à risque et limitation de propagation',
      danger: 'Porte coupe-feu maintenue ouverte ou compartimentage non vérifié',
      hazardousSituationOrScenario: 'Cale, fermeture automatique défaillante, passage fréquent non contrôlé',
      possibleRiskOrHarm: 'Propagation rapide du feu et des fumées',
      exposed: 'Travailleurs entrepôt, bureaux attenants, équipes d’intervention',
      existingMeasures: 'Portes coupe-feu existantes, consignes',
      existingEvidence: 'Rapport contrôle portes, photos, registre maintenance',
      observedOrDeclaredElements: 'Porte coupe-feu maintenue ouverte par une cale déclarée',
      elementsToConfirm: 'Fermeture automatique, état joints, absence de cales, compartimentage',
      severity: '5',
      probability: '3',
      exposure: '4',
      scoringJustification: 'Risque élevé de propagation si le compartimentage ne joue pas son rôle',
      initialScore: '60',
      initialLevel: 'Élevé',
      additionalMeasure: 'Supprimer les cales, vérifier fermeture automatique et sensibiliser le personnel',
      stopLevel: 'Technique + Organisationnelle',
      responsible: 'Maintenance / responsable bâtiment',
      deadline: 'Court terme',
      residualScore: '20',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction après suppression des cales et vérification technique',
      expectedEvidence: 'Photo portes, rapport maintenance, preuve sensibilisation',
      photoToInsert: 'Photo porte coupe-feu ouverte/fermée et dispositif de fermeture',
      annexToAttach: 'Annexe compartimentage',
      priority: 'Haute',
      blockingPoint: 'Oui',
      externalAdvice: 'Oui',
    },
    {
      hazard: 'Évacuation des travailleurs, visiteurs et intérimaires',
      task: 'Évacuation générale du site',
      danger: 'Méconnaissance des consignes ou du point de rassemblement',
      hazardousSituationOrScenario: 'Travailleurs temporaires, chauffeurs externes ou visiteurs mal informés',
      possibleRiskOrHarm: 'Retard évacuation, personnes manquantes, exposition aux fumées',
      exposed: 'Intérimaires, nouveaux travailleurs, visiteurs, chauffeurs externes, personnel administratif',
      existingMeasures: 'Plans d’évacuation, consignes affichées, exercice annuel',
      existingEvidence: 'Registre formation, PV exercice, photos affichages',
      observedOrDeclaredElements: 'Confusion de certains intérimaires sur le point de rassemblement déclarée',
      elementsToConfirm: 'Accueil sécurité, affichage, briefing visiteurs et exercice évacuation',
      severity: '4',
      probability: '4',
      exposure: '4',
      scoringJustification: 'Risque critique si les personnes temporaires ne connaissent pas les consignes',
      initialScore: '64',
      initialLevel: 'Critique',
      additionalMeasure: 'Renforcer accueil sécurité, briefing intérimaires et exercice évacuation',
      stopLevel: 'Organisationnelle',
      responsible: 'RH / ligne hiérarchique / SIPPT',
      deadline: 'Court terme',
      residualScore: '16',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction attendue après briefing, affichage et exercice documenté',
      expectedEvidence: 'Registre accueil, PV exercice, photos affichages',
      photoToInsert: 'Photo consignes et point de rassemblement sans visage identifiable',
      annexToAttach: 'Annexe évacuation formation',
      priority: 'Haute',
      blockingPoint: 'Oui',
      externalAdvice: 'Non',
    },
    {
      hazard: 'Accès pompiers',
      task: 'Intervention des secours externes',
      danger: 'Accès pompier encombré ou mal identifié',
      hazardousSituationOrScenario: 'Camions, déchets, palettes ou véhicules stationnés sur accès',
      possibleRiskOrHarm: 'Retard intervention secours et aggravation du sinistre',
      exposed: 'Tous les occupants du site et services de secours',
      existingMeasures: 'Plan d’accès, consignes stationnement, signalisation',
      existingEvidence: 'Photos accès, plan intervention, contrôle terrain',
      observedOrDeclaredElements: 'Accès pompiers parfois encombré par camions déclaré',
      elementsToConfirm: 'Largeur accès, signalisation, zones interdites, information chauffeurs',
      severity: '5',
      probability: '3',
      exposure: '3',
      scoringJustification: 'Risque élevé si les secours externes sont retardés',
      initialScore: '45',
      initialLevel: 'Élevé',
      additionalMeasure: 'Dégager accès, marquer zones interdites et informer chauffeurs/sous-traitants',
      stopLevel: 'Organisationnelle',
      responsible: 'Responsable logistique / accueil chauffeurs',
      deadline: 'Court terme',
      residualScore: '15',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction après marquage, information et contrôle terrain',
      expectedEvidence: 'Photos accès dégagés, consigne stationnement, plan intervention',
      photoToInsert: 'Photo accès pompiers et zones de stationnement interdit',
      annexToAttach: 'Annexe accès secours',
      priority: 'Haute',
      blockingPoint: 'Oui',
      externalAdvice: 'Oui',
    },
    {
      hazard: 'Produits dangereux, incompatibilités et FDS manquantes',
      task: 'Réception, stockage et manipulation de produits dangereux',
      danger: 'Incompatibilités chimiques ou absence d’information sécurité',
      hazardousSituationOrScenario: 'FDS absentes, étiquetage incomplet, stockage de produits incompatibles',
      possibleRiskOrHarm: 'Réaction dangereuse, incendie, exposition chimique, erreur d’intervention',
      exposed: 'Magasiniers, préparateurs, techniciens maintenance, agents nettoyage, équipiers intervention',
      existingMeasures: 'Armoires, bacs de rétention, consignes générales',
      existingEvidence: 'FDS, inventaire, photos étiquetage, registre formation',
      observedOrDeclaredElements: 'Documentation FDS incomplète ou dispersée déclarée',
      elementsToConfirm: 'Inventaire complet, FDS à jour, CLP, compatibilités, déchets dangereux',
      severity: '5',
      probability: '4',
      exposure: '4',
      scoringJustification: 'Risque critique en cas de stockage incompatible ou absence d’information sécurité',
      initialScore: '80',
      initialLevel: 'Critique',
      additionalMeasure: 'Centraliser FDS, vérifier étiquetage CLP et séparer incompatibilités',
      stopLevel: 'Suppression/Substitution + Technique + Organisationnelle',
      responsible: 'Responsable produits dangereux / SIPPT',
      deadline: 'Court terme',
      residualScore: '20',
      residualLevel: 'Moyen',
      residualScoreJustification: 'Réduction attendue après inventaire, FDS, séparation et validation',
      expectedEvidence: 'Inventaire, FDS, photos étiquetage, preuve séparation',
      photoToInsert: 'Photo étiquetage CLP, armoires et incompatibilités corrigées',
      annexToAttach: 'Annexe FDS produits dangereux',
      priority: 'Urgente',
      blockingPoint: 'Oui',
      externalAdvice: 'Oui',
    },
  ];
}

function buildFallbackSimplifiedRisk(number, riskInput, context, language = 'fr') {
  const risk = typeof riskInput === 'string' ? { hazard: riskInput } : ensureObject(riskInput);
  const riskName = risk.hazard || context.placeholder;
  const stopLevel = risk.stopLevel || getDefaultStopLevel(language);
  const task = risk.task || context.activity || context.placeholder;
  const exposed = risk.exposed || context.exposed || getFallbackPhrase('exposed', language);
  const existingMeasures = risk.existingMeasures || context.measures || getFallbackPhrase('existingMeasures', language);
  const elementsToConfirm = [
    context.products && `Produits: ${context.products}`,
    context.equipment && `Équipements: ${context.equipment}`,
    context.incidents && `Incidents: ${context.incidents}`,
    context.constraints && `Contraintes: ${context.constraints}`,
  ].filter(Boolean).join('. ') || getFallbackPhrase('elementsToConfirm', language);
  const initialScore = risk.initialScore || '27';
  const residualScore = risk.residualScore || '9';

  return {
    number,
    initial: {
      number,
      task,
      hazard: risk.danger || riskName,
      hazardousSituationOrScenario: risk.hazardousSituationOrScenario || `Situation à confirmer: ${riskName}`,
      possibleRiskOrHarm: risk.possibleRiskOrHarm || getFallbackPhrase('harm', language),
      exposed,
      existingMeasures,
      existingEvidence: risk.existingEvidence || getFallbackPhrase('existingEvidence', language),
      observedOrDeclaredElements: risk.observedOrDeclaredElements || elementsToConfirm,
      elementsToConfirm: risk.elementsToConfirm || getFallbackPhrase('controlEvidence', language),
      severity: risk.severity || '3',
      probability: risk.probability || '3',
      exposure: risk.exposure || '3',
      scoringJustification: risk.scoringJustification || `${risk.severity || '3'} x ${risk.probability || '3'} x ${risk.exposure || '3'} = ${initialScore}`,
      initialScore,
      initialLevel: risk.initialLevel || getRiskLevel(Number(initialScore), language),
    },
    followUp: {
      number,
      additionalMeasure: risk.additionalMeasure || `Vérifier et documenter ${riskName}`,
      stopLevel,
      responsible: risk.responsible || getFallbackPhrase('responsible', language),
      deadline: risk.deadline || getFallbackPhrase('deadline', language),
      residualScore,
      residualLevel: risk.residualLevel || getRiskLevel(Number(residualScore), language),
      residualScoreJustification: risk.residualScoreJustification || getFallbackPhrase('residualJustification', language),
      expectedEvidence: risk.expectedEvidence || getFallbackPhrase('expectedEvidence', language),
      photoToInsert: risk.photoToInsert || `Photo liée au risque ${number}`,
      annexToAttach: risk.annexToAttach || getFallbackPhrase('annex', language),
      priority: risk.priority || getFallbackPhrase('priority', language),
      blockingPoint: risk.blockingPoint || getYesNoValue(true, language),
      externalAdvice: risk.externalAdvice || getFallbackPhrase('toDetermine', language),
    },
    residual: {
      mainRisk: `${number}. ${riskName}`,
      initialScore,
      residualScore,
      reductionCondition: risk.residualScoreJustification || risk.additionalMeasure || getFallbackPhrase('reductionCondition', language),
      requiredEvidence: risk.expectedEvidence || getFallbackPhrase('datedEvidence', language),
      standardStatus: getFallbackPhrase('standardStatus', language),
      blockingPoint: risk.blockingPoint || getYesNoValue(true, language),
      externalAdvice: risk.externalAdvice || getFallbackPhrase('toDetermine', language),
    },
  };
}

function getFallbackPhrase(key, language = 'fr') {
  const phrases = {
    fr: {
      exposed: 'Travailleurs, visiteurs ou intervenants à confirmer',
      existingMeasures: 'Mesures existantes à vérifier sur site',
      elementsToConfirm: 'Visite terrain et preuves à obtenir',
      harm: 'Atteinte à la santé ou à la sécurité',
      existingEvidence: 'Preuves à collecter avant validation',
      controlEvidence: 'Contrôle terrain, photos et documents',
      scoringJustification: 'Cotation prudente faute de preuves complètes',
      responsible: 'SIPPT / responsable de site',
      deadline: 'À planifier',
      residualJustification: 'Réduction après preuve et mesure validée',
      expectedEvidence: 'Photo, rapport de contrôle ou preuve de formation',
      annex: 'Preuve documentaire à joindre',
      priority: 'À traiter avant validation',
      toDetermine: 'À déterminer',
      reductionCondition: 'Mesure vérifiée, preuve disponible et validation réalisée',
      datedEvidence: 'Photo datée et preuve documentaire',
      standardStatus: 'À vérifier',
    },
    nl: {
      exposed: 'Werknemers, bezoekers of tussenkomende personen te bevestigen',
      existingMeasures: 'Bestaande maatregelen ter plaatse te controleren',
      elementsToConfirm: 'Terreinbezoek en bewijzen te verkrijgen',
      harm: 'Schade aan gezondheid of veiligheid',
      existingEvidence: 'Bewijzen te verzamelen vóór validatie',
      controlEvidence: 'Terreincontrole, foto’s en documenten',
      scoringJustification: 'Voorzichtige beoordeling wegens onvolledige bewijzen',
      responsible: 'IDPB / siteverantwoordelijke',
      deadline: 'Te plannen',
      residualJustification: 'Verlaging na bewijs en gevalideerde maatregel',
      expectedEvidence: 'Foto, controlerapport of opleidingsbewijs',
      annex: 'Documentair bewijs toe te voegen',
      priority: 'Te behandelen vóór validatie',
      toDetermine: 'Te bepalen',
      reductionCondition: 'Maatregel gecontroleerd, bewijs beschikbaar en validatie uitgevoerd',
      datedEvidence: 'Gedateerde foto en documentair bewijs',
      standardStatus: 'Te controleren',
    },
    en: {
      exposed: 'Workers, visitors or contractors to be confirmed',
      existingMeasures: 'Existing measures to be checked on site',
      elementsToConfirm: 'Site visit and evidence to be obtained',
      harm: 'Harm to health or safety',
      existingEvidence: 'Evidence to be collected before validation',
      controlEvidence: 'Site check, photos and documents',
      scoringJustification: 'Prudent scoring due to incomplete evidence',
      responsible: 'Internal prevention service / site manager',
      deadline: 'To be planned',
      residualJustification: 'Reduction after evidence and validated measure',
      expectedEvidence: 'Photo, inspection report or training evidence',
      annex: 'Documentary evidence to attach',
      priority: 'To be addressed before validation',
      toDetermine: 'To be determined',
      reductionCondition: 'Measure checked, evidence available and validation completed',
      datedEvidence: 'Dated photo and documentary evidence',
      standardStatus: 'To be checked',
    },
    de: {
      exposed: 'Beschäftigte, Besucher oder Beteiligte zu bestätigen',
      existingMeasures: 'Bestehende Maßnahmen vor Ort zu prüfen',
      elementsToConfirm: 'Vor-Ort-Begehung und Nachweise einzuholen',
      harm: 'Beeinträchtigung von Gesundheit oder Sicherheit',
      existingEvidence: 'Nachweise vor Validierung zu sammeln',
      controlEvidence: 'Vor-Ort-Kontrolle, Fotos und Dokumente',
      scoringJustification: 'Vorsichtige Bewertung wegen unvollständiger Nachweise',
      responsible: 'Interner Präventionsdienst / Standortverantwortlicher',
      deadline: 'Zu planen',
      residualJustification: 'Reduzierung nach Nachweis und validierter Maßnahme',
      expectedEvidence: 'Foto, Prüfbericht oder Schulungsnachweis',
      annex: 'Dokumentarischen Nachweis beifügen',
      priority: 'Vor Validierung zu behandeln',
      toDetermine: 'Zu bestimmen',
      reductionCondition: 'Maßnahme geprüft, Nachweis verfügbar und Validierung durchgeführt',
      datedEvidence: 'Datiertes Foto und dokumentarischer Nachweis',
      standardStatus: 'Zu prüfen',
    },
  };

  return phrases[language]?.[key] || phrases.fr[key] || getLanguagePlaceholder(language);
}

function getYesNoValue(value, language = 'fr') {
  if (language === 'nl') {
    return value ? 'Ja' : 'Nee';
  }
  if (language === 'en') {
    return value ? 'Yes' : 'No';
  }
  if (language === 'de') {
    return value ? 'Ja' : 'Nein';
  }
  return value ? 'Oui' : 'Non';
}

function buildRiskSectionPlacementRules(language) {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const section = (index) => `${index}. ${config.sections[index - 1]}`;

  return [
    `- ${section(4)}: only abbreviations and definitions actually used; never place this glossary in ${section(5)}.`,
    `- ${section(5)}: included sites, excluded sites, concerned activities, concerned workers, included situations and scope limits only; no abbreviation definitions.`,
    `- ${section(9)}: photo usefulness, GDPR/confidentiality rules and the photo table only; never place the photo plan in ${section(12)}.`,
    `- ${section(11)}: scoring formula, G/P/E scales, interpretation thresholds and provisional confirmation requirement only.`,
    `- ${section(12)}: exactly the mandatory linking sentence, ${config.riskInitialSubsectionTitle} table and ${config.riskFollowUpSubsectionTitle} table only; never place the photo plan here.`,
    `- ${section(14)}: action priorities table and urgent, structural or validation-related actions only; never explain the scoring method here.`,
    `- ${section(16)}: Annual Action Plan and Global Prevention Plan link, health and safety committee role, management and prevention-service follow-up only; never place this link in ${section(19)}.`,
    `- ${section(17)}: documents to create or update table only; never place this list in ${section(22)}.`,
    `- ${section(18)}: actors to consult or involve table only.`,
    `- ${section(19)}: required annexes table only; no PAA/PGP link and no documents-to-create list.`,
    `- ${section(22)}: drafted conclusion paragraphs only; no table, no documents-to-create list and no final validation statement.`,
    `- ${section(23)}: the final validation statement only and exactly once, at the end.`,
  ].join('\n');
}

function buildAbbreviationGlossaryInstruction(language) {
  const glossaries = {
    fr: [
      'PAA : Plan Annuel d’Action. Il reprend les actions de prévention à réaliser à court terme, généralement pour l’année à venir.',
      'PGP : Plan Global de Prévention. Il reprend les objectifs, priorités et actions de prévention à moyen et long terme.',
      'CPPT : Comité pour la Prévention et la Protection au Travail. Il doit être consulté lorsque l’entreprise en dispose, notamment pour les avis et le suivi des actions de prévention.',
      'FDS : Fiche de Données de Sécurité. Document relatif aux produits chimiques, décrivant les dangers, les mesures de prévention, les conditions de stockage, les premiers secours et la conduite à tenir.',
      'CLP : règlement européen relatif à la classification, à l’étiquetage et à l’emballage des substances et mélanges. Il aide à identifier les pictogrammes, mentions de danger et conseils de prudence.',
      'EPI : Équipement de Protection Individuelle. Équipement porté par le travailleur, par exemple gants, lunettes, chaussures de sécurité ou protection auditive. Les EPI ne doivent pas remplacer les mesures collectives lorsqu’elles sont possibles.',
      'ATEX : Atmosphère Explosive. Situation dans laquelle un mélange d’air et de gaz, vapeurs, brouillards ou poussières inflammables peut exploser en présence d’une source d’ignition. Si un risque ATEX est possible, un avis spécialisé peut être nécessaire.',
      'STOP : hiérarchie des mesures de prévention : Suppression ou substitution du danger, mesures Techniques, mesures Organisationnelles, puis Protection individuelle.',
      'SEPP/SEPPT : Service Externe pour la Prévention et la Protection au Travail. Il peut être consulté pour un avis spécialisé, notamment en santé, hygiène, ergonomie, psychosocial, incendie ou risques chimiques.',
      'SIPP/SIPPT : Service Interne pour la Prévention et la Protection au Travail. Il organise et suit la prévention au sein de l’entreprise.',
      'RGIE : Règlement Général sur les Installations Électriques. Il concerne les installations électriques et leurs contrôles.',
      'CMR : agents Cancérigènes, Mutagènes ou Reprotoxiques. Ces agents nécessitent une attention particulière, des mesures strictes et souvent un avis spécialisé.',
      'TMS : Troubles Musculosquelettiques. Troubles liés notamment aux postures, gestes répétitifs, efforts, manutentions ou contraintes physiques.',
    ],
    nl: [
      'JAP/PAA : Jaaractieplan. Het bevat de preventieacties die op korte termijn moeten worden uitgevoerd, meestal voor het komende jaar.',
      'GPP/PGP : Globaal Preventieplan. Het bevat de preventiedoelstellingen, prioriteiten en acties op middellange en lange termijn.',
      'CPBW/CPPT : Comité voor Preventie en Bescherming op het Werk. Het moet worden geraadpleegd wanneer het in de onderneming bestaat, onder meer voor advies en opvolging van preventieacties.',
      'VIB/FDS : Veiligheidsinformatieblad. Document over chemische producten met de gevaren, preventiemaatregelen, opslagvoorwaarden, eerste hulp en wat te doen bij incidenten.',
      'CLP : Europese regels voor classificatie, etikettering en verpakking van stoffen en mengsels. Ze helpen pictogrammen, gevarenaanduidingen en voorzorgsmaatregelen te begrijpen.',
      'PBM/EPI : Persoonlijk Beschermingsmiddel. Uitrusting die door de werknemer wordt gedragen, zoals handschoenen, veiligheidsbril, veiligheidsschoenen of gehoorbescherming. PBM mogen collectieve maatregelen niet vervangen wanneer die mogelijk zijn.',
      'ATEX : Explosieve Atmosfeer. Situatie waarin een mengsel van lucht en ontvlambare gassen, dampen, nevels of stof kan ontploffen bij aanwezigheid van een ontstekingsbron. Bij een mogelijk ATEX-risico kan gespecialiseerd advies nodig zijn.',
      'STOP : hiërarchie van preventiemaatregelen: Stoppen of substitutie van het gevaar, Technische maatregelen, Organisatorische maatregelen en daarna Persoonlijke bescherming.',
      'EDPB/SEPPT : Externe Dienst voor Preventie en Bescherming op het Werk. Deze dienst kan worden geraadpleegd voor gespecialiseerd advies, onder meer over gezondheid, hygiëne, ergonomie, psychosociaal welzijn, brand of chemische risico’s.',
      'IDPB/SIPPT : Interne Dienst voor Preventie en Bescherming op het Werk. Deze dienst organiseert en volgt de preventie binnen de onderneming op.',
      'AREI/RGIE : Algemeen Reglement op de Elektrische Installaties. Het heeft betrekking op elektrische installaties en de controles ervan.',
      'CMR : kankerverwekkende, mutagene of reprotoxische agentia. Deze agentia vragen bijzondere aandacht, strikte maatregelen en vaak gespecialiseerd advies.',
      'MSA/TMS : Musculoskeletale aandoeningen. Aandoeningen die onder meer verband houden met houdingen, repetitieve bewegingen, fysieke inspanningen, manueel hanteren of lichamelijke belasting.',
    ],
    en: [
      'AAP/PAA : Annual Action Plan. It lists the prevention actions to be carried out in the short term, usually for the coming year.',
      'GPP/PGP : Global Prevention Plan. It sets out prevention objectives, priorities and actions for the medium and long term.',
      'CPPT/health and safety committee : Health and Safety Committee. It must be consulted when the organisation has one, especially for opinions and follow-up of prevention actions.',
      'SDS/FDS : Safety Data Sheet. Document for chemical products describing hazards, prevention measures, storage conditions, first aid and what to do in an incident.',
      'CLP : European rules on classification, labelling and packaging of substances and mixtures. They help identify pictograms, hazard statements and precautionary advice.',
      'PPE/EPI : Personal Protective Equipment. Equipment worn by the worker, such as gloves, goggles, safety shoes or hearing protection. PPE must not replace collective measures where those are possible.',
      'ATEX : Explosive Atmosphere. A situation where a mixture of air and flammable gases, vapours, mists or dusts can explode if an ignition source is present. If an ATEX risk is possible, specialist advice may be needed.',
      'STOP : hierarchy of prevention measures: elimination or substitution of the hazard, Technical measures, Organisational measures, then Personal protection.',
      'External service/SEPP : External Service for Prevention and Protection at Work. It can be consulted for specialist advice, particularly on health, hygiene, ergonomics, psychosocial risks, fire or chemical risks.',
      'Internal service/SIPP : Internal Service for Prevention and Protection at Work. It organises and follows up prevention within the organisation.',
      'RGIE/AREI : Belgian General Regulations on Electrical Installations. It concerns electrical installations and their inspections.',
      'CMR : Carcinogenic, Mutagenic or Reprotoxic agents. These agents require particular attention, strict measures and often specialist advice.',
      'MSD/TMS : Musculoskeletal disorders. Disorders linked in particular to postures, repetitive movements, physical effort, manual handling or physical constraints.',
    ],
    de: [
      'JAP/PAA : Jährlicher Aktionsplan. Er enthält die Präventionsmaßnahmen, die kurzfristig umzusetzen sind, in der Regel für das kommende Jahr.',
      'GPP/PGP : Globaler Präventionsplan. Er enthält Präventionsziele, Prioritäten und Maßnahmen für die mittel- und langfristige Planung.',
      'AGS/CPPT : Ausschuss für Gefahrenverhütung und Schutz am Arbeitsplatz. Er muss konsultiert werden, wenn er im Unternehmen besteht, insbesondere für Stellungnahmen und die Nachverfolgung von Präventionsmaßnahmen.',
      'SDB/FDS : Sicherheitsdatenblatt. Dokument zu chemischen Produkten mit Gefahren, Präventionsmaßnahmen, Lagerbedingungen, Erste-Hilfe-Maßnahmen und Verhalten bei Vorfällen.',
      'CLP : europäische Regeln zur Einstufung, Kennzeichnung und Verpackung von Stoffen und Gemischen. Sie helfen, Piktogramme, Gefahrenhinweise und Sicherheitshinweise zu verstehen.',
      'PSA/EPI : Persönliche Schutzausrüstung. Ausrüstung, die von Beschäftigten getragen wird, zum Beispiel Handschuhe, Schutzbrille, Sicherheitsschuhe oder Gehörschutz. PSA darf kollektive Maßnahmen nicht ersetzen, wenn diese möglich sind.',
      'ATEX : Explosionsfähige Atmosphäre. Situation, in der ein Gemisch aus Luft und entzündbaren Gasen, Dämpfen, Nebeln oder Stäuben bei Vorhandensein einer Zündquelle explodieren kann. Bei möglichem ATEX-Risiko kann fachliche Stellungnahme erforderlich sein.',
      'STOP : Hierarchie der Präventionsmaßnahmen: Beseitigung oder Substitution der Gefahr, Technische Maßnahmen, Organisatorische Maßnahmen und danach Persönliche Schutzausrüstung.',
      'Externer Dienst/SEPP : Externer Dienst für Gefahrenverhütung und Schutz am Arbeitsplatz. Er kann für fachliche Stellungnahmen konsultiert werden, insbesondere zu Gesundheit, Hygiene, Ergonomie, psychosozialen Aspekten, Brand oder chemischen Risiken.',
      'Interner Dienst/SIPP : Interner Dienst für Gefahrenverhütung und Schutz am Arbeitsplatz. Er organisiert und verfolgt die Prävention im Unternehmen.',
      'RGIE/AREI : Allgemeine Ordnung für elektrische Anlagen in Belgien. Sie betrifft elektrische Anlagen und deren Kontrollen.',
      'CMR : krebserzeugende, mutagene oder reproduktionstoxische Arbeitsstoffe. Diese Arbeitsstoffe erfordern besondere Aufmerksamkeit, strenge Maßnahmen und häufig fachliche Stellungnahme.',
      'MSE/TMS : Muskel-Skelett-Erkrankungen. Erkrankungen, die insbesondere mit Körperhaltungen, wiederholten Bewegungen, körperlicher Anstrengung, manueller Handhabung oder körperlichen Belastungen zusammenhängen.',
    ],
  };

  return (glossaries[language] || glossaries.fr).join(' ');
}

function buildRiskSupportTableColumns(language) {
  const columns = {
    fr: {
      reference:
        'Référence ou domaine réglementaire | Pourquoi c’est applicable | Conséquence pratique | Document ou preuve à prévoir | Validation ou avis nécessaire',
      sources: 'Source | Disponible | Commentaire | Preuve attendue | Où classer la preuve',
      jobs:
        'Poste ou tâche | Description de l’activité réelle | Fréquence | Durée d’exposition | Travailleurs exposés | Équipements ou produits utilisés | Particularités | Photos à prendre | Documents à joindre',
      photos:
        'Numéro photo | Zone ou tâche | Ce que la photo doit montrer | Pourquoi elle est utile | Où l’insérer dans le document | À mettre aussi en annexe oui/non | Précautions de confidentialité | Risque lié | Action liée | Preuve attendue | Annexe liée | Avant ou après correction',
      documents:
        'Document | Pourquoi le créer ou le mettre à jour | Responsable | Échéance | Preuve attendue | Annexe concernée | Priorité',
      annexes:
        'Annexe | Obligatoire / recommandée / selon situation | Pourquoi elle est nécessaire | Qui doit la fournir | Où la classer | Statut',
      actors:
        'Acteur | Rôle attendu | Moment de consultation | Preuve attendue | Obligatoire ou recommandé | Limite pour conseiller niveau 3',
      blockers:
        'Nombre | Risque ou thème concerné | Pourquoi c’est bloquant | Preuve attendue | Responsable | Échéance | Avis externe oui/non | Condition de levée',
      blockingValues: 'Oui; Non; À déterminer',
    },
    nl: {
      reference:
        'Referentie of regelgevend domein | Waarom dit van toepassing is | Praktische consequentie | Te voorziene document of bewijs | Noodzakelijke validatie of advies',
      sources: 'Bron | Beschikbaar | Opmerking | Verwacht bewijs | Waar het bewijs te bewaren',
      jobs:
        'Functie of taak | Beschrijving van de werkelijke activiteit | Frequentie | Blootstellingsduur | Blootgestelde werknemers | Gebruikte uitrusting of producten | Bijzonderheden | Te nemen foto’s | Toe te voegen documenten',
      photos:
        'Fotonummer | Zone of taak | Wat de foto moet tonen | Waarom ze nuttig is | Waar de foto in het document moet worden ingevoegd | Ook als bijlage opnemen ja/nee | Vertrouwelijkheidsvoorzorgen | Gekoppeld risico | Gekoppelde actie | Verwacht bewijs | Gekoppelde bijlage | Vóór of na correctie',
      documents:
        'Document | Waarom opstellen of bijwerken | Verantwoordelijke | Termijn | Verwacht bewijs | Betrokken bijlage | Prioriteit',
      annexes:
        'Bijlage | Verplicht / aanbevolen / volgens situatie | Waarom ze nodig is | Wie ze moet bezorgen | Waar ze te bewaren | Status',
      actors:
        'Actor | Verwachte rol | Moment van raadpleging | Verwacht bewijs | Verplicht of aanbevolen | Grens voor preventieadviseur niveau 3',
      blockers:
        'Aantal | Betrokken risico of thema | Waarom dit blokkerend is | Verwacht bewijs | Verantwoordelijke | Termijn | Extern advies ja/nee | Voorwaarde voor opheffing',
      blockingValues: 'Ja; Nee; Te bepalen',
    },
    en: {
      reference:
        'Regulatory reference or domain | Why it applies | Practical consequence | Document or evidence to provide | Required validation or opinion',
      sources: 'Source | Available | Comment | Expected evidence | Where to file the evidence',
      jobs:
        'Job or task | Description of the actual activity | Frequency | Exposure duration | Exposed workers | Equipment or products used | Specific points | Photos to take | Documents to attach',
      photos:
        'Photo number | Area or task | What the photo must show | Why it is useful | Where to insert it in the document | Also include as an annex yes/no | Confidentiality precautions | Related risk | Related action | Expected evidence | Related annex | Before or after correction',
      documents:
        'Document | Why create or update it | Responsible person | Deadline | Expected evidence | Related annex | Priority',
      annexes:
        'Annex | Mandatory / recommended / depending on situation | Why it is necessary | Who must provide it | Where to file it | Status',
      actors:
        'Actor | Expected role | Consultation timing | Expected evidence | Mandatory or recommended | Limit for level 3 prevention advisor',
      blockers:
        'Number | Related risk or theme | Why it is blocking | Expected evidence | Responsible person | Deadline | External opinion yes/no | Removal condition',
      blockingValues: 'Yes; No; To be determined',
    },
    de: {
      reference:
        'Regulatorische Referenz oder Bereich | Warum dies anwendbar ist | Praktische Folge | Vorzusehendes Dokument oder Nachweis | Erforderliche Validierung oder Stellungnahme',
      sources: 'Quelle | Verfügbar | Kommentar | Erwarteter Nachweis | Wo der Nachweis abzulegen ist',
      jobs:
        'Arbeitsplatz oder Aufgabe | Beschreibung der tatsächlichen Tätigkeit | Häufigkeit | Expositionsdauer | Exponierte Beschäftigte | Verwendete Ausrüstung oder Produkte | Besonderheiten | Zu machende Fotos | Beizufügende Dokumente',
      photos:
        'Fotonummer | Bereich oder Aufgabe | Was das Foto zeigen muss | Warum es nützlich ist | Wo das Foto im Dokument einzufügen ist | Auch als Anhang aufnehmen ja/nein | Vertraulichkeitsvorkehrungen | Verbundenes Risiko | Verbundene Maßnahme | Erwarteter Nachweis | Verbundener Anhang | Vor oder nach Korrektur',
      documents:
        'Dokument | Warum erstellen oder aktualisieren | Verantwortliche Person | Frist | Erwarteter Nachweis | Betroffener Anhang | Priorität',
      annexes:
        'Anhang | Verpflichtend / empfohlen / je nach Situation | Warum er notwendig ist | Wer ihn liefern muss | Wo er abzulegen ist | Status',
      actors:
        'Akteur | Erwartete Rolle | Zeitpunkt der Konsultation | Erwarteter Nachweis | Verpflichtend oder empfohlen | Grenze für Präventionsberater Niveau 3',
      blockers:
        'Anzahl | Betroffenes Risiko oder Thema | Warum dies blockierend ist | Erwarteter Nachweis | Verantwortliche Person | Frist | Externe Stellungnahme ja/nein | Bedingung für Aufhebung',
      blockingValues: 'Ja; Nein; Zu bestimmen',
    },
  };

  return columns[language] || columns.fr;
}

function buildRiskPhotoPlanInstruction(documentType, language) {
  const common = {
    fr:
      'Règles générales : ne pas photographier de visages sans nécessité ; éviter les données personnelles visibles ; masquer les plaques d’immatriculation si inutile ; prendre une photo générale puis une photo de détail ; prendre une photo avant correction et après correction ; dater les photos ; identifier la zone ; conserver les photos originales dans le dossier preuve.',
    nl:
      'Algemene regels: fotografeer geen gezichten zonder noodzaak; vermijd zichtbare persoonsgegevens; maak nummerplaten onleesbaar als ze niet nuttig zijn; neem eerst een algemene foto en daarna een detailfoto; neem een foto vóór en na correctie; dateer de foto’s; identificeer de zone; bewaar de originele foto’s in het bewijsdossier.',
    en:
      'General rules: do not photograph faces unless necessary; avoid visible personal data; mask number plates if not useful; take a general photo and then a detail photo; take before and after correction photos; date the photos; identify the area; keep original photos in the evidence file.',
    de:
      'Allgemeine Regeln: keine Gesichter fotografieren, sofern nicht erforderlich; sichtbare personenbezogene Daten vermeiden; Kennzeichen unkenntlich machen, wenn sie nicht nützlich sind; zuerst ein Übersichtsfoto und dann ein Detailfoto machen; Fotos vor und nach der Korrektur machen; Fotos datieren; den Bereich identifizieren; Originalfotos in der Nachweisakte aufbewahren.',
  };

  const normalized = normalizeDocumentType(documentType);
  const specific = getRiskSpecificPhotos(normalized, language);
  const psychosocialLimit = {
    fr:
      'Pour les risques psychosociaux, ne pas demander de photos de personnes ou de situations identifiantes ; privilégier documents anonymisés, procédures, organigrammes, plannings et indicateurs collectifs. Pour maternité, jeunes travailleurs et intérimaires, éviter toute photo identifiante et privilégier le poste, les équipements, les consignes affichées et les zones à risque sans visage identifiable.',
    nl:
      'Voor psychosociale risico’s geen foto’s van personen of identificeerbare situaties vragen; geef de voorkeur aan geanonimiseerde documenten, procedures, organigrammen, planningen en collectieve indicatoren. Voor moederschap, jongeren en uitzendkrachten identificeerbare foto’s vermijden en de voorkeur geven aan werkpost, uitrusting, uitgehangen instructies en risicozones zonder herkenbaar gezicht.',
    en:
      'For psychosocial risks, do not request photos of people or identifiable situations; prefer anonymised documents, procedures, organisation charts, schedules and collective indicators. For maternity, young workers and temporary workers, avoid identifiable photos and prefer the workstation, equipment, displayed instructions and risk areas without identifiable faces.',
    de:
      'Bei psychosozialen Risiken keine Fotos von Personen oder identifizierbaren Situationen verlangen; anonymisierte Dokumente, Verfahren, Organigramme, Planungen und kollektive Indikatoren bevorzugen. Bei Mutterschutz, Jugendlichen und Leiharbeitnehmern identifizierende Fotos vermeiden und Arbeitsplatz, Ausrüstung, ausgehängte Anweisungen und Risikobereiche ohne erkennbare Gesichter bevorzugen.',
  };

  return `${common[language] || common.fr} ${specific} ${psychosocialLimit[language] || psychosocialLimit.fr}`;
}

function buildCompletenessElements(language) {
  const elements = {
    fr: [
      'Contexte et objectif',
      'Périmètre',
      'Sources d’information',
      'Hypothèses, limites et points bloquants',
      'Activités et tâches',
      'Postes concernés',
      'Travailleurs exposés',
      'Travailleurs vulnérables',
      'Plan photos',
      'Dangers identifiés',
      'Scénarios de risques',
      'Personnes exposées',
      'Mesures existantes',
      'Preuves des mesures existantes',
      'Méthode de cotation',
      'Critères gravité',
      'Critères probabilité',
      'Critères exposition',
      'Justification des scores',
      'Risque initial',
      'Risque résiduel',
      'Mesures complémentaires',
      'Hiérarchie STOP',
      'Responsables',
      'Échéances',
      'Indicateurs',
      'Preuves attendues',
      'Consultation travailleurs',
      'Consultation CPPT',
      'Avis service externe',
      'Avis médecin du travail si pertinent',
      'Lien PAA',
      'Lien PGP',
      'Documents à créer ou mettre à jour',
      'Pièces jointes et annexes',
      'Photos et classement des preuves',
      'Acteurs à consulter',
      'Encarts pédagogiques',
      'Appui externe ou niveau 1/2 si nécessaire',
      'Validabilité',
      'Conclusion et mention finale',
    ],
    nl: [
      'Context en doelstelling',
      'Afbakening',
      'Informatiebronnen',
      'Hypothesen, beperkingen en blokkerende punten',
      'Activiteiten en taken',
      'Betrokken functies',
      'Blootgestelde werknemers',
      'Kwetsbare werknemers',
      'Fotoplan',
      'Geïdentificeerde gevaren',
      'Risicoscenario’s',
      'Blootgestelde personen',
      'Bestaande maatregelen',
      'Bewijzen van bestaande maatregelen',
      'Scoremethode',
      'Criteria ernst',
      'Criteria waarschijnlijkheid',
      'Criteria blootstelling',
      'Motivering van de scores',
      'Initieel risico',
      'Restrisico',
      'Aanvullende maatregelen',
      'STOP-hiërarchie',
      'Verantwoordelijken',
      'Termijnen',
      'Indicatoren',
      'Verwachte bewijzen',
      'Raadpleging werknemers',
      'Raadpleging CPBW',
      'Advies externe dienst',
      'Advies arbeidsarts indien relevant',
      'Link JAP',
      'Link GPP',
      'Op te stellen of bij te werken documenten',
      'Bijlagen en bewijsstukken',
      'Foto’s en klassement van bewijzen',
      'Te raadplegen actoren',
      'Pedagogische kaders',
      'Externe ondersteuning of niveau 1/2 indien nodig',
      'Valideerbaarheid',
      'Conclusie en validatievermelding',
    ],
    en: [
      'Context and objective',
      'Scope',
      'Information sources',
      'Assumptions, limitations and blocking points',
      'Activities and tasks',
      'Jobs concerned',
      'Exposed workers',
      'Vulnerable workers',
      'Photo plan',
      'Identified hazards',
      'Risk scenarios',
      'Exposed persons',
      'Existing measures',
      'Evidence of existing measures',
      'Scoring method',
      'Severity criteria',
      'Probability criteria',
      'Exposure criteria',
      'Score justification',
      'Initial risk',
      'Residual risk',
      'Additional measures',
      'STOP hierarchy',
      'Responsible persons',
      'Deadlines',
      'Indicators',
      'Expected evidence',
      'Worker consultation',
      'Health and safety committee consultation',
      'External service opinion',
      'Occupational physician opinion if relevant',
      'AAP link',
      'GPP link',
      'Documents to create or update',
      'Attachments and annexes',
      'Photos and evidence filing',
      'Actors to consult',
      'Educational inserts',
      'External or level 1/2 support if needed',
      'Validability',
      'Conclusion and final statement',
    ],
    de: [
      'Kontext und Zielsetzung',
      'Umfang',
      'Informationsquellen',
      'Annahmen, Einschränkungen und blockierende Punkte',
      'Tätigkeiten und Aufgaben',
      'Betroffene Arbeitsplätze',
      'Exponierte Beschäftigte',
      'Schutzbedürftige Beschäftigte',
      'Fotoplan',
      'Ermittelte Gefährdungen',
      'Risikoszenarien',
      'Exponierte Personen',
      'Bestehende Maßnahmen',
      'Nachweise bestehender Maßnahmen',
      'Bewertungsmethode',
      'Kriterien Schwere',
      'Kriterien Wahrscheinlichkeit',
      'Kriterien Exposition',
      'Begründung der Bewertungen',
      'Ausgangsrisiko',
      'Restrisiko',
      'Zusätzliche Maßnahmen',
      'STOP-Hierarchie',
      'Verantwortliche',
      'Fristen',
      'Indikatoren',
      'Erwartete Nachweise',
      'Konsultation der Beschäftigten',
      'Konsultation des AGS',
      'Stellungnahme des externen Dienstes',
      'Stellungnahme des Arbeitsmediziners falls relevant',
      'Bezug JAP',
      'Bezug GPP',
      'Zu erstellende oder zu aktualisierende Dokumente',
      'Anlagen und Anhänge',
      'Fotos und Ablage der Nachweise',
      'Zu konsultierende Akteure',
      'Pädagogische Hinweise',
      'Externe Unterstützung oder Niveau 1/2 falls nötig',
      'Validierbarkeit',
      'Schlussfolgerung und Validierungshinweis',
    ],
  };

  return (elements[language] || elements.fr).join('; ');
}

function buildRiskScoringMethodInstruction(language) {
  const instructions = {
    fr:
      'Score = Gravité × Probabilité × Exposition. Gravité : 1 dommage mineur, 2 blessure légère ou inconfort, 3 blessure avec arrêt ou atteinte significative, 4 blessure grave, incapacité importante ou exposition dangereuse, 5 décès, invalidité majeure ou événement catastrophique. Probabilité : 1 très improbable, 2 peu probable, 3 possible, 4 probable, 5 très probable. Exposition : 1 exceptionnelle, 2 occasionnelle, 3 régulière, 4 fréquente, 5 permanente ou plusieurs fois par jour. Seuils : 1-10 faible, 11-30 moyen, 31-60 élevé, 61-125 critique. Cette cotation est une aide à la priorisation. Elle doit être confirmée par observation terrain, preuves documentaires et validation des acteurs compétents.',
    nl:
      'Score = Ernst × Waarschijnlijkheid × Blootstelling. Ernst: 1 geringe schade, 2 lichte verwonding of ongemak, 3 verwonding met werkverlet of significante aantasting, 4 ernstige verwonding, belangrijke arbeidsongeschiktheid of gevaarlijke blootstelling, 5 overlijden, zware invaliditeit of catastrofale gebeurtenis. Waarschijnlijkheid: 1 zeer onwaarschijnlijk, 2 onwaarschijnlijk, 3 mogelijk, 4 waarschijnlijk, 5 zeer waarschijnlijk. Blootstelling: 1 uitzonderlijk, 2 occasioneel, 3 regelmatig, 4 frequent, 5 permanent of meerdere keren per dag. Drempels: 1-10 laag, 11-30 gemiddeld, 31-60 hoog, 61-125 kritiek. Deze score is een hulpmiddel voor prioritering. Ze moet worden bevestigd door terreinobservatie, documentaire bewijzen en validatie door de bevoegde actoren.',
    en:
      'Score = Severity × Probability × Exposure. Severity: 1 minor damage, 2 minor injury or discomfort, 3 injury with absence from work or significant harm, 4 serious injury, major incapacity or hazardous exposure, 5 death, major disability or catastrophic event. Probability: 1 very unlikely, 2 unlikely, 3 possible, 4 likely, 5 very likely. Exposure: 1 exceptional, 2 occasional, 3 regular, 4 frequent, 5 permanent or several times per day. Thresholds: 1-10 low, 11-30 medium, 31-60 high, 61-125 critical. This scoring is an aid for prioritisation. It must be confirmed by field observation, documentary evidence and validation by the competent stakeholders.',
    de:
      'Bewertung = Schwere × Wahrscheinlichkeit × Exposition. Schwere: 1 geringfügiger Schaden, 2 leichte Verletzung oder Unbehagen, 3 Verletzung mit Arbeitsausfall oder erheblicher Beeinträchtigung, 4 schwere Verletzung, erhebliche Arbeitsunfähigkeit oder gefährliche Exposition, 5 Tod, schwere Invalidität oder katastrophales Ereignis. Wahrscheinlichkeit: 1 sehr unwahrscheinlich, 2 unwahrscheinlich, 3 möglich, 4 wahrscheinlich, 5 sehr wahrscheinlich. Exposition: 1 außergewöhnlich, 2 gelegentlich, 3 regelmäßig, 4 häufig, 5 dauerhaft oder mehrmals täglich. Schwellenwerte: 1-10 niedrig, 11-30 mittel, 31-60 hoch, 61-125 kritisch. Diese Bewertung dient der Priorisierung. Sie muss durch Vor-Ort-Beobachtung, dokumentierte Nachweise und Validierung durch die zuständigen Akteure bestätigt werden.',
  };

  return instructions[language] || instructions.fr;
}

function buildBusinessBlockInstruction(language) {
  const labels = {
    fr:
      '[EXPLOITABLE], [À VÉRIFIER SUR LE TERRAIN], [À COMPLÉTER AVANT VALIDATION], [POINT BLOQUANT AVANT VALIDATION], [PREUVE ATTENDUE], [AVIS SPÉCIALISÉ REQUIS]',
    nl:
      '[BRUIKBAAR], [TER PLAATSE TE CONTROLEREN], [AAN TE VULLEN VÓÓR VALIDATIE], [BLOKKEREND PUNT VÓÓR VALIDATIE], [VERWACHT BEWIJS], [SPECIALISTISCH ADVIES VEREIST]',
    en:
      '[USABLE NOW], [TO BE CHECKED ON SITE], [TO BE COMPLETED BEFORE VALIDATION], [BLOCKING POINT BEFORE VALIDATION], [EXPECTED EVIDENCE], [SPECIALIST ADVICE REQUIRED]',
    de:
      '[JETZT NUTZBAR], [VOR ORT ZU PRÜFEN], [VOR DER VALIDIERUNG ZU ERGÄNZEN], [BLOCKIERENDER PUNKT VOR DER VALIDIERUNG], [ERWARTETER NACHWEIS], [FACHLICHE STELLUNGNAHME ERFORDERLICH]',
  };

  return `available labels are ${labels[language] || labels.fr}.`;
}

function buildAdvisorHelpBlockInstruction(language) {
  const instructions = {
    fr:
      'Chaque bloc doit utiliser exactement cette structure complète dans la langue cible : Ce que le conseiller doit faire: ; Comment le vérifier: ; Où le documenter: ; Documents à joindre: ; Photos à ajouter: ; Où placer les photos: ; Preuve attendue: ; Pourquoi c’est important: ; Impact sur la validation:. Chaque rubrique doit contenir une aide concrète, jamais un simple mot ou une formule vague.',
    nl:
      'Elk blok moet exact deze volledige structuur in de doeltaal gebruiken: Wat de preventieadviseur moet doen: ; Hoe dit te controleren: ; Waar dit te documenteren: ; Toe te voegen documenten: ; Toe te voegen foto’s: ; Waar de foto’s te plaatsen: ; Verwacht bewijs: ; Waarom dit belangrijk is: ; Impact op de validatie:. Elke rubriek moet concrete hulp bevatten, nooit alleen een woord of vage formule.',
    en:
      'Each block must use exactly this full structure in the target language: What the prevention advisor must do: ; How to check it: ; Where to document it: ; Documents to attach: ; Photos to add: ; Where to place the photos: ; Expected evidence: ; Why this matters: ; Impact on validation:. Each heading must contain concrete help, never only one word or a vague formula.',
    de:
      'Jeder Block muss genau diese vollständige Struktur in der Zielsprache verwenden: Was der Präventionsberater tun muss: ; Wie dies zu prüfen ist: ; Wo dies zu dokumentieren ist: ; Beizufügende Dokumente: ; Hinzuzufügende Fotos: ; Wo die Fotos einzufügen sind: ; Erwarteter Nachweis: ; Warum dies wichtig ist: ; Auswirkung auf die Validierung:. Jede Rubrik muss konkrete Hilfe enthalten, niemals nur ein Wort oder eine vage Formel.',
  };

  return instructions[language] || instructions.fr;
}

function buildPracticalGuideInstruction(documentType, language) {
  const headers = {
    fr: 'Point à compléter | Ce qu’il faut faire | Comment le faire | Document à joindre | Photo à ajouter | Où le placer | Priorité',
    nl: 'Aan te vullen punt | Wat te doen | Hoe dit te doen | Toe te voegen document | Toe te voegen foto | Waar te plaatsen | Prioriteit',
    en: 'Item to complete | What to do | How to do it | Document to attach | Photo to add | Where to place it | Priority',
    de: 'Zu ergänzender Punkt | Was zu tun ist | Wie es zu tun ist | Beizufügendes Dokument | Hinzuzufügendes Foto | Wo einzufügen | Priorität',
  };

  return headers[language] || headers.fr;
}

function buildPracticalGuideRowsInstruction(documentType, language) {
  const fireRows = {
    fr:
      'Pour l’analyse incendie, inclure au minimum : visite terrain ; FDS et inventaire produits dangereux ; extincteurs et dévidoirs ; détection incendie ; éclairage de secours ; portes coupe-feu ; issues de secours ; local batteries ; accès pompiers ; exercices d’évacuation ; formation intérimaires ; avis service externe ou incendie ; ATEX si applicable.',
    nl:
      'Voor de brandanalyse minimaal opnemen: terreinbezoek; VIB en inventaris gevaarlijke producten; brandblussers en haspels; branddetectie; noodverlichting; branddeuren; nooduitgangen; batterijlokaal; toegang brandweer; evacuatieoefeningen; opleiding uitzendkrachten; advies externe dienst of branddeskundige; ATEX indien van toepassing.',
    en:
      'For fire analysis, include at least: site visit; SDS and hazardous products inventory; extinguishers and hose reels; fire detection; emergency lighting; fire doors; emergency exits; battery room; firefighter access; evacuation drills; temporary worker training; external service or fire specialist advice; ATEX if applicable.',
    de:
      'Für die Brandanalyse mindestens aufnehmen: Vor-Ort-Begehung; SDB und Inventar gefährlicher Produkte; Feuerlöscher und Wandhydranten; Branddetektion; Sicherheitsbeleuchtung; Brandschutztüren; Notausgänge; Batterieraum; Feuerwehrzugang; Evakuierungsübungen; Schulung von Leiharbeitnehmern; Stellungnahme des externen Dienstes oder Brandschutzexperten; ATEX falls zutreffend.',
  };
  const normalized = normalizeDocumentType(documentType);

  return normalized.includes('incendie et evacuation') ? fireRows[language] || fireRows.fr : '';
}

function buildRiskEvidenceInstruction(documentType, language) {
  const common = {
    fr:
      'Dans toutes les analyses, recommander concrètement : rapport de visite terrain, photos des situations observées, consultation des travailleurs, avis CPPT si applicable, plan d’action signé ou validé, preuves des mesures existantes, preuves des formations, preuves des contrôles périodiques, documents internes applicables, consignes ou procédures existantes, fiches de poste ou fiches d’instruction si utiles.',
    nl:
      'In alle analyses concreet aanbevelen: terreinbezoekverslag, foto’s van geobserveerde situaties, raadpleging van werknemers, advies CPBW indien van toepassing, ondertekend of gevalideerd actieplan, bewijzen van bestaande maatregelen, opleidingsbewijzen, bewijzen van periodieke controles, toepasselijke interne documenten, bestaande instructies of procedures, functiefiches of instructiefiches indien nuttig.',
    en:
      'In every assessment, give concrete recommendations for: site visit report, photos of observed situations, worker consultation, health and safety committee opinion if applicable, signed or validated action plan, evidence of existing measures, training evidence, periodic inspection evidence, applicable internal documents, existing instructions or procedures, job sheets or instruction sheets where useful.',
    de:
      'In allen Beurteilungen konkret empfehlen: Bericht der Vor-Ort-Begehung, Fotos der beobachteten Situationen, Konsultation der Beschäftigten, Stellungnahme des AGS falls zutreffend, unterzeichneter oder validierter Maßnahmenplan, Nachweise bestehender Maßnahmen, Schulungsnachweise, Nachweise periodischer Kontrollen, anwendbare interne Dokumente, bestehende Anweisungen oder Verfahren, Arbeitsplatz- oder Unterweisungsblätter falls nützlich.',
  };
  const normalized = normalizeDocumentType(documentType);
  const specific = getRiskSpecificEvidence(normalized, language);

  return `${common[language] || common.fr} ${specific}`;
}

function getRiskSpecificEvidence(normalizedDocumentType, language) {
  const text = {
    fire: {
      fr: 'Incendie / évacuation : rapports de contrôle extincteurs, détection incendie, éclairage de secours, portes coupe-feu, plans d’évacuation, registre exercices, liste équipiers de première intervention, registre formations incendie, permis de feu, rapport ventilation, analyse ATEX si applicable, plan d’accès pompiers, inventaire produits dangereux et FDS.',
      nl: 'Brand / evacuatie: keuringsverslagen brandblussers, branddetectie, noodverlichting, branddeuren, evacuatieplannen, register oefeningen, lijst eerste interventieploeg, register brandopleidingen, vuurvergunning, ventilatieverslag, ATEX-analyse indien van toepassing, toegangsplan brandweer, inventaris gevaarlijke producten en VIB.',
      en: 'Fire / evacuation: inspection reports for extinguishers, fire detection, emergency lighting, fire doors, evacuation plans, evacuation drill register, first intervention team list, fire training register, hot-work permit, ventilation report, ATEX analysis if applicable, firefighter access plan, hazardous products inventory and SDS.',
      de: 'Brand / Evakuierung: Prüfberichte Feuerlöscher, Branddetektion, Sicherheitsbeleuchtung, Brandschutztüren, Evakuierungspläne, Übungsregister, Liste der Erstinterventionsteams, Brandschutzschulungsregister, Heißarbeitsgenehmigung, Lüftungsbericht, ATEX-Analyse falls zutreffend, Feuerwehrzugangsplan, Inventar gefährlicher Produkte und SDB.',
    },
    chemicals: {
      fr: 'Produits chimiques : inventaire produits chimiques, FDS, étiquetage CLP, plan de stockage, tableau d’incompatibilité, rapports ventilation, mesures d’exposition si disponibles, avis médecin du travail, consignes de manipulation, registre déchets dangereux et preuves de formation.',
      nl: 'Chemische producten: inventaris chemische producten, VIB, CLP-etikettering, opslagplan, incompatibiliteitstabel, ventilatieverslagen, blootstellingsmetingen indien beschikbaar, advies arbeidsarts, hanteringsinstructies, register gevaarlijk afval en opleidingsbewijzen.',
      en: 'Chemicals: chemical inventory, SDS, CLP labelling, storage plan, incompatibility table, ventilation reports, exposure measurement results if available, occupational physician opinion, handling instructions, hazardous waste register and training evidence.',
      de: 'Chemische Produkte: Chemikalieninventar, SDB, CLP-Kennzeichnung, Lagerplan, Unverträglichkeitstabelle, Lüftungsberichte, Expositionsmessungen falls verfügbar, Stellungnahme des Arbeitsmediziners, Handhabungsanweisungen, Gefahrstoffabfallregister und Schulungsnachweise.',
    },
    machines: {
      fr: 'Machines : notices machines, certificats CE si disponibles, rapports de contrôle, registre maintenance, procédure de consignation, autorisations opérateurs, fiches d’instruction, preuves de formation, rapports incidents ou presque accidents.',
      nl: 'Machines: machinehandleidingen, CE-certificaten indien beschikbaar, keuringsverslagen, onderhoudsregister, lockout/tagout-procedure, operatorautorisaties, instructiefiches, opleidingsbewijzen, incident- of bijna-ongevalrapporten.',
      en: 'Machines: machine manuals, CE certificates if available, inspection reports, maintenance register, lockout procedure, operator authorisations, instruction sheets, training evidence, incident or near-miss reports.',
      de: 'Maschinen: Maschinenanleitungen, CE-Zertifikate falls verfügbar, Prüfberichte, Wartungsregister, Lockout/Tagout-Verfahren, Bedienerfreigaben, Unterweisungsblätter, Schulungsnachweise, Vorfall- oder Beinaheunfallberichte.',
    },
    height: {
      fr: 'Travail en hauteur : plan de prévention, autorisations, contrôle échafaudage, nacelle ou équipement, notices équipements, registre harnais si utilisé, plan de secours, formation travail en hauteur, analyse météo si pertinente.',
      nl: 'Werken op hoogte: preventieplan, toelatingen, controle van steiger, hoogwerker of uitrusting, handleidingen, harnasregister indien gebruikt, reddingsplan, opleiding werken op hoogte, weeranalyse indien relevant.',
      en: 'Work at height: prevention plan, authorisations, scaffold, MEWP or equipment inspection, equipment manuals, harness register if used, rescue plan, work-at-height training, weather assessment if relevant.',
      de: 'Arbeiten in der Höhe: Präventionsplan, Genehmigungen, Prüfung von Gerüst, Hubarbeitsbühne oder Ausrüstung, Ausrüstungsanleitungen, Gurtregister falls verwendet, Rettungsplan, Schulung Arbeiten in der Höhe, Wetterbewertung falls relevant.',
    },
    ergonomics: {
      fr: 'Ergonomie / manutention : observations poste, photos postures, données poids/fréquence, fiche de poste, avis médecin du travail ou ergonome, rapport TMS si disponible, inventaire aides mécaniques, consultation travailleurs.',
      nl: 'Ergonomie / manueel hanteren: werkpostobservaties, foto’s van houdingen, gegevens gewicht/frequentie, functiefiche, advies arbeidsarts of ergonoom, MSA-rapport indien beschikbaar, inventaris mechanische hulpmiddelen, raadpleging werknemers.',
      en: 'Ergonomics / manual handling: workstation observations, posture photos, weight/frequency data, job sheet, occupational physician or ergonomist opinion, MSD report if available, mechanical aids inventory, worker consultation.',
      de: 'Ergonomie / manuelle Handhabung: Arbeitsplatzbeobachtungen, Fotos von Körperhaltungen, Gewichts-/Häufigkeitsdaten, Arbeitsplatzblatt, Stellungnahme Arbeitsmediziner oder Ergonom, MSE-Bericht falls verfügbar, Inventar mechanischer Hilfen, Konsultation der Beschäftigten.',
    },
    lone: {
      fr: 'Travail isolé : procédure travail isolé, moyens d’alerte, registre rondes ou contacts, procédure secours, évaluation horaires, preuve de test du dispositif d’alarme.',
      nl: 'Alleenwerk: procedure alleenwerk, alarmmiddelen, register rondes of contacten, noodprocedure, evaluatie uurroosters, bewijs van alarmtest.',
      en: 'Lone work: lone work procedure, alert means, rounds or contact register, rescue procedure, schedule assessment, alarm device test evidence.',
      de: 'Alleinarbeit: Alleinarbeitsverfahren, Alarmmittel, Rundgangs- oder Kontaktregister, Rettungsverfahren, Bewertung der Arbeitszeiten, Nachweis des Alarmgerätetests.',
    },
    psychosocial: {
      fr: 'Psychosocial : données anonymisées, consultation collective, indicateurs RH agrégés, procédure interne risques psychosociaux, coordonnées personne de confiance, avis conseiller aspects psychosociaux. Ne jamais demander ni afficher de données personnelles sensibles non nécessaires.',
      nl: 'Psychosociaal: geanonimiseerde gegevens, collectieve raadpleging, geaggregeerde HR-indicatoren, interne procedure psychosociale risico’s, gegevens vertrouwenspersoon, advies preventieadviseur psychosociale aspecten. Vraag of toon nooit onnodige gevoelige persoonsgegevens.',
      en: 'Psychosocial: anonymised data, collective consultation, aggregated HR indicators, internal psychosocial risks procedure, trusted person contact details, psychosocial prevention advisor opinion. Never request or display unnecessary sensitive personal data.',
      de: 'Psychosozial: anonymisierte Daten, kollektive Konsultation, aggregierte HR-Indikatoren, internes Verfahren psychosoziale Risiken, Kontaktdaten Vertrauensperson, Stellungnahme des Präventionsberaters für psychosoziale Aspekte. Niemals unnötige sensible personenbezogene Daten verlangen oder anzeigen.',
    },
    vulnerable: {
      fr: 'Maternité / jeunes / intérimaires : fiche de poste, avis médecin du travail si nécessaire, accueil sécurité, preuve formation, consignes adaptées, restrictions ou adaptations validées, supervision prévue, respect de la confidentialité médicale.',
      nl: 'Moederschap / jongeren / uitzendkrachten: functiefiche, advies arbeidsarts indien nodig, veiligheidsintroductie, opleidingsbewijs, aangepaste instructies, gevalideerde beperkingen of aanpassingen, voorziene supervisie, respect voor medische vertrouwelijkheid.',
      en: 'Maternity / young workers / temporary workers: job sheet, occupational physician opinion if needed, safety induction, training evidence, adapted instructions, validated restrictions or adjustments, planned supervision, respect for medical confidentiality.',
      de: 'Mutterschutz / Jugendliche / Leiharbeitnehmer: Arbeitsplatzblatt, Stellungnahme des Arbeitsmediziners falls nötig, Sicherheitsunterweisung, Schulungsnachweis, angepasste Anweisungen, validierte Einschränkungen oder Anpassungen, vorgesehene Aufsicht, Wahrung der medizinischen Vertraulichkeit.',
    },
  };
  const key = normalizedDocumentType.includes('incendie')
    ? 'fire'
    : normalizedDocumentType.includes('produits chimiques')
      ? 'chemicals'
      : normalizedDocumentType.includes('machines')
        ? 'machines'
        : normalizedDocumentType.includes('hauteur')
          ? 'height'
          : normalizedDocumentType.includes('ergonomie') || normalizedDocumentType.includes('manutention')
            ? 'ergonomics'
            : normalizedDocumentType.includes('travail isole')
              ? 'lone'
              : normalizedDocumentType.includes('psychosociaux')
                ? 'psychosocial'
                : normalizedDocumentType.includes('maternite') || normalizedDocumentType.includes('jeunes travailleurs') || normalizedDocumentType.includes('interimaires')
                  ? 'vulnerable'
                  : null;

  return key ? text[key][language] || text[key].fr : '';
}

function buildRiskPhotoInstruction(documentType, language) {
  const common = {
    fr:
      'Pour chaque risque important, recommander au minimum : photo générale de la zone, photo du danger, photo de la mesure existante, photo de la non-conformité si elle existe, photo après correction si une action est réalisée. Toujours indiquer où placer la photo : sous le risque concerné, dans l’annexe photos, dans le plan d’action comme preuve de correction et dans la section preuves des mesures existantes.',
    nl:
      'Voor elk belangrijk risico minimaal aanbevelen: algemene foto van de zone, foto van het gevaar, foto van de bestaande maatregel, foto van de non-conformiteit indien aanwezig, foto na correctie indien een actie is uitgevoerd. Altijd aangeven waar de foto te plaatsen: onder het betrokken risico, in de fotobijlage, in het actieplan als bewijs van correctie en in de sectie bewijzen van bestaande maatregelen.',
    en:
      'For each significant risk, recommend at least: general photo of the area, photo of the hazard, photo of the existing measure, photo of the non-conformity if any, photo after correction if an action is completed. Always state where to place the photo: under the related risk, in the photo appendix, in the action plan as correction evidence and in the existing-measures evidence section.',
    de:
      'Für jedes wesentliche Risiko mindestens empfehlen: Übersichtsbild des Bereichs, Foto der Gefährdung, Foto der bestehenden Maßnahme, Foto der Nichtkonformität falls vorhanden, Foto nach Korrektur falls eine Maßnahme umgesetzt wurde. Immer angeben, wo das Foto einzufügen ist: unter dem betreffenden Risiko, im Fotoanhang, im Maßnahmenplan als Korrekturbeleg und im Abschnitt Nachweise bestehender Maßnahmen.',
  };
  const normalized = normalizeDocumentType(documentType);
  const specific = getRiskSpecificPhotos(normalized, language);

  return `${common[language] || common.fr} ${specific}`;
}

function getRiskSpecificPhotos(normalizedDocumentType, language) {
  const text = {
    fire: {
      fr: 'Incendie : local produits inflammables, armoire de sécurité, racks aérosols, local et chargeurs batteries, ventilation, extincteurs, dévidoirs, détection, éclairage de secours, portes coupe-feu, issues, signalisation, accès pompiers, point de rassemblement, déchets, palettes/cartons/films plastiques, plans affichés, obstacle ou non-conformité, photo après correction.',
      nl: 'Brand: lokaal ontvlambare producten, veiligheidskast, aerosolrekken, batterijlokaal en laders, ventilatie, brandblussers, haspels, detectie, noodverlichting, branddeuren, nooduitgangen, signalisatie, toegang brandweer, verzamelplaats, afvalzone, paletten/karton/plastic folie, uitgehangen plannen, obstakel of non-conformiteit, foto na correctie.',
      en: 'Fire: flammable products room, safety cabinet, aerosol racks, battery room and chargers, ventilation, extinguishers, hose reels, detection, emergency lighting, fire doors, exits, signage, firefighter access, assembly point, waste area, pallets/cardboard/plastic film, displayed plans, obstacle or non-conformity, photo after correction.',
      de: 'Brand: Lager für entzündliche Produkte, Sicherheitsschrank, Aerosolregale, Batterieraum und Ladegeräte, Lüftung, Feuerlöscher, Wandhydranten, Detektion, Sicherheitsbeleuchtung, Brandschutztüren, Ausgänge, Beschilderung, Feuerwehrzugang, Sammelstelle, Abfallbereich, Paletten/Karton/Kunststofffolie, ausgehängte Pläne, Hindernis oder Nichtkonformität, Foto nach Korrektur.',
    },
    chemicals: {
      fr: 'Produits chimiques : étiquettes CLP, stockage, rétention, produits incompatibles, ventilation, douche oculaire, kit anti-déversement, EPI, déchets dangereux, FDS accessibles.',
      nl: 'Chemische producten: CLP-etiketten, opslag, lekbakken, incompatibele producten, ventilatie, oogdouche, morskit, PBM, gevaarlijk afval, toegankelijke VIB.',
      en: 'Chemicals: CLP labels, storage, retention, incompatible products, ventilation, eyewash, spill kit, PPE, hazardous waste, accessible SDS.',
      de: 'Chemische Produkte: CLP-Etiketten, Lagerung, Auffangwannen, unverträgliche Produkte, Lüftung, Augendusche, Leckage-Set, PSA, gefährliche Abfälle, zugängliche SDB.',
    },
    machines: {
      fr: 'Machines : machine complète, zone opérateur, protections, arrêt d’urgence, zone dangereuse, maintenance, consignation, plaque signalétique, signalisation, poste de travail.',
      nl: 'Machines: volledige machine, operatorzone, afschermingen, noodstop, gevarenzone, onderhoud, lockout/tagout, typeplaatje, signalisatie, werkpost.',
      en: 'Machines: complete machine, operator area, guards, emergency stop, danger zone, maintenance, lockout, nameplate, signage, workstation.',
      de: 'Maschinen: vollständige Maschine, Bedienbereich, Schutzvorrichtungen, Not-Aus, Gefahrenbereich, Wartung, Lockout/Tagout, Typenschild, Beschilderung, Arbeitsplatz.',
    },
    height: {
      fr: 'Travail en hauteur : accès, garde-corps, plateforme, échelle, ancrage, harnais si utilisé, zone au sol, balisage, météo ou obstacles.',
      nl: 'Werken op hoogte: toegang, leuningen, platform, ladder, ankerpunt, harnas indien gebruikt, zone op de grond, afbakening, weer of obstakels.',
      en: 'Work at height: access, guardrails, platform, ladder, anchor point, harness if used, ground area, demarcation, weather or obstacles.',
      de: 'Arbeiten in der Höhe: Zugang, Geländer, Plattform, Leiter, Anschlagpunkt, Gurt falls verwendet, Bodenbereich, Absperrung, Wetter oder Hindernisse.',
    },
    ergonomics: {
      fr: 'Ergonomie : posture réelle, hauteur de travail, charge manipulée, distance de port, zone de stockage, aide mécanique, espace disponible, répétitivité si observable.',
      nl: 'Ergonomie: werkelijke houding, werkhoogte, gehanteerde last, draagafstand, opslagzone, mechanisch hulpmiddel, beschikbare ruimte, repetitiviteit indien zichtbaar.',
      en: 'Ergonomics: actual posture, working height, handled load, carrying distance, storage area, mechanical aid, available space, repetitiveness if observable.',
      de: 'Ergonomie: tatsächliche Körperhaltung, Arbeitshöhe, gehandhabte Last, Tragedistanz, Lagerbereich, mechanische Hilfe, verfügbarer Raum, Wiederholung falls beobachtbar.',
    },
    lone: {
      fr: 'Travail isolé : zone isolée, moyen d’alerte, accès secours, signalisation, zone sans visibilité, point de contact.',
      nl: 'Alleenwerk: geïsoleerde zone, alarmmiddel, toegang hulpdiensten, signalisatie, zone zonder zichtbaarheid, contactpunt.',
      en: 'Lone work: isolated area, alert means, rescue access, signage, area without visibility, contact point.',
      de: 'Alleinarbeit: isolierter Bereich, Alarmmittel, Rettungszugang, Beschilderung, Bereich ohne Sichtkontakt, Kontaktpunkt.',
    },
    psychosocial: {
      fr: 'Psychosocial : ne pas demander de photos de personnes ou de situations identifiantes ; privilégier documents anonymisés, procédures, organigramme, planning et indicateurs collectifs.',
      nl: 'Psychosociaal: vraag geen foto’s van personen of identificeerbare situaties; geef voorrang aan geanonimiseerde documenten, procedures, organigram, planning en collectieve indicatoren.',
      en: 'Psychosocial: do not request photos of people or identifiable situations; prefer anonymised documents, procedures, organisation chart, schedules and collective indicators.',
      de: 'Psychosozial: keine Fotos von Personen oder identifizierbaren Situationen verlangen; anonymisierte Dokumente, Verfahren, Organigramm, Planung und kollektive Indikatoren bevorzugen.',
    },
  };
  const key = normalizedDocumentType.includes('incendie')
    ? 'fire'
    : normalizedDocumentType.includes('produits chimiques')
      ? 'chemicals'
      : normalizedDocumentType.includes('machines')
        ? 'machines'
        : normalizedDocumentType.includes('hauteur')
          ? 'height'
          : normalizedDocumentType.includes('ergonomie') || normalizedDocumentType.includes('manutention')
            ? 'ergonomics'
            : normalizedDocumentType.includes('travail isole')
              ? 'lone'
              : normalizedDocumentType.includes('psychosociaux')
                ? 'psychosocial'
                : null;

  return key ? text[key][language] || text[key].fr : '';
}

function buildActionTypeInstruction(language) {
  const instructions = {
    fr: 'Maîtrise du risque ; Validation de l’analyse',
    nl: 'Risicobeheersing ; Validatie van de analyse',
    en: 'Risk control ; Assessment validation',
    de: 'Risikobeherrschung ; Validierung der Beurteilung',
  };

  return instructions[language] || instructions.fr;
}

function buildRiskSpecializationInstruction(documentType) {
  const normalized = normalizeDocumentType(documentType);
  const rules = [
    {
      match: 'analyse de risques incendie et evacuation',
      text:
        'Fire and evacuation: if mentioned by the context, address flammable solvents, aerosols, lithium-ion batteries, lead-acid batteries, flammable spills, toxic fumes, incompatible products, ignition sources, hot work, hot-work permits, ATEX to verify, ventilation, compartmentation, fire doors, detection, alarm, emergency lighting, extinguishers and hose reels, emergency exits, firefighter access, assembly point, evacuation of visitors/drivers/temporary workers, spread through pallets/cardboard/plastic film, hazardous waste storage and coordination with subcontractors.',
    },
    {
      match: 'analyse de risques produits chimiques',
      text:
        'Chemicals: if relevant, address product inventory, SDS, CLP labelling, compatibility, retention storage, ventilation, inhalation/skin/eye exposure, CMR where applicable, substitution, hazardous waste, chemical PPE, training, occupational physician opinion and external service or hygienist support if needed.',
    },
    {
      match: 'analyse de risques machines et equipements',
      text:
        'Machines and equipment: if relevant, address machine conformity, manuals, guards, emergency stop, lockout/tagout, maintenance, periodic inspection, projections, cuts, entanglement, crushing, electrical/hydraulic/pneumatic energy, training, authorisation and written instructions.',
    },
    {
      match: 'analyse de risques travail en hauteur',
      text:
        'Work at height: if relevant, address elimination of work at height, equipment choice, guardrails, platforms, ladders, harness only when necessary, rescue plan, weather, training, equipment inspection, authorisation and simultaneous activities.',
    },
    {
      match: 'analyse de risques manutention manuelle',
      text:
        'Manual handling and ergonomics: if relevant, address weight, frequency, postures, distances, mechanical aids, organisation, MSDs, vulnerable workers, training and occupational physician or ergonomist opinion.',
    },
    {
      match: 'analyse de risques ergonomie',
      text:
        'Ergonomics and manual handling: if relevant, address weight, frequency, postures, distances, mechanical aids, workstation layout, work organisation, MSDs, vulnerable workers, training and occupational physician or ergonomist opinion.',
    },
    {
      match: 'analyse de risques travail isole',
      text:
        'Lone work: if relevant, address isolated situations, alert means, contact procedure, rescue, schedules, aggravating risks, prohibitions on lone work and periodic checks.',
    },
    {
      match: 'analyse de risques psychosociaux',
      text:
        'Psychosocial risks: if relevant, address workload, autonomy, conflicts, internal/external violence, harassment, stress, organisation, consultation, confidentiality, trusted person, prevention advisor for psychosocial aspects and GDPR limits.',
    },
    {
      match: 'analyse de risques maternite',
      text:
        'Maternity: if relevant, address prohibited or avoidable risks, job adaptation, reception and training, supervision, occupational physician opinion, confidentiality, limitations, information to the worker and line management.',
    },
    {
      match: 'analyse de risques jeunes travailleurs',
      text:
        'Young workers: if relevant, address prohibited or avoidable risks, job adaptation, reception and training, supervision, occupational physician opinion, limitations, information to the worker and line management.',
    },
    {
      match: 'analyse de risques interimaires',
      text:
        'Temporary workers: if relevant, address prohibited or avoidable risks, workstation adaptation, reception and training, supervision, occupational physician opinion, limitations, information to the user undertaking and line management.',
    },
  ];

  return rules.find((rule) => normalized.includes(rule.match))?.text
    || 'General risk assessment: apply the full validation, completeness, STOP hierarchy, Belgian prevention and consultation requirements to all relevant hazards identified from the context.';
}

function buildPreventionDocumentPrompt(
  documentType,
  formData,
  language = 'fr',
  languageLabel = 'Français',
  documentDefinition,
) {
  const languageConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.fr;
  const resolvedLanguageLabel = languageConfig.label || languageLabel;
  const definition = documentDefinition || getDocumentDefinition(documentType);
  const template = DOCUMENT_TEMPLATES[definition?.family];

  if (!definition || !template) {
    throw new Error(`Template interne introuvable pour documentType: ${documentType}`);
  }

  const title = `${definition.labels[language] || definition.labels.fr} – ${languageConfig.draftSuffix}`;
  const sections = template.sections[language] || template.sections.fr;
  const structure = [`# ${title}`, '', ...sections.map((sectionTitle, index) => `## ${index + 1}. ${sectionTitle}`)]
    .join('\n');
  const tableInstruction = buildTemplateTableInstruction(template, language, definition.family);
  const promptMessages = PROMPT_LOCALIZATION[language] || PROMPT_LOCALIZATION.fr;
  const secondaryInstruction = definition.hasSecondaryDocument
    ? promptMessages.secondaryInstruction(languageConfig.secondaryTitle)
    : promptMessages.noSecondaryInstruction;

  return `Type de document demandé : ${documentType}
Famille de template : ${definition.family}
Langue cible déterminée par le backend : ${language} (${resolvedLanguageLabel})

Données formData à exploiter :
${JSON.stringify(formData, null, 2)}

Structure obligatoire du document principal :
${structure}

Consignes opérationnelles :
1. Rédige l’intégralité du document en ${resolvedLanguageLabel}, y compris titres, tableaux, libellés, notes, points d’attention, avertissements et conclusion. Ne laisse aucun texte fixe en français dans un document néerlandais, anglais ou allemand.
2. Présente le document comme un projet professionnel belge de prévention au travail, à adapter et à valider. Ne prétends jamais qu’il est juridiquement complet ou validé.
3. Exploite toutes les données reçues comme faits fournis. Si une donnée manque ou reste incertaine, écris exactement cette formulation dans la langue cible : ${languageConfig.missingInfo}
4. Ne laisse aucune section vide. Si les informations sont limitées, donne des hypothèses prudentes, des points de validation et des actions réalistes plutôt qu’un remplissage pauvre.
5. Maintiens une logique belge bien-être au travail : employeur, ligne hiérarchique, conseiller en prévention, SIPPT/SEPPT, CPPT, travailleurs, sous-traitants si pertinent, Code belge du bien-être au travail, Plan Global de Prévention et Plan Annuel d’Action.
6. Conserve la prudence RGPD : ${languageConfig.gdprReminder}
7. Ne cite pas d’articles légaux précis. Cite uniquement des références générales pertinentes comme la loi du 4 août 1996, le Code du bien-être au travail, les Livres ou Titres utiles, le PGP, le PAA, le SIPPT/SEPPT et le CPPT.
8. ${tableInstruction}
9. Pour chaque action proposée, indique au minimum une mesure concrète, un responsable, une échéance ou une formule de validation terrain, et une preuve attendue exploitable.
10. ${secondaryInstruction}
11. La dernière section du document principal doit conclure clairement que le document est un projet à adapter à la situation réelle et à valider par les acteurs compétents.
12. Termine le document principal par cette mention finale traduite, une seule fois :
${languageConfig.finalMention}
13. Avant de répondre, vérifie que tous les titres correspondent à la langue cible, que les tableaux sont en Markdown, qu’aucun libellé fixe français ne reste dans un document NL/EN/DE, et qu’aucune section n’est vide.
14. Garde une réponse concise pour éviter les timeouts.`;
}

function buildTemplateTableInstruction(template, language, family) {
  const columns = template.tableColumns?.[language];
  const promptMessages = PROMPT_LOCALIZATION[language] || PROMPT_LOCALIZATION.fr;

  if (!columns) {
    return promptMessages.flexibleStructure;
  }

  const rowInstruction = family === 'annual_action_plan'
    ? promptMessages.annualRows
    : promptMessages.defaultRows;

  return `${rowInstruction} ${promptMessages.columnsPrefix}: ${columns}.`;
}

function formatRiskScale(language) {
  const labels = LANGUAGE_CONFIGS[language]?.riskLevels || LANGUAGE_CONFIGS.fr.riskLevels;

  return `1-10 ${labels.low}, 11-30 ${labels.medium}, 31-60 ${labels.high}, 61-125 ${labels.critical}`;
}

export {
  app,
  assertRiskAssessmentMarkdownIsValid,
  buildFallbackRiskItems,
  buildCheckoutMetadata,
  buildRiskAssessmentFixedSections,
  BILLING_PLANS,
  canUseDocumentType,
  canUseDevice,
  createLicenseRecord,
  createUserLicenseFromCheckoutMetadata,
  ensureCompleteRiskAssessmentData,
  findLicenseByKey,
  findUserLicenseByEmail,
  getPublicBillingPlans,
  finalizeRiskAssessmentMarkdown,
  generateAuthToken,
  getCurrentPeriod,
  getPlanDefaults,
  hashPassword,
  incrementUsage,
  isDeviceActivated,
  isRiskAnalysisDocument,
  isSimplePreventionDocument,
  isValidEmail,
  loadLicenses,
  loadUserLicenses,
  normalizeEmail,
  normalizeLicenseKey,
  registerDeviceIfAllowed,
  renderRiskAssessmentFinalMarkdown,
  resetMonthlyUsageIfNeeded,
  saveLicenses,
  saveUserLicenses,
  validateCheckoutPayload,
  validateLicenseAccess,
  verifyAuthToken,
  verifyPassword,
  validateRiskAssessmentStructuredData,
};
