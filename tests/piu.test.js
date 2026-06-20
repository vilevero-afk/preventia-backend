import assert from 'node:assert/strict';
import http from 'node:http';

process.env.PREVENTIA_BACKEND_NO_START = '1';
process.env.NODE_ENV = 'test';
process.env.ALLOW_UNLICENSED_GENERATION = 'true';
delete process.env.OPENAI_API_KEY;

const { app } = await import('../server.js');
const { renderInternalEmergencyPlanMarkdown } = await import('../src/renderers/internalEmergencyPlanRenderer.js');

const sampleFormData = {
  companyName: 'PreventIA Test',
  siteName: 'Site Bruxelles',
  buildingName: 'Bâtiment A',
  address: '1 rue du Test',
  postalCode: '1000',
  city: 'Bruxelles',
  country: 'Belgique',
  numberOfWorkers: 42,
  emergencyManager: 'Alice Exemple',
  emergencyScenarios: ['Incendie', 'Fuite de gaz'],
};

const markdown = renderInternalEmergencyPlanMarkdown(sampleFormData, 'fr');
assertPiu(markdown);
assert.match(markdown, /PreventIA Test/);
assert.match(markdown, /42/);
assert.doesNotMatch(markdown, /Traduction à prévoir/);

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
  assert.match(document, /aide à la rédaction/);
  assert.match(document, /Projet à compléter, vérifier sur site et valider/);

  for (let section = 1; section <= 29; section += 1) {
    assert.match(document, new RegExp(`^## ${section}\\. `, 'm'));
  }

  for (const label of [
    'À vérifier sur site',
    'Preuve à obtenir',
    'Plan/photo à annexer',
    'Validation requise',
    'Point bloquant',
  ]) {
    assert.match(document, new RegExp(label));
  }

  for (let sheet = 0; sheet <= 22; sheet += 1) {
    assert.match(document, new RegExp(`^### Fiche ${String(sheet).padStart(2, '0')}\\. `, 'm'));
  }

  const artificialLongParagraphs = document.split('\n').filter((line) =>
    line.length > 180 &&
    !line.startsWith('|') &&
    !line.startsWith('>'),
  );
  assert.deepEqual(artificialLongParagraphs, []);
}

function listen(appInstance) {
  return new Promise((resolve) => {
    const instance = appInstance.listen(0, '127.0.0.1', () => resolve(instance));
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
