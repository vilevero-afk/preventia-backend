const DEFAULT_MISSING = '[à compléter]';

/** Return the first populated form value matching one of the supplied aliases. */
export function getField(formData, aliases, fallback = DEFAULT_MISSING) {
  const data = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {};

  for (const alias of aliases) {
    const formatted = formatFieldValue(data[alias], '');
    if (formatted) return formatted;
  }

  return fallback;
}

export function formatFieldValue(input, fallback = DEFAULT_MISSING) {
  if (input === null || input === undefined || input === '') return fallback;
  if (typeof input === 'boolean') return input ? 'oui' : 'non';
  if (Array.isArray(input)) {
    const values = input.map((item) => formatFieldValue(item, '')).filter(Boolean);
    return values.length ? values.join(', ') : fallback;
  }
  if (typeof input === 'object') {
    const values = Object.entries(input).map(([key, item]) => `${key} : ${formatFieldValue(item)}`);
    return values.length ? values.join('; ') : fallback;
  }
  return String(input).replace(/\r?\n/g, ' ').trim() || fallback;
}
