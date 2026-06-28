import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app, canUseDocumentType, isSimplePreventionDocument } = await import('../server.js');
const { CHAPTER_TITLES, renderInternalEmergencyPlanMarkdown } = await import('../src/renderers/internalEmergencyPlanRenderer.js');

const sampleFormData = {
  companyName: 'PreventIA Test',
  siteName: 'Site Bruxelles',
  buildingName: 'Bâtiment A',
  address: '1 rue du Test',
  postalCode: '1000',
  city: 'Bruxelles',
  country: 'Belgique',
  preventionAdvisor: 'Conseiller Test',
  siteManager: 'Responsable Bâtiment',
  siteContact: 'Accueil Principal',
  technicalServiceContact: 'Service Technique',
  generalPhone: '+32 87 00 00 00',
  generalEmail: 'contact@example.test',
  activityDescription: 'Activités administratives et accueil du public',
  numberOfWorkers: '42 travailleurs',
  visitorsPresence: 'Visiteurs présents en journée',
  externalCompaniesPresence: 'Entreprises extérieures ponctuelles',
  workingHours: '08:00-17:00',
  emergencyManager: 'Alice Exemple',
  assemblyPoint: 'Parking nord',
  pmrProcedure: 'Assistance par deux équipiers désignés',
  firefighterFileLocation: 'Accueil principal',
  fireAlarmSystem: 'Centrale au poste d’accueil',
  gasShutoff: 'Local chaufferie',
  electricityShutoff: 'TGBT local technique',
  waterShutoff: 'Cave technique',
  ventilationShutoff: 'Commande accueil',
  emergencyScenarios: ['Incendie', 'Fuite de gaz'],
  availablePlans: ['Plan d’évacuation', 'Plan des coupures'],
};

const markdown = renderInternalEmergencyPlanMarkdown(sampleFormData, 'fr');
  assertPiu(markdown);
  for (const mapped of [
    'PreventIA Test', 'Site Bruxelles', '1 rue du Test', 'Conseiller Test',
  'Responsable Bâtiment', 'Accueil Principal', 'Service Technique', '+32 87 00 00 00',
  'contact@example.test', 'Activités administratives et accueil du public', '42 travailleurs',
  'Visiteurs présents en journée', 'Entreprises extérieures ponctuelles', '08:00-17:00',
  'Alice Exemple', 'Parking nord',
  'Assistance par deux équipiers', 'Accueil principal', 'Centrale au poste d’accueil',
  'Local chaufferie', 'TGBT local technique', 'Cave technique', 'Commande accueil',
  'Plan d’évacuation',
]) {
  assert.ok(markdown.includes(mapped), mapped);
}
  assert.doesNotMatch(markdown, /Traduction à prévoir/);
assert.doesNotMatch(markdown, /Page 1 \/ 1/);

const blankMarkdown = renderInternalEmergencyPlanMarkdown({}, 'fr');
assertPiu(blankMarkdown);
assert.doesNotMatch(blankMarkdown, /SPGE/);
assert.doesNotMatch(blankMarkdown, /Site administratif de Verviers/);
assert.ok((blankMarkdown.match(/\[à compléter\]/g) || []).length > 100);

const translatedFallback = renderInternalEmergencyPlanMarkdown(sampleFormData, 'nl');
assert.match(translatedFallback, /Traduction à prévoir — version française générée\./);
assert.match(renderInternalEmergencyPlanMarkdown(sampleFormData, 'es'), /Traduction à prévoir/);

const classifiedPiuMarkdown = renderInternalEmergencyPlanMarkdown({
  ...sampleFormData,
  importedRiskAnalyses: [
    {
      reference: 'AR-2026-0054',
      documentType: 'Analyse de risques incendie et évacuation',
      title: 'Incendie et évacuation',
      markdown: [
        '- évacuation du bâtiment',
        '- alerte interne',
        '- point de rassemblement',
        '- consignes visiteurs/sous-traitants',
      ].join('\n'),
      riskProfile: 'modéré',
    },
    {
      reference: 'AR-2026-0055',
      documentType: 'Analyse de risques électricité',
      title: 'Installations électriques BT/HT',
      markdown: [
        '- incendie d’origine électrique',
        '- coupure générale électrique pour secours',
        '- PV RGIE à obtenir',
        '- planifier thermographie',
        '- formation BA4/BA5',
      ].join('\n'),
      riskProfile: 'modéré',
    },
    {
      reference: 'AR-2026-0056',
      documentType: 'Analyse de risques ergonomie écran',
      title: 'Ergonomie écran',
      markdown: [
        '- réglage des sièges',
        '- pauses écran',
        '- éclairage du poste',
      ].join('\n'),
      riskProfile: 'faible',
    },
  ],
}, 'fr');

assert.match(classifiedPiuMarkdown, /Analyses de risques utilisées pour le PIU/);
assert.match(classifiedPiuMarkdown, /Pertinente pour le PIU/);
assert.match(classifiedPiuMarkdown, /Non pertinente pour le PIU/);
assert.match(classifiedPiuMarkdown, /incendie d’origine électrique/);
assert.match(classifiedPiuMarkdown, /coupure générale électrique/);
assert.match(classifiedPiuMarkdown, /Éléments écartés du PIU et réorientés/);

const proceduresSection = extractSection(classifiedPiuMarkdown, 16);
assert.doesNotMatch(proceduresSection, /planifier thermographie/i);
assert.doesNotMatch(proceduresSection, /obtenir PV RGIE|PV RGIE à obtenir/i);
assert.doesNotMatch(proceduresSection, /formation BA4\/BA5/i);

const reorientedSection = extractSection(classifiedPiuMarkdown, 25);
assert.match(reorientedSection, /PV RGIE à obtenir/);
assert.match(reorientedSection, /Thermographie à planifier/);
assert.match(reorientedSection, /Formation BA4\/BA5/);

const dirtyImportedItemsMarkdown = renderInternalEmergencyPlanMarkdown({
  ...sampleFormData,
  importedPiuItems: [
    {
      sourceDocumentReference: 'AR-2026-RAW',
      documentType: 'Analyse de risques incendie',
      additionalInformation: [
        'Type | Analyse de risques incendie',
        'Faits fournis : bloc brut importé',
        'Services ou activités concernés : accueil',
        'Photo consignes extincteurs',
        'Page 1 / 1',
        '\\\\\\\\',
      ].join('\n'),
      title: 'Issue de secours encombrée',
      validatedByUser: true,
    },
    {
      sourceDocumentReference: 'AR-2026-RAW',
      title: 'Accès pompier encombré',
      additionalInformation: 'documentType : Analyse de risques\nFaits fournis : entrée livraison',
      validatedByUser: true,
    },
    {
      sourceDocumentReference: 'AR-2026-RAW',
      title: 'Point de rassemblement',
      additionalInformation: 'availableEvidence : Photo consignes\nPage 1 / 1',
      validatedByUser: true,
    },
  ],
}, 'fr');

assert.match(dirtyImportedItemsMarkdown, /Issue de secours encombrée/);
assert.match(dirtyImportedItemsMarkdown, /Accès pompier/);
assert.match(dirtyImportedItemsMarkdown, /Point de rassemblement/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /additionalInformation/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /documentType/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /Faits fournis/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /Type \| Analyse/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /Photo consignes/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /Page 1 \/ 1/);
assert.doesNotMatch(dirtyImportedItemsMarkdown, /\\\\/);
assert.equal((dirtyImportedItemsMarkdown.match(/Élément PIU importé/g) || []).length, 0);

const dirtyAnalysisSection = extractBetween(
  dirtyImportedItemsMarkdown,
  '## Analyses de risques utilisées pour le PIU',
  '## Table des matières opérationnelle',
);
assert.equal((dirtyAnalysisSection.match(/AR-2026-RAW/g) || []).length, 1);

const spgeAdministrativePiu = renderInternalEmergencyPlanMarkdown({
  ...sampleFormData,
  companyName: 'SPGE',
  riskProfile: 'modéré',
  activityDescription: 'Bureaux administratifs, accueil du public, réunions, locaux techniques et archives',
  importedPiuItems: [
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Évacuation générale', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Moyens d’extinction accessibles', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Issues de secours dégagées', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Point de rassemblement', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'FDS à annexer', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Photo consignes', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Chlore piscine', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Séisme', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Seveso', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Fuite de gaz', validatedByUser: true },
    { sourceDocumentReference: 'AR-SPGE-PIU', title: 'Référence AR-SPGE Page 1 / 1', validatedByUser: true },
  ],
}, 'fr');

assert.match(spgeAdministrativePiu, /FICHE 00/);
assert.match(spgeAdministrativePiu, /FICHE 01/);
assert.match(spgeAdministrativePiu, /FICHE 11/);
assert.match(spgeAdministrativePiu, /Évacuation générale/);
assert.match(spgeAdministrativePiu, /Moyens d’extinction accessibles/);
assert.match(spgeAdministrativePiu, /Issues de secours dégagées/);
assert.match(spgeAdministrativePiu, /Point de rassemblement/);
assert.doesNotMatch(spgeAdministrativePiu, /FICHE 02 – Alerte SEVESO/);
assert.doesNotMatch(spgeAdministrativePiu, /FICHE 09 – Séisme/);
assert.doesNotMatch(spgeAdministrativePiu, /FICHE 12 – Fuite de chlore à la piscine/);
assert.doesNotMatch(spgeAdministrativePiu, /FICHE 18 – Prise d’otages/);
assert.doesNotMatch(spgeAdministrativePiu, /Page 1 \/ 1/);

const shelterSection = extractSection(spgeAdministrativePiu, 20);
assert.doesNotMatch(shelterSection, /Évacuation générale/);
assert.doesNotMatch(shelterSection, /Moyens d’extinction accessibles/);
assert.doesNotMatch(shelterSection, /Issues de secours dégagées/);
assert.doesNotMatch(shelterSection, /Point de rassemblement/);
assert.match(shelterSection, /Aucun scénario spécifique de mise à l’abri/);

const fireSection = extractSection(spgeAdministrativePiu, 16);
assert.doesNotMatch(fireSection, /FDS à annexer/);
assert.doesNotMatch(fireSection, /Photo consignes/);
assert.match(extractSection(spgeAdministrativePiu, 18) + extractSection(spgeAdministrativePiu, 25), /FDS à annexer/);
assert.match(extractSection(spgeAdministrativePiu, 18) + extractSection(spgeAdministrativePiu, 25), /Photos ou consignes à annexer/);

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  for (const documentType of [
    'Plan Interne d’Urgence',
    'Plan interne d’urgence',
    'PIU',
    'Plan d’urgence interne',
    'internal_emergency_plan',
  ]) {
    assert.equal(isSimplePreventionDocument(documentType), true, documentType);
    assert.equal(canUseDocumentType(documentType), true, documentType);
    const response = await postJson(baseUrl, '/api/generate-document', {
      documentType,
      formData: sampleFormData,
      language: 'fr',
    });

    assert.equal(response.success, true, documentType);
    assert.equal(response.source, 'deterministic_backend');
    assert.equal(response.documentType, 'Plan Interne d’Urgence');
    assertPiu(response.document);
    assert.match(response.document, /1 rue du Test, 1000 Bruxelles, Belgique/);
    assert.match(response.document, /Conseiller Test/);
    assert.match(response.document, /Responsable Bâtiment/);
    assert.match(response.document, /Service Technique/);
    assert.match(response.document, /Activités administratives et accueil du public/);
    assert.match(response.document, /42 travailleurs/);
    assert.match(response.document, /Visiteurs présents en journée/);
    assert.doesNotMatch(response.document, /Page 1 \/ 1/);
  }
} finally {
  await close(server);
}

console.info('PIU tests passed.');

function assertPiu(document) {
  assert.match(document, /Plan Interne d’Urgence/);
  assert.match(document, /Modèle opérationnel à compléter/);
  assert.match(document, /Table des matières opérationnelle/);

  for (let section = 1; section <= 28; section += 1) {
    assert.ok(document.includes(`## ${section}. ${CHAPTER_TITLES[section - 1]}`));
    assertSectionHasContent(document, section);
  }
  assert.doesNotMatch(document, /^## 29\. /m);

  for (const label of [
    '[à compléter]', '[à vérifier sur site]', '[non applicable à confirmer]',
    '[validation requise]', 'Dossier pour les pompiers', 'Mise à l’abri',
    'Prise d’iode', 'Attestation de réception des consignes', 'Signatures',
  ]) {
    assert.ok(document.includes(label), label);
  }

  for (const sheet of ['00', '01', '11']) {
    assert.match(document, new RegExp(`^### FICHE ${sheet} `, 'm'));
  }

  const artificialLongParagraphs = document.split('\n').filter((line) =>
    line.length > 180 &&
    !line.startsWith('|') &&
    !line.startsWith('>'),
  );
  assert.deepEqual(artificialLongParagraphs, []);
}

function assertSectionHasContent(document, number) {
  const next = number + 1;
  const match = document.match(new RegExp(`^## ${number}\\. [^\\n]+\\n\\n([\\s\\S]*?)(?=^## ${next}\\. |(?![\\s\\S]))`, 'm'));
  assert.ok(match?.[1]?.trim(), `La section ${number} ne doit pas être vide.`);
}

function extractSection(document, number) {
  const next = number + 1;
  const match = document.match(new RegExp(`^## ${number}\\. [^\\n]+\\n\\n([\\s\\S]*?)(?=^## ${next}\\. |(?![\\s\\S]))`, 'm'));
  assert.ok(match?.[1], `La section ${number} doit exister.`);
  return match[1];
}

function extractBetween(document, start, end) {
  const startIndex = document.indexOf(start);
  const endIndex = document.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `${start} doit exister.`);
  assert.ok(endIndex > startIndex, `${end} doit suivre ${start}.`);
  return document.slice(startIndex, endIndex);
}

function listen(appInstance) {
  return new Promise((resolve, reject) => {
    const instance = appInstance.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
}

function close(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}

function postJson(baseUrl, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(pathname, baseUrl);
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}
