import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app } = await import('../server.js');

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  await testFirePgpActions();
  await testElectricalPgpActions();
  await testElevatorPgpActions();
  await testChemicalPgpActions();
  await testStrictExclusions();
  await testDeduplication();
  await testLengthLimits();
  await testPreventionDossierFeedsPaaPgpRenderer();
  await testMissingMarkdown();
} finally {
  await close(server);
}

console.info('Prevention dossier extraction tests passed.');

async function testFirePgpActions() {
  const response = await extract(`Analyse incendie.
- Issues encombrées et voies d’évacuation à libérer.
- Extincteurs masqués par du stockage.
- Portes coupe-feu calées.
- Exercice évacuation à organiser cette année.
`);

  assertPgpContains(response, 'dégager', 'voies');
  assertPgpContains(response, 'extincteurs', 'accessibles');
  assertPgpContains(response, 'portes coupe-feu');
  assertPgpContains(response, 'exercice');
  assertOnlyConcretePgp(response);
}

async function testElectricalPgpActions() {
  const response = await extract(`Analyse électrique BT/HT.
- PV RGIE absent.
- BA4/BA5 à confirmer.
- Schémas électriques obsolètes.
- Armoires encombrées devant les tableaux.
- Coupure électrique à formaliser.
`, { documentType: 'Analyse de risques installations électriques BT/HT' });

  assertPgpContains(response, 'PV RGIE');
  assertPgpContains(response, 'BA4/BA5');
  assertPgpContains(response, 'schémas électriques');
  assertPgpContains(response, 'armoires');
  assertPgpContains(response, 'coupure électrique');
  assertOnlyConcretePgp(response);
}

async function testElevatorPgpActions() {
  const response = await extract(`Analyse ascenseur.
- Rapport SECT à obtenir.
- Maintenance ascenseur à vérifier.
- Appel urgence à tester.
- Personne bloquée en cabine : procédure à organiser.
- Contrôle périodique ascenseur à planifier.
`, { documentType: 'Analyse de risques ascenseur' });

  assertPgpContains(response, 'rapport SECT');
  assertPgpContains(response, 'contrôle périodique');
  assertPgpContains(response, 'appel');
  assertPgpContains(response, 'personne bloquée');
  assertOnlyConcretePgp(response);
}

async function testChemicalPgpActions() {
  const response = await extract(`Analyse produits dangereux.
- FDS à centraliser.
- Étiquetage CLP à vérifier.
- Incompatibilités entre produits.
- Rétention à vérifier.
- Ventilation local produits insuffisante.
`, { documentType: 'Analyse de risques produits dangereux' });

  assertPgpContains(response, 'FDS');
  assertPgpContains(response, 'CLP');
  assertPgpContains(response, 'incompatibles');
  assertPgpContains(response, 'rétention');
  assertPgpContains(response, 'ventilation');
  assertOnlyConcretePgp(response);
}

async function testStrictExclusions() {
  const response = await extract(`Page 1 / 1
additionalInformation: texte libre
documentType: Analyse de risques
Livre III
Méthode de cotation
Conclusion
| Famille de danger | Danger précis | Scénario plausible | Référence ou domaine réglementaire | PAA | PGP | CPPT |
`);

  const pgpText = JSON.stringify(response.pgpCandidates);
  assert.doesNotMatch(pgpText, /Page 1 \/ 1|additionalInformation|documentType|Livre III|Méthode de cotation|Conclusion|Famille de danger/i);
  assert.equal(response.pgpCandidates.length, 0);
  assert.ok(response.ignoredItems.length > 0);
}

async function testDeduplication() {
  const response = await extract('- Issues encombrées et voies d’évacuation à libérer.', {
    existingCandidateFingerprints: ['pgp|degager-voies-evacuation|obstruction-voies-evacuation'],
  });

  assert.ok(!response.pgpCandidates.some((item) => item.fingerprint === 'pgp|degager-voies-evacuation|obstruction-voies-evacuation'));
  assert.ok(response.ignoredItems.some((item) => item.reason === 'Déjà présent dans le dossier prévention'));
}

async function testLengthLimits() {
  const response = await extract(`Analyse.
- Issues encombrées avec un texte très long qui décrit un contexte complet, des observations multiples, des hypothèses et des commentaires qui ne doivent pas être repris tels quels dans le titre ou la description de l’action PGA.
- PV RGIE absent avec plusieurs détails administratifs à condenser.
`);

  for (const item of response.pgpCandidates) {
    assert.ok(item.title.length <= 90, item.title);
    assert.ok(item.description.length <= 240, item.description);
  }
}

async function testPreventionDossierFeedsPaaPgpRenderer() {
  const extraction = await extract(`Analyse incendie.
Page 1 / 1
additionalInformation: bloc brut à ignorer
documentType: Analyse de risques incendie
Conclusion
Méthode de cotation
Tableau principal d’analyse
- Issues encombrées et voies d’évacuation à libérer.
`);

  assertPgpContains(extraction, 'dégager', 'voies');

  const response = await postJson(baseUrl, '/api/generate-document', {
    documentType: 'Plan annuel d’action',
    language: 'fr',
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      siteLieuTravail: 'Site administratif de Verviers',
      context: 'Contrat de caractérisation prevention-dossier vers PGA/PAA/PGP.',
      pgpCandidates: extraction.pgpCandidates,
      evidenceItems: extraction.evidenceItems,
      pointsToVerify: extraction.validationPoints,
    },
  });

  assert.equal(response.success, true);
  assert.equal(response.source, 'deterministic_backend');
  assert.match(response.document, /Dégager les voies d’évacuation/);
  assert.doesNotMatch(response.document, /Page 1 \/ 1/);
  assert.doesNotMatch(response.document, /additionalInformation/);
  assert.doesNotMatch(response.document, /documentType/);
  assert.doesNotMatch(response.document, /Conclusion/);
  assert.doesNotMatch(response.document, /Méthode de cotation/);
  assert.doesNotMatch(response.document, /Tableau principal d’analyse/);
}

async function testMissingMarkdown() {
  const response = await postJson(baseUrl, '/api/prevention-dossier/extract', {
    documentType: 'Analyse générale',
    formData: {},
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.error, 'markdown_required');
}

function assertPgpContains(response, ...needles) {
  const item = response.pgpCandidates.find((candidate) => {
    const text = JSON.stringify(candidate).toLowerCase();
    return needles.every((needle) => text.includes(needle.toLowerCase()));
  });
  assert.ok(item, `PGP attendu: ${needles.join(' / ')}`);
  assert.equal(item.destination, 'pgp');
  assert.equal(item.shouldReview, true);
  assert.equal(item.status, 'à valider');
}

function assertOnlyConcretePgp(response) {
  assert.ok(Array.isArray(response.pgpCandidates));
  for (const item of response.pgpCandidates) {
    assert.equal(item.destination, 'pgp');
    assert.equal(item.shouldReview, true);
    assert.match(item.title, /^(Vérifier|Contrôler|Planifier|Formaliser|Mettre à jour|Obtenir|Centraliser|Dégager|Rendre|Supprimer|Sensibiliser|Former|Informer|Organiser|Corriger|Lever|Installer|Remplacer|Sécuriser|Signaler|Valider|Consigner|Identifier|Afficher|Entretenir|Tester|Documenter|Séparer|Fournir|Réduire|Adapter|Assurer|Établir|Transmettre|Limiter|Interdire)/);
  }
}

function extract(markdown, overrides = {}) {
  return postJson(baseUrl, '/api/prevention-dossier/extract', {
    companyKey: 'spge',
    documentType: 'Analyse de risques incendie et évacuation',
    sourceDocumentId: 'doc-123',
    sourceReference: 'AR-2026-0063',
    markdown,
    formData: {
      companyName: 'SPGE',
      siteName: 'Site administratif de Verviers',
      riskProfile: 'modéré',
    },
    language: 'fr',
    ...overrides,
  });
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
          const parsed = JSON.parse(responseBody);
          resolve({ statusCode: response.statusCode, ...parsed });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}
