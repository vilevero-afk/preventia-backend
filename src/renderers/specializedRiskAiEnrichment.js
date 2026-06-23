const ELECTRICAL_SYSTEM_PROMPT = `Tu es un assistant spécialisé en prévention des risques professionnels en Belgique. Tu aides le conseiller en prévention à préparer une analyse de risques d’installations électriques basse tension / haute tension. Le document est une aide, pas une validation finale. Il doit être vérifié sur site, confronté aux rapports RGIE et aux contrôles par organisme agréé. Ne prétends jamais que l’installation est conforme si aucune preuve n’est fournie.`;

const ELEVATOR_SYSTEM_PROMPT = `Tu es un assistant spécialisé en prévention des risques professionnels en Belgique. Tu aides le conseiller en prévention à préparer une analyse de risques d’un ascenseur. Le document est une aide au suivi et à la préparation, pas une analyse réglementaire officielle. Il doit être confronté au rapport du SECT, aux contrôles périodiques, aux documents de maintenance et aux constats sur site. Ne prétends jamais remplacer le SECT.`;

export { getField } from './specializedRiskFields.js';

const COMMON_CONSTRAINTS = `
- conserver la structure globale ;
- remplir les champs connus ;
- utiliser [à vérifier sur site], [preuve à obtenir] ou [validation requise] seulement quand l’information est absente ;
- éviter les répétitions ;
- distinguer constats, risques, mesures existantes, mesures à prévoir, preuves et validations ;
- garder le ton « aide au conseiller en prévention » ;
- intégrer des points exploitables pour PAA / PGP, DIU et PIU ;
- ne pas insérer de pagination « Page 1 / 1 » dans le markdown ;
- retourner uniquement le markdown final, sans commentaire ni clôture de bloc de code.`;

export async function enrichElectricalBtHtRiskAssessmentWithAI({
  baseMarkdown, formData, language, documentType, openai, model, maxOutputTokens,
}) {
  return enrich({
    openai,
    model,
    maxOutputTokens,
    systemPrompt: ELECTRICAL_SYSTEM_PROMPT,
    userPrompt: `À partir du markdown structuré et des données formData, produis une version améliorée, contextualisée et professionnelle.
Contraintes :${COMMON_CONSTRAINTS}
- ne pas répéter le même bloc « mesures existantes » dans chaque ligne ;
- adapter les mesures à chaque danger électrique ;
- ne pas remplacer le RGIE, l’organisme agréé, l’employeur ou le CPPT.`,
    baseMarkdown,
    formData,
    language,
    documentType,
  });
}

export async function enrichElevatorRiskAssessmentWithAI({
  baseMarkdown, formData, language, documentType, openai, model, maxOutputTokens,
}) {
  return enrich({
    openai,
    model,
    maxOutputTokens,
    systemPrompt: ELEVATOR_SYSTEM_PROMPT,
    userPrompt: `À partir du markdown structuré et des données formData, produis une version améliorée, contextualisée et professionnelle.
Contraintes :${COMMON_CONSTRAINTS}
- ne pas répéter les mêmes mesures dans chaque ligne ;
- adapter les mesures à chaque danger ascenseur ;
- intégrer les références utiles : SECT, AR du 9 mars 2003, contrôle périodique, maintenance, modernisation ;
- ne jamais conclure à la conformité.`,
    baseMarkdown,
    formData,
    language,
    documentType,
  });
}

async function enrich({ openai, model, maxOutputTokens, systemPrompt, userPrompt, baseMarkdown, formData, language, documentType }) {
  if (!openai?.responses?.create) throw new Error('Client OpenAI indisponible.');

  const response = await openai.responses.create({
    model,
    max_output_tokens: maxOutputTokens,
    instructions: systemPrompt,
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `${userPrompt}\n\nType de document : ${documentType}\nLangue : ${language}\n\nformData :\n${safeJson(formData)}\n\nMarkdown structuré de base :\n${baseMarkdown}`,
      }],
    }],
  });

  const markdown = cleanSpecializedRiskMarkdown(response?.output_text);
  assertEnrichedMarkdownIsUsable(markdown, baseMarkdown);
  return markdown;
}

export function cleanSpecializedRiskMarkdown(markdown) {
  return String(markdown || '')
    .replace(/^```(?:markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/Page\s+1\s*\/\s*1/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function assertEnrichedMarkdownIsUsable(markdown, baseMarkdown) {
  if (!markdown || !markdown.startsWith('#')) throw new Error('Réponse IA vide ou invalide.');

  const requiredHeadings = String(baseMarkdown || '').match(/^#{1,2}\s+.+$/gm) || [];
  if (requiredHeadings.some((heading) => !markdown.includes(heading))) {
    throw new Error('Structure IA incomplète.');
  }
  if (!/aide au conseiller en prévention/i.test(markdown)) {
    throw new Error('Mention de prudence absente.');
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}
