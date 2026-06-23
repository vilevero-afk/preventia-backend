import { formatFieldValue, getField } from './specializedRiskFields.js';

const SCENARIO_LABELS = [
  'Site', 'Site / bâtiment', 'Stade de l’analyse', 'Stade de l analyse',
  'Armoires basse tension', 'Cabine haute tension', 'Transformateur', 'TGBT',
  'Tableaux divisionnaires', 'PV RGIE', 'Contrôle périodique', 'Liste BA4/BA5',
  'Procédure de consignation', 'Rapport de thermographie', 'Remarques de contrôle ouvertes',
  'Équipements raccordés', 'Personnes exposées', 'Zones concernées', 'Risques identifiés',
  'Mesures existantes', 'Points à vérifier', 'Mesures à prévoir', 'Priorités',
  'Responsables', 'Délais', 'Preuves à obtenir', 'Liens PAA / PGP', 'Liens DIU', 'Liens PIU',
  'Propriétaire', 'Gestionnaire', 'SECT', 'Entreprise de maintenance', 'Adresse de l’ascenseur',
  'Localisation de l’ascenseur', 'Marque', 'Numéro de fabrication', 'Année de construction',
  'Mise en service', 'Type d’ascenseur', 'Charge nominale', 'Capacité', 'Vitesse',
  'Nombre d’arrêts', 'Environnement', 'Intensité d’utilisation', 'Utilisateurs vulnérables',
  'Rapport SECT', 'Dernier contrôle périodique', 'Attestation de régularisation',
  'Remarques SECT ouvertes', 'Travaux de modernisation', 'Travaux ouverts',
];

export function extractScenarioValue(text, labels) {
  const lines = scenarioLines(text);
  const wanted = labels.map(normalizeLabel);

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripListPrefix(lines[index]);
    if (!line) continue;

    if (wanted.some((label) => label.startsWith('site')) && /^site administratif\b/i.test(line)) {
      return cleanExtractedValue(line);
    }

    const separator = line.indexOf(':');
    const candidateLabel = normalizeLabel(separator >= 0 ? line.slice(0, separator) : line);
    const matched = wanted.some((label) => candidateLabel === label);
    if (!matched) continue;

    const inlineValue = separator >= 0 ? cleanExtractedValue(line.slice(separator + 1)) : '';
    if (inlineValue) return inlineValue;

    const collected = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextLine = stripListPrefix(lines[next]);
      if (!nextLine) {
        if (collected.length) break;
        continue;
      }
      if (isScenarioLabel(nextLine)) break;
      collected.push(cleanExtractedValue(nextLine));
    }
    if (collected.length) return collected.join('; ');
  }

  return '';
}

export function getScenarioText(formData) {
  const data = formData && typeof formData === 'object' ? formData : {};
  for (const key of ['additionalContext', 'scenario', 'comments', 'notes', 'context']) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }
  return '';
}

export function setFromScenario(data, field, aliases, scenarioText, labels) {
  const existing = getField(data, aliases, '');
  data[field] = existing || extractScenarioValue(scenarioText, labels) || data[field];
}

export function splitScenarioList(value) {
  if (Array.isArray(value)) return value.map((item) => formatFieldValue(item, '')).filter(Boolean);
  return String(value || '')
    .split(/\s*(?:;|\n|•|\s+-\s+)\s*/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

export function stripRawScenarioFields(formData) {
  const sanitized = { ...(formData || {}) };
  for (const key of ['additionalContext', 'scenario', 'comments', 'notes', 'context']) delete sanitized[key];
  return sanitized;
}

function scenarioLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim());
}

function isScenarioLabel(line) {
  const separator = line.indexOf(':');
  const candidate = normalizeLabel(separator >= 0 ? line.slice(0, separator) : line);
  return SCENARIO_LABELS.some((label) => normalizeLabel(label) === candidate) ||
    (/^[A-ZÀ-ÖØ-Þ0-9 /'-]{4,}$/.test(line) && !/[.!?]$/.test(line));
}

function stripListPrefix(line) {
  return String(line || '').replace(/^\s*(?:#{1,6}\s*|[-*•]+\s*)/, '').trim();
}

function cleanExtractedValue(value) {
  return String(value || '').replace(/^[-–—:;\s]+/, '').replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value) {
  return stripListPrefix(value)
    .replace(/\s*:.*$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
