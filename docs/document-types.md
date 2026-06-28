# Document types backend PreventIA

Ce fichier documente les libellés backend canoniques, les alias acceptés et le flux concerné. Flutter doit envoyer de préférence le libellé canonique, sauf compatibilité existante documentée ci-dessous.

| Libellé canonique backend | Alias acceptés | Usage Flutter attendu | Renderer ou flux concerné |
| --- | --- | --- | --- |
| Fiche de poste | Analyse de risques par poste de travail | Envoyer `Fiche de poste` pour une fiche/poste. L'ancien libellé Flutter est accepté comme alias. | `renderJobDescriptionSheetMarkdown` dans `server.js` |
| Analyse de risques — Ascenseur | Analyse de risques – Ascenseur, Analyse de risques - Ascenseur, Analyse de risques ascenseur, Analyse ascenseur, Ascenseur, risk_assessment_elevator, elevator_risk_assessment | Envoyer `Analyse de risques — Ascenseur`. Les variantes de tirets sont acceptées. | `src/renderers/elevatorRiskAssessmentRenderer.js` |
| Analyse de risques — Installations électriques BT/HT | Analyse de risques – Installations électriques BT/HT, Analyse de risques - Installations électriques BT/HT, Analyse de risques BT/HT, Analyse de risques électrique, Analyse de risques électricité, Analyse de risques basse tension haute tension, risk_assessment_electrical_bt_ht | Envoyer `Analyse de risques — Installations électriques BT/HT`. Les variantes de tirets sont acceptées. | `src/renderers/electricalBtHtRiskAssessmentRenderer.js` |
| Analyse de risques incendie et évacuation | Aucun alias spécifique documenté | Envoyer le libellé canonique pour l'analyse incendie/évacuation. | Flux analyse de risques générique dans `server.js` |
| Plan Interne d’Urgence | PIU, Plan interne d’urgence, Plan d’urgence interne, internal_emergency_plan | Envoyer `Plan Interne d’Urgence` pour générer le PIU. | `src/renderers/internalEmergencyPlanRenderer.js` |
| Plan annuel d’action | Aucun alias spécifique documenté | Envoyer `Plan annuel d’action` pour générer un document PGA/PAA/PGP court terme. | `renderPaaPgpMarkdown` dans `server.js` |
| Plan global de prévention sur 5 ans | Aucun alias spécifique documenté | Envoyer `Plan global de prévention sur 5 ans` pour générer un document PGA/PAA/PGP pluriannuel. | `renderPaaPgpMarkdown` dans `server.js` |
| Dossier prévention société | N/A | Utiliser `POST /api/prevention-dossier/extract` avec le type de document source. | `src/services/preventionDossierExtractionService.js` |

Notes:

- La normalisation backend ignore la casse, les accents et les variantes de tirets `—` / `–` pour les types documentés.
- Le backend conserve le libellé canonique dans la réponse de génération quand un alias est utilisé.
- L'extraction dossier prévention propose des candidats PIU, PGP, preuves et points de validation. La validation reste côté Flutter/conseiller.
