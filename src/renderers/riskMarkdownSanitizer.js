export function sanitizeGeneratedRiskMarkdown(markdown) {
  const lines = String(markdown || '')
    .replace(/SCÉNARIO TEST SPGE/gi, '')
    .replace(/SCENARIO TEST SPGE/gi, '')
    .replace(/Référence\s+AR-\d{4}-\d+\s+[-—–]\s+Page\s+\d+\s*\/\s*\d+/gi, '')
    .replace(/^\s*Page\s+\d+\s*\/\s*\d+\s*$/gim, '')
    .replace(/^Document\s*:\s*Analyse de risques.*$/gim, '')
    .split('\n');

  const withoutDuplicateTasks = removeDuplicateTaskBullets(lines);
  const withoutEmptySections = removeEmptySections(withoutDuplicateTasks);

  return withoutEmptySections
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

function removeDuplicateTaskBullets(lines) {
  const seen = new Set();
  let inTasks = false;

  return lines.filter((line) => {
    if (/^##\s+\d+\.\s+/i.test(line)) {
      inTasks = /tâches|taches/i.test(line);
      if (inTasks) seen.clear();
      return true;
    }

    if (!inTasks || !/^\s*-\s+/.test(line)) return true;

    const key = line.replace(/^\s*-\s+/, '').trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeEmptySections(lines) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^##\s+\d+\.\s+/.test(line)) {
      result.push(line);
      continue;
    }

    const sectionLines = [];
    let next = index + 1;
    while (next < lines.length && !/^##\s+\d+\.\s+/.test(lines[next])) {
      sectionLines.push(lines[next]);
      next += 1;
    }

    if (sectionLines.join('').trim()) {
      result.push(line, ...sectionLines);
    }
    index = next - 1;
  }
  return result;
}
