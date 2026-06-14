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
      'Méthode de cotation utilisée',
      'Identification détaillée des dangers',
      'Tableau principal d’analyse des risques',
      'Analyse des risques résiduels',
      'Priorités d’action',
      'Projet de plan d’action',
      'Lien avec le Plan Global de Prévention et le Plan Annuel d’Action',
      'Documents à créer ou mettre à jour',
      'Acteurs à consulter ou à impliquer',
      'Annexes nécessaires',
      'Guide pratique pour le conseiller en prévention',
      'Validabilité de l’analyse et conditions avant validation',
      'Évaluation de complétude de l’analyse',
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
      'N° | Activité ou tâche | Danger | Risque | Personnes exposées | Mesures existantes | Preuves existantes | Gravité | Justification gravité | Probabilité | Justification probabilité | Exposition | Justification exposition | Éléments observés ou déclarés | Éléments à confirmer | Score initial | Niveau initial | Mesures complémentaires | Niveau STOP | Score résiduel provisoire | Niveau résiduel | Responsable | Échéance | Contrôle / preuve attendue | Priorité',
    residualTableColumns:
      'Risque principal | Score initial | Score résiduel provisoire | Condition de réduction | Preuve nécessaire | Statut',
    actionTableColumns:
      'N° | Type d’action | Risque ou point concerné | Mesure proposée | Objectif | Responsable | Échéance | Preuve attendue | Priorité | Statut',
    hazardTableColumns:
      'Danger | Scénario plausible | Zone ou tâche concernée | Personnes exposées | Facteurs aggravants | Mesures existantes connues | Preuves à vérifier | Ce que le conseiller doit faire | Où documenter la preuve | Points bloquants avant validation',
    completenessTableColumns:
      'Élément évalué | Statut | Commentaire | Action nécessaire | Priorité',
    documentStatuses:
      'Projet préparatoire; Analyse partielle; Analyse exploitable sous réserve; Analyse validable après compléments; Non validable en l’état',
    completenessStatuses:
      'Présent; Partiel; Absent; À vérifier; Bloquant avant validation',
    stopLevels:
      'Suppression / substitution; Mesure technique collective; Mesure organisationnelle; Protection individuelle',
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
      'Ce document est un projet à adapter à la situation réelle de l’entreprise et à valider par le conseiller en prévention, l’employeur et, le cas échéant, le service externe, le médecin du travail ou le CPPT. Il ne constitue pas à lui seul une preuve de conformité réglementaire.',
  },
  nl: {
    code: 'nl',
    label: 'Nederlands',
    title: 'Risicoanalyse – Ontwerp te valideren',
    sections: [
      'Identificatie van het document',
      'Context en doelstelling',
      'Toepasselijke Belgische regelgevende referenties',
      'Afbakening van de analyse',
      'Gebruikte of nog te verkrijgen informatiebronnen',
      'Hypothesen en beperkingen',
      'Beschrijving van functies, taken en blootgestelde werknemers',
      'Gebruikte beoordelingsmethode',
      'Gedetailleerde identificatie van de gevaren',
      'Hoofdtabel van de risicoanalyse',
      'Analyse van de restrisico’s',
      'Prioritaire acties',
      'Ontwerpactieplan',
      'Verband met het Globaal Preventieplan en het Jaaractieplan',
      'Documenten die moeten worden opgesteld of bijgewerkt',
      'Te raadplegen of te betrekken actoren',
      'Noodzakelijke bijlagen',
      'Praktische gids voor de preventieadviseur',
      'Valideerbaarheid van de analyse en voorwaarden vóór validatie',
      'Beoordeling van de volledigheid van de analyse',
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
      'Nr. | Activiteit of taak | Gevaar | Risico | Blootgestelde personen | Bestaande maatregelen | Bestaande bewijzen | Ernst | Motivering ernst | Waarschijnlijkheid | Motivering waarschijnlijkheid | Blootstelling | Motivering blootstelling | Vastgestelde of verklaarde elementen | Te bevestigen elementen | Initiële score | Initieel niveau | Aanvullende maatregelen | STOP-niveau | Voorlopige restrisicoscore | Restrisiconiveau | Verantwoordelijke | Termijn | Controle / verwacht bewijs | Prioriteit',
    residualTableColumns:
      'Belangrijkste risico | Initiële score | Voorlopige restrisicoscore | Voorwaarde voor vermindering | Vereist bewijs | Status',
    actionTableColumns:
      'Nr. | Type actie | Betrokken risico of punt | Voorgestelde maatregel | Doel | Verantwoordelijke | Termijn | Verwacht bewijs | Prioriteit | Status',
    hazardTableColumns:
      'Gevaar | Waarschijnlijk scenario | Betrokken zone of taak | Blootgestelde personen | Verergerende factoren | Bekende bestaande maatregelen | Te controleren bewijzen | Wat de preventieadviseur moet doen | Waar het bewijs te documenteren | Blokkerende punten vóór validatie',
    completenessTableColumns:
      'Beoordeeld element | Status | Opmerking | Noodzakelijke actie | Prioriteit',
    documentStatuses:
      'Voorbereidend ontwerp; Gedeeltelijke analyse; Analyse bruikbaar onder voorbehoud; Analyse valideerbaar na aanvullingen; Niet valideerbaar in de huidige staat',
    completenessStatuses:
      'Aanwezig; Gedeeltelijk; Afwezig; Te controleren; Blokkerend vóór validatie',
    stopLevels:
      'Eliminatie / substitutie; Collectieve technische maatregel; Organisatorische maatregel; Persoonlijke bescherming',
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
      'Risk scoring method used',
      'Detailed identification of hazards',
      'Main risk assessment table',
      'Residual risk analysis',
      'Action priorities',
      'Draft action plan',
      'Link with the Global Prevention Plan and the Annual Action Plan',
      'Documents to create or update',
      'Actors to consult or involve',
      'Required appendices',
      'Practical guide for the prevention advisor',
      'Validability of the assessment and conditions before validation',
      'Completeness assessment of the risk assessment',
      'Conclusion',
      'Validation statement',
    ],
    riskLevels: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    riskTableColumns:
      'No. | Activity or task | Hazard | Risk | Exposed persons | Existing measures | Existing evidence | Severity | Severity justification | Probability | Probability justification | Exposure | Exposure justification | Observed or declared elements | Elements to be confirmed | Initial score | Initial level | Additional measures | STOP level | Provisional residual score | Residual level | Responsible person | Deadline | Control / expected evidence | Priority',
    residualTableColumns:
      'Main risk | Initial score | Provisional residual score | Reduction condition | Required evidence | Status',
    actionTableColumns:
      'No. | Action type | Related risk or point | Proposed measure | Objective | Responsible person | Deadline | Expected evidence | Priority | Status',
    hazardTableColumns:
      'Hazard | Plausible scenario | Area or task concerned | Exposed persons | Aggravating factors | Known existing measures | Evidence to be checked | What the prevention advisor must do | Where to document the evidence | Blocking points before validation',
    completenessTableColumns:
      'Assessed element | Status | Comment | Required action | Priority',
    documentStatuses:
      'Preparatory draft; Partial assessment; Assessment usable subject to reservations; Assessment validable after additional information; Not validable as it stands',
    completenessStatuses:
      'Present; Partial; Missing; To be checked; Blocking before validation',
    stopLevels:
      'Elimination / substitution; Collective technical measure; Organisational measure; Personal protection',
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
      'This document is a draft that must be adapted to the actual situation of the organisation and validated by the prevention advisor, the employer and, where applicable, the external service, the occupational physician or the health and safety committee. It does not constitute proof of regulatory compliance on its own.',
  },
  de: {
    code: 'de',
    label: 'Deutsch',
    title: 'Gefährdungsbeurteilung – Entwurf zur Validierung',
    sections: [
      'Dokumentidentifikation',
      'Kontext und Zielsetzung',
      'Anwendbare belgische regulatorische Referenzen',
      'Umfang der Beurteilung',
      'Verwendete oder noch zu beschaffende Informationsquellen',
      'Annahmen und Einschränkungen',
      'Beschreibung der Arbeitsplätze, Tätigkeiten und exponierten Beschäftigten',
      'Verwendete Bewertungsmethode',
      'Detaillierte Identifikation der Gefährdungen',
      'Haupttabelle der Gefährdungsbeurteilung',
      'Analyse der Restrisiken',
      'Handlungsprioritäten',
      'Entwurf des Maßnahmenplans',
      'Verbindung mit dem Globalen Präventionsplan und dem Jährlichen Aktionsplan',
      'Zu erstellende oder zu aktualisierende Dokumente',
      'Zu konsultierende oder einzubeziehende Akteure',
      'Erforderliche Anhänge',
      'Praktischer Leitfaden für den Präventionsberater',
      'Validierbarkeit der Beurteilung und Bedingungen vor der Validierung',
      'Bewertung der Vollständigkeit der Beurteilung',
      'Schlussfolgerung',
      'Validierungshinweis',
    ],
    riskLevels: {
      low: 'Niedrig',
      medium: 'Mittel',
      high: 'Hoch',
      critical: 'Kritisch',
    },
    riskTableColumns:
      'Nr. | Tätigkeit oder Aufgabe | Gefährdung | Risiko | Exponierte Personen | Bestehende Maßnahmen | Bestehende Nachweise | Schwere | Begründung der Schwere | Wahrscheinlichkeit | Begründung der Wahrscheinlichkeit | Exposition | Begründung der Exposition | Beobachtete oder angegebene Elemente | Zu bestätigende Elemente | Ausgangsbewertung | Ausgangsniveau | Zusätzliche Maßnahmen | STOP-Ebene | Vorläufige Restrisikobewertung | Restrisikoniveau | Verantwortliche Person | Frist | Kontrolle / erwarteter Nachweis | Priorität',
    residualTableColumns:
      'Hauptrisiko | Ausgangsbewertung | Vorläufige Restrisikobewertung | Bedingung für die Reduzierung | Erforderlicher Nachweis | Status',
    actionTableColumns:
      'Nr. | Maßnahmentyp | Betroffenes Risiko oder Punkt | Vorgeschlagene Maßnahme | Ziel | Verantwortliche Person | Frist | Erwarteter Nachweis | Priorität | Status',
    hazardTableColumns:
      'Gefährdung | Plausibles Szenario | Betroffener Bereich oder Aufgabe | Exponierte Personen | Erschwerende Faktoren | Bekannte bestehende Maßnahmen | Zu prüfende Nachweise | Was der Präventionsberater tun muss | Wo der Nachweis zu dokumentieren ist | Blockierende Punkte vor Validierung',
    completenessTableColumns:
      'Bewertetes Element | Status | Kommentar | Erforderliche Maßnahme | Priorität',
    documentStatuses:
      'Vorbereitender Entwurf; Teilweise Beurteilung; Beurteilung unter Vorbehalt nutzbar; Beurteilung nach Ergänzungen validierbar; In der vorliegenden Form nicht validierbar',
    completenessStatuses:
      'Vorhanden; Teilweise; Fehlend; Zu prüfen; Blockierend vor Validierung',
    stopLevels:
      'Beseitigung / Substitution; Kollektive technische Maßnahme; Organisatorische Maßnahme; Persönlicher Schutz',
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
      'Dieses Dokument ist ein Entwurf, der an die tatsächliche Situation des Unternehmens angepasst und vom Präventionsberater, dem Arbeitgeber sowie gegebenenfalls vom externen Dienst, dem Arbeitsmediziner oder dem Ausschuss für Gefahrenverhütung und Schutz am Arbeitsplatz validiert werden muss. Es stellt für sich allein keinen Nachweis der regulatorischen Konformität dar.',
  },
};

const SYSTEM_PROMPT = `Tu es PreventIA Belgique, un assistant spécialisé en prévention, sécurité, santé et bien-être au travail en Belgique.

Tu aides à produire des projets d’analyses de risques et documents de prévention selon la logique du Code belge du bien-être au travail. Tu ne remplaces jamais le conseiller en prévention, l’employeur, le SIPPT/SEPPT, le médecin du travail, le CPPT ou les autorités compétentes.

Règles strictes :
- Répondre uniquement en Markdown, sans JSON ni préambule.
- Répondre exclusivement dans la langue demandée par le prompt utilisateur, avec un ton professionnel, sans anglicisme inutile et sans formulation familière, approximative ou non professionnelle.
- Respecter exactement l’ordre, les titres et les tableaux demandés par le template utilisateur.
- Rester synthétique : environ 2500 à 3500 mots maximum.
- Ne jamais affirmer qu’un document est juridiquement complet.
- Ne jamais inventer d’articles légaux précis ; citer seulement la loi, le Code, les Livres ou Titres pertinents.
- Exploiter tous les champs formData. La valeur "Non renseigné / à vérifier" est une information manquante à traiter comme point à vérifier, pas comme une raison de laisser une section vide.
- Distinguer faits fournis, hypothèses prudentes, informations manquantes et points à valider lorsque c’est utile.
- Ne jamais produire un tableau rempli uniquement avec "À compléter".
- Dans les analyses de risques, ne jamais utiliser seul un fallback vague comme "Information à compléter ou à valider sur le terrain." Si des informations existent, produire une analyse provisoire et préciser ce qui manque, pourquoi c’est important, quelle preuve est attendue et qui doit vérifier. Si aucune information exploitable n’existe, ajouter quand même une action de validation concrète.
- Dans les analyses de risques, ne jamais laisser croire que l’analyse est finalisée lorsque la visite terrain, les preuves documentaires, la consultation des travailleurs, le CPPT, les FDS, les rapports de contrôle, les justifications de cotation, les mesures existantes ou les avis externes nécessaires restent à confirmer.
- Ne jamais répéter la mention finale. Elle apparaît une seule fois, dans la dernière section demandée.
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
# Analyse de risques – Projet à valider

## 1. Identification du document
## 2. Contexte et objectif
## 3. Références réglementaires belges applicables
## 4. Périmètre de l’analyse
## 5. Sources d’information utilisées ou à obtenir
## 6. Hypothèses et limites
## 7. Description des postes, tâches et travailleurs exposés
## 8. Méthode de cotation utilisée
## 9. Identification détaillée des dangers
## 10. Tableau principal d’analyse des risques
## 11. Analyse des risques résiduels
## 12. Priorités d’action
## 13. Projet de plan d’action
## 14. Lien avec le Plan Global de Prévention et le Plan Annuel d’Action
## 15. Documents à créer ou mettre à jour
## 16. Acteurs à consulter ou à impliquer
## 17. Annexes nécessaires
## 18. Validabilité de l’analyse et conditions avant validation
## 19. Évaluation de complétude de l’analyse
## 20. Conclusion
## 21. Mention finale obligatoire

Contraintes de sortie :
- Section 3 : tableau Markdown de maximum 8 références avec colonnes équivalentes à "Référence ou domaine réglementaire", "Pourquoi c’est applicable", "Conséquence pratique pour l’analyse ou les actions", dans la langue demandée.
- Section 8 : expliquer la formule, les échelles, les seuils et l’interprétation de la cotation.
- Section 9 : tableau Markdown ou liste structurée obligatoire avec danger, scénario plausible, zone ou tâche, personnes exposées, facteurs aggravants, mesures existantes connues, preuves à vérifier et points bloquants avant validation.
- Section 10 : tableau principal Markdown de maximum 8 risques concrets. Chaque risque coté doit inclure score initial, niveau initial, niveau STOP, score résiduel provisoire, niveau résiduel et preuve attendue. Ne jamais déplacer ce tableau en section 11.
- Section 11 : synthèse des risques résiduels uniquement, sans reprendre le tableau principal complet.
- Section 12 : ne jamais laisser vide. Toujours produire au moins 4 priorités structurées avec Priorité 1 actions urgentes ou risques les plus élevés, Priorité 2 risques élevés ou moyens significatifs, Priorité 3 risques moyens, Priorité 4 amélioration continue. Chaque priorité contient explicitement : action, risque concerné, responsable, échéance et preuve attendue.
- Section 13 : tableau Markdown de maximum 8 actions distinguant les actions de maîtrise du risque et les actions de validation de l’analyse.
- Section 14 : expliquer uniquement le lien PGP/PAA, sans y placer le tableau complet du plan d’action.
- Section 15 : toujours 5 à 8 documents concrets à créer ou mettre à jour, jamais une simple mention "Information à compléter ou à valider sur le terrain".
- Sections 5, 7, 9, 15 et 16 doivent contenir du contenu exploitable, pas seulement un titre. Section 9 : toujours produire 6 à 8 dangers détaillés, concrets et contextualisés. Ne jamais afficher seulement "Information à compléter ou à valider sur le terrain." ni seulement "Dangers identifiés :". Pour un service technique communal, inclure si pertinent : manutention manuelle, machines/outillage électroportatif, produits chimiques, circulation véhicules/piétons, bruit, travail en hauteur, glissades/chutes de plain-pied, incendie, coactivité avec citoyens ou sous-traitants, conditions météo, travail isolé.
- Section 18 : indiquer le statut du document, ce qui est déjà exploitable, ce qui manque pour validation, les points bloquants, les actions minimales avant validation, les acteurs devant valider et un avis clair sur la validabilité en l’état.
- Section 19 : tableau obligatoire d’évaluation de complétude. Évaluer les éléments métier demandés par le prompt utilisateur avec un statut précis.
- Section 20 : conclure clairement si le document est un projet ou une analyse exploitable sous réserve, s’il est complet, s’il peut alimenter le PGP/PAA, être présenté au CPPT, être utilisé en audit et quelles conditions minimales sont requises avant validation.
- Par défaut en français, la section 21 doit contenir exactement cette mention, une seule fois :
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
    Object.values(definition.labels).map((label) => [normalizeDocumentType(label), definition]),
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
    const documentDefinition = validateGenerateDocumentPayload(documentType, formData);
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
    });

    const generatedDocument = processGeneratedDocument(
      response.output_text?.trim(),
      documentDefinition,
    );
    const { document, complementaryDocument } = generatedDocument;

    if (!document) {
      const error = new Error('La génération du document n’a pas produit de contenu.');
      error.status = 502;
      throw error;
    }

    res.json({
      success: true,
      source: 'ai_backend',
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

function processGeneratedDocument(outputText, documentDefinition) {
  const normalizedOutput = normalizeRiskLevels(outputText || '');

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

    assert.match(prompt, new RegExp(escapeRegExp(`## 8. ${config.sections[7]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(`## 9. ${config.sections[8]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(`## 18. ${config.sections[17]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(`## 19. ${config.sections[18]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(`## 20. ${config.sections[19]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(`## 21. ${config.sections[20]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(`## 22. ${config.sections[21]}`)));
    assert.match(prompt, new RegExp(escapeRegExp(config.hazardTableColumns)));
    assert.match(prompt, new RegExp(escapeRegExp(config.riskTableColumns)));
    assert.match(prompt, new RegExp(escapeRegExp(config.residualTableColumns)));
    assert.match(prompt, new RegExp(escapeRegExp(config.completenessTableColumns)));
    assert.match(prompt, new RegExp(escapeRegExp(config.actionTableColumns)));
    assert.match(prompt, new RegExp(escapeRegExp(config.documentStatuses.split('; ')[0])));
    assert.match(prompt, new RegExp(escapeRegExp(config.provisionalScoreText)));
    assert.match(prompt, new RegExp(escapeRegExp(config.advisorHelpBlockTitle)));
    assert.match(prompt, new RegExp(escapeRegExp(config.advisorHelpBlockClose)));
    assert.match(prompt, /Score =|Scoremethode|Risk scoring method used|Bewertungsmethode/);
    assert.match(prompt, /\[À VÉRIFIER SUR LE TERRAIN\]|\[TO BE CHECKED ON SITE\]|\[TER PLAATSE TE CONTROLEREN\]|\[VOR ORT ZU PRÜFEN\]/);
    assert.match(prompt, /1-10/);
    assert.match(prompt, /61-125/);
    assert.match(prompt, /provisional residual score|restrisico|Restrisiken|risque résiduel/);
    assert.match(prompt, /STOP|stop/i);
    assert.match(prompt, /guide pratique|Praktische gids|Practical guide|Praktischer Leitfaden/i);
    assert.match(prompt, /Documents à joindre|Toe te voegen documenten|Documents to attach|Beizufügende Dokumente/);
    assert.match(prompt, /Photos à ajouter|Toe te voegen foto’s|Photos to add|Hinzuzufügende Fotos/);
    assert.match(prompt, /Où placer les photos|Waar de foto’s te plaatsen|Where to place the photos|Wo die Fotos einzufügen sind/);
    assert.match(prompt, /rapport de visite terrain|terreinbezoekverslag|site visit report|Vor-Ort-Begehung/);
    assert.match(prompt, /photo générale|algemene foto|general photo|Übersichtsbild/);
    assert.match(prompt, /section 10 contains the complete main table/);
    assert.match(prompt, /section 11 is only a synthetic residual analysis/);
    assert.match(prompt, /documents, actors and annexes are correctly separated/);
    assert.match(prompt, /score justifications are present/);
    assert.doesNotMatch(prompt, /all 18 sections/);
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
  const riskScale = formatRiskScale(language);
  const completenessElements = buildCompletenessElements(language);
  const scoringMethodInstruction = buildRiskScoringMethodInstruction(language);
  const businessBlockInstruction = buildBusinessBlockInstruction(language);
  const advisorHelpBlockInstruction = buildAdvisorHelpBlockInstruction(language);
  const actionTypeInstruction = buildActionTypeInstruction(language);
  const specializationInstruction = buildRiskSpecializationInstruction(documentType);
  const practicalGuideInstruction = buildPracticalGuideInstruction(documentType, language);
  const practicalGuideRowsInstruction = buildPracticalGuideRowsInstruction(documentType, language);
  const evidenceInstruction = buildRiskEvidenceInstruction(documentType, language);
  const photoInstruction = buildRiskPhotoInstruction(documentType, language);
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
4. The entire document must be written in the target language. Do not mix languages. Use the translated headings, tables, risk levels and final statement from the language configuration. Do not use these non-target headings or terms: ${languageConfig.forbiddenTerms.join('; ')}.
5. Section 3 : sélectionne maximum 8 références pertinentes parmi : Loi du 4 août 1996, Code du bien-être au travail, Livre Ier, Titre 2 – Politique du bien-être et système dynamique de gestion des risques, Plan Global de Prévention, Plan Annuel d’Action, CPPT, SIPPT/SEPPT, Livre III – Lieux de travail, Livre III, Titre 3 – Prévention incendie, Livre III, Titre 6 – Signalisation de sécurité et de santé, Livre IV – Équipements de travail, Livre VI – Agents chimiques, Livre VIII – Ergonomie et TMS, Livre IX – Protections collectives et EPI. Ne cite pas d’articles. Si une référence exacte est incertaine, écris dans la langue cible : ${languageConfig.referenceToCheck}
6. Section 3 : les noms officiels français des références réglementaires belges peuvent rester en français, mais les explications autour doivent être en ${resolvedLanguageLabel}.
7. Section 8 must be titled exactly "${languageConfig.sections[7]}" and must explain the formula, scales, thresholds and interpretation. Use this content in the target language: ${scoringMethodInstruction}
8. Section 9 must always contain 6 to 8 concrete hazards in a Markdown table with exactly these columns: ${languageConfig.hazardTableColumns}. Never write only "Dangers identifiés", "Information à compléter ou à valider sur le terrain" or an equivalent. For each hazard, state a plausible scenario, evidence to check, what the prevention advisor must do, where the proof must be documented and whether the point blocks validation.
9. Section 10 must be titled exactly "${languageConfig.sections[9]}". It must contain the main detailed risk assessment table and nothing may replace it with a placeholder. Use exactly these columns in the target language: ${languageConfig.riskTableColumns}.
10. Section 10 must always contain 8 complete risk rows. Each row must justify severity, probability and exposure, distinguish observed or declared elements from elements to be confirmed, include an initial score, initial level, additional measures, STOP level, provisional residual score, residual level, responsible person, deadline and control / expected evidence. If data are insufficient, produce a useful provisional assessment in the relevant cells and use this wording only as supporting text, never as the whole section: ${languageConfig.provisionalScoreText}
11. Section 11 must be titled exactly "${languageConfig.sections[10]}" and must not contain the full main table from section 10. It must contain a synthetic residual risk analysis: risks still significant after measures, high or critical residual risks, conditions required to confirm residual scores, evidence to collect and blocking points before validation. If you use a table, use this compact header only: ${languageConfig.residualTableColumns}.
12. Avant de finaliser le tableau, vérifie chaque score et niveau : ${riskScale}. Le score doit rester cohérent avec Gravité x Probabilité x Exposition.
13. Si des informations existent, produire une analyse provisoire exploitable. Si des informations manquent, préciser exactement ce qui manque, pourquoi c’est important, quelle preuve est attendue, qui doit vérifier, comment vérifier, où documenter la preuve et si le point bloque la validation. Le fallback simple ${languageConfig.missingInfo} ne peut jamais être utilisé seul.
14. Blocs d’aide au conseiller obligatoires lorsque l’analyse repose sur une hypothèse, une preuve manquante, une cotation provisoire, un risque résiduel non confirmé ou un point bloquant. N’utilise jamais un bloc court limité à une phrase comme "à vérifier sur le terrain" ou équivalent. Titre du bloc : "${languageConfig.advisorHelpBlockTitle}". ${businessBlockInstruction} ${advisorHelpBlockInstruction} Termine chaque bloc par "${languageConfig.advisorHelpBlockClose}". Les blocs doivent être simples, opérationnels et aider le conseiller à compléter, vérifier, documenter et défendre l’analyse.
15. Hiérarchie STOP obligatoire : pour chaque mesure complémentaire importante, utiliser un niveau parmi : ${languageConfig.stopLevels}. Ne jamais proposer uniquement une protection individuelle si une mesure de suppression, substitution, technique collective ou organisationnelle est plus appropriée.
16. Section 12 must always contain at least 4 structured priorities. Each priority must contain ${languageConfig.priorityLabels}.
17. Section 13 must always contain 6 to 8 action plan items, with both action types represented: ${actionTypeInstruction}. Use this Markdown table header in the target language: ${languageConfig.actionTableColumns}. Do not place this action plan table in section 14.
18. Section 14 must explain only which urgent actions feed the Annual Action Plan, which structural actions feed the Global Prevention Plan, how CPPT follow-up is ensured and how validation actions are integrated. Do not include the complete action plan table in this section.
19. Section 15 must contain only documents to create or update, such as SDS, procedures, registers, instructions, plans, hot-work permits, reports and checklists. Section 16 must contain only people or services to consult or involve, including workers, line management, prevention advisor, employer, CPPT when present, external service and occupational physician when relevant. Section 17 must contain only annexes, such as photos, inspection reports, plans, SDS, CPPT minutes, registers and proof. Never shift these contents into the wrong section.
20. Documents, preuves et photos à intégrer dans les sections 15, 17, 18, 19 et dans les preuves des tableaux de risques : ${evidenceInstruction} ${photoInstruction}
21. Section 18 must be titled exactly "${languageConfig.sections[17]}". It must contain a simple Markdown table, not too wide, with this exact header in the target language: ${practicalGuideInstruction}. The table must contain 8 to 12 operational rows adapted to the analysis type. ${practicalGuideRowsInstruction} Each row must explain the point to complete, what to do, how to do it, document to attach, photo to add, where to place it and priority.
22. Section 19 must contain explicit subparts in the target language: document status; what is already usable; what must be checked; blocking points; essential documents and photos; minimum actions before validation; opinions or specialist advice required; actors who must validate. It must clearly identify usable points, points to verify, blocking points, indispensable documents, indispensable photos, required opinions and minimum conditions before validation. It must include a clear opinion on whether the document is validable as it stands. The document status must be exactly one of: ${languageConfig.documentStatuses}.
23. Section 19 must clearly say the assessment is not final if any of these are missing or unconfirmed: site visit, documentary evidence, worker consultation, CPPT consultation when a CPPT exists, SDS, inspection/control reports, score justifications, proof of existing measures, external service opinion or occupational physician opinion when relevant.
24. Section 20 must contain a Markdown table with exactly these columns: ${languageConfig.completenessTableColumns}. Evaluate every mandatory element, using only these status labels: ${languageConfig.completenessStatuses}. Mandatory elements to evaluate: ${completenessElements}.
25. Section 21 conclusion must be a written conclusion, not a table or list transferred from another section. It must answer clearly: document usable as a draft; not finalisable without site visit and evidence; can feed the GPP/PGP and AAP/PAA; can be presented to the health and safety committee/CPPT as a discussion basis; must not be presented as full proof of compliance while evidence is not attached. Never write that it is finalized or compliant if it is not supported by evidence. Do not include annexes, actors, the completeness table, the main table or the action plan in the conclusion.
26. Relis les preuves attendues : elles doivent être vérifiables, professionnelles et cohérentes avec le risque et la mesure. Privilégie : rapport de contrôle, registre de formation, liste de présence, photos avant/après, inventaire mis à jour, FDS centralisées, rapport de visite terrain, PV ou avis du CPPT, registre accidents/incidents, check-list signée. Évite : suivi, constat, conformité normale, document disponible, rapport général.
27. Conformité belge et prudence juridique : mentionner les références belges pertinentes sans inventer d’articles ; ne jamais affirmer une conformité si les preuves ne sont pas présentes ; distinguer obligation légale, bonne pratique et point à vérifier.
28. Spécialisation obligatoire selon le type d’analyse demandé : ${specializationInstruction}
29. Section ${languageConfig.sections.length} doit contenir exactement cette mention finale traduite, une seule fois :
${languageConfig.finalMention}
30. Before answering, perform a strict mental verification: all ${languageConfig.sections.length} sections are present and in the requested order; headings match the target language exactly; section 10 contains the complete main table; section 11 is only a synthetic residual analysis; documents, actors and annexes are correctly separated; the practical guide, validability and completeness are separate sections; the conclusion is a real written conclusion; no section is empty; no section contains content belonging to another section; scoring method is present; detailed hazard identification is filled; provisional residual scores are present; STOP hierarchy is present; action plan contains risk-control actions and validation actions; score justifications are present; the document status is explicit; there is no unjustified compliance conclusion; no heading from another language remains.
31. Rappel RGPD dans la langue cible : ${languageConfig.gdprReminder}
32. Garde une réponse concise pour éviter les timeouts.`;
}

function buildCompletenessElements(language) {
  const elements = {
    fr: [
      'Contexte et objectif',
      'Périmètre',
      'Activités et tâches',
      'Postes concernés',
      'Travailleurs exposés',
      'Travailleurs vulnérables',
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
      'Lien PGP',
      'Lien PAA',
      'Annexes et photos',
    ],
    nl: [
      'Context en doelstelling',
      'Afbakening',
      'Activiteiten en taken',
      'Betrokken functies',
      'Blootgestelde werknemers',
      'Kwetsbare werknemers',
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
      'Link GPP',
      'Link JAP',
      'Bijlagen en foto’s',
    ],
    en: [
      'Context and objective',
      'Scope',
      'Activities and tasks',
      'Jobs concerned',
      'Exposed workers',
      'Vulnerable workers',
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
      'GPP link',
      'AAP link',
      'Appendices and photos',
    ],
    de: [
      'Kontext und Zielsetzung',
      'Umfang',
      'Tätigkeiten und Aufgaben',
      'Betroffene Arbeitsplätze',
      'Exponierte Beschäftigte',
      'Schutzbedürftige Beschäftigte',
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
      'Bezug GPP',
      'Bezug JAP',
      'Anhänge und Fotos',
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
