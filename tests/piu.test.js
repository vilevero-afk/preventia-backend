import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
process.env.OPENAI_API_KEY = '';

const { app } = await import('../server.js');
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
  technicalServiceContact: 'Service Technique',
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
  'Responsable Bâtiment', 'Service Technique', 'Alice Exemple', 'Parking nord',
  'Assistance par deux équipiers', 'Accueil principal', 'Centrale au poste d’accueil',
  'Local chaufferie', 'TGBT local technique', 'Cave technique', 'Commande accueil',
  'Plan d’évacuation',
]) {
  assert.match(markdown, new RegExp(mapped), mapped);
}
assert.doesNotMatch(markdown, /Traduction à prévoir/);

const blankMarkdown = renderInternalEmergencyPlanMarkdown({}, 'fr');
assertPiu(blankMarkdown);
assert.doesNotMatch(blankMarkdown, /SPGE/);
assert.doesNotMatch(blankMarkdown, /Site administratif de Verviers/);
assert.ok((blankMarkdown.match(/\[à compléter\]/g) || []).length > 100);

const translatedFallback = renderInternalEmergencyPlanMarkdown(sampleFormData, 'nl');
assert.match(translatedFallback, /Traduction à prévoir — version française générée\./);
assert.match(renderInternalEmergencyPlanMarkdown(sampleFormData, 'es'), /Traduction à prévoir/);

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  for (const documentType of [
    'Plan Interne d’Urgence',
    'PIU',
    'Plan d’urgence interne',
    'internal_emergency_plan',
  ]) {
    const response = await postJson(baseUrl, '/api/generate-document', {
      documentType,
      formData: sampleFormData,
      language: 'fr',
    });

    assert.equal(response.success, true, documentType);
    assert.equal(response.source, 'deterministic_backend');
    assert.equal(response.documentType, 'Plan Interne d’Urgence');
    assertPiu(response.document);
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

  for (let sheet = 0; sheet <= 22; sheet += 1) {
    assert.match(document, new RegExp(`^### FICHE ${String(sheet).padStart(2, '0')} `, 'm'));
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
  const match = document.match(new RegExp(`^## ${number}\\. [^\\n]+\\n\\n([\\s\\S]*?)(?=^## ${next}\\. |$)`, 'm'));
  assert.ok(match?.[1]?.trim(), `La section ${number} ne doit pas être vide.`);
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
