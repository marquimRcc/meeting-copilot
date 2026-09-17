/**
 * Stemmer de Língua Portuguesa (PT-BR) baseado no algoritmo RSLP/Snowball.
 * Reduz palavras a seus radicais morfológicos para busca semântico-léxica precisa.
 */

const STOPWORDS_PT = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'uns', 'umas', 'e', 'ou', 'que', 'se', 'por', 'porque', 'por que', 'pra', 'para',
  'com', 'sem', 'sobre', 'sob', 'entre', 'ate', 'contra', 'desde', 'eu', 'voce', 'voces', 'ele',
  'ela', 'eles', 'elas', 'nos', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas',
  'nosso', 'nossa', 'nossos', 'nossas', 'isso', 'isto', 'aquilo', 'esse', 'essa', 'esses', 'essas',
  'este', 'esta', 'estes', 'estas', 'aquele', 'aquela', 'aqueles', 'aquelas', 'ja', 'ao', 'aos',
  'era', 'eram', 'foi', 'foram', 'sao', 'ser', 'estar', 'esta', 'estao', 'estavam', 'estava',
  'tem', 'tinha', 'tinham', 'ha', 'muito', 'muita', 'mais', 'menos', 'tambem', 'como', 'onde',
  'quando', 'quem', 'qual', 'quais', 'quanto', 'quantos', 'ne', 'tipo', 'assim', 'entao', 'ai'
]);

/**
 * Normaliza o texto removendo diacríticos (acentos), pontuações e convertendo para minúsculas.
 */
export function normalizePt(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Extrai tokens e remove stopwords.
 */
export function tokenizePt(text: string): string[] {
  const normalized = normalizePt(text);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter(token => token.length > 2 && !STOPWORDS_PT.has(token));
}

/**
 * Regras de redução de sufixos substantivos/adjetivos.
 */
const NOUN_SUFFIXES = [
  { match: /amentos?$/, replace: '' },
  { match: /imentos?$/, replace: '' },
  { match: /almentes?$/, replace: '' },
  { match: /mentes?$/, replace: '' },
  { match: /acoes$/, replace: '' },
  { match: /acao$/, replace: '' },
  { match: /icoes$/, replace: '' },
  { match: /icao$/, replace: '' },
  { match: /izacoes$/, replace: '' },
  { match: /izacao$/, replace: '' },
  { match: /ismos?$/, replace: '' },
  { match: /istas?$/, replace: '' },
  { match: /aveis$/, replace: '' },
  { match: /iveis$/, replace: '' },
  { match: /avel$/, replace: '' },
  { match: /ivel$/, replace: '' },
  { match: /encias?$/, replace: '' },
  { match: /ancias?$/, replace: '' },
  { match: /idades?$/, replace: '' },
  { match: /ivos?$/, replace: '' },
  { match: /ivas?$/, replace: '' },
  { match: /ores?$/, replace: '' }
];

/**
 * Regras de redução de sufixos verbais.
 */
const VERB_SUFFIXES = [
  /ariamos$/, /eriamos$/, /iriamos$/,
  /assemos$/, /essemos$/, /issemos$/,
  /aramos$/, /eramos$/, /iramos$/,
  /avamos$/, /evamos$/, /ivamos$/,
  /aremos$/, /eremos$/, /iremos$/,
  /ariam$/, /eriam$/, /iriam$/,
  /assem$/, /essem$/, /issem$/,
  /aram$/, /eram$/, /iram$/,
  /avam$/, /evam$/, /ivam$/,
  /ando$/, /endo$/, /indo$/,
  /aria$/, /eria$/, /iria$/,
  /asse$/, /esse$/, /isse$/,
  /aras?$/, /eras?$/, /iras?$/,
  /avas?$/, /evas?$/, /ivas?$/,
  /ando$/, /endo$/, /indo$/,
  /ados?$/, /idos?$/,
  /adas?$/, /idas?$/,
  /arem$/, /erem$/, /irem$/,
  /ares?$/, /eres?$/, /ires?$/,
  /amos$/, /emos$/, /imos$/,
  /aram$/, /eram$/, /iram$/,
  /ara$/, /era$/, /ira$/,
  /ava$/, /eva$/, /iva$/,
  /ou$/, /eu$/, /iu$/,
  /ar$/, /er$/, /ir$/
];

/**
 * Reduz uma palavra ao seu radical morfológico em português.
 */
export function stemPt(word: string): string {
  if (word.length <= 3) return word;

  let stem = word;

  // 1. Redução de sufixos de substantivos e adjetivos
  for (const { match, replace } of NOUN_SUFFIXES) {
    if (match.test(stem)) {
      const candidate = stem.replace(match, replace);
      if (candidate.length >= 3) {
        stem = candidate;
        break;
      }
    }
  }

  if (stem.length <= 3) return stem;

  // 2. Redução de sufixos verbais (antes de plurais para não truncar 'amos', 'emos', etc.)
  for (const regex of VERB_SUFFIXES) {
    if (regex.test(stem)) {
      const candidate = stem.replace(regex, '');
      if (candidate.length >= 3) {
        stem = candidate;
        break;
      }
    }
  }

  if (stem.length <= 3) return stem;

  // 3. Redução de plurais simples
  if (stem.endsWith('ns')) {
    stem = stem.slice(0, -2) + 'm';
  } else if (stem.endsWith('oes')) {
    stem = stem.slice(0, -3) + 'ao';
  } else if (stem.endsWith('ais') || stem.endsWith('eis') || stem.endsWith('ois')) {
    stem = stem.slice(0, -3) + 'al';
  } else if (stem.endsWith('res') || stem.endsWith('zes')) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('s') && !stem.endsWith('ss')) {
    stem = stem.slice(0, -1);
  }

  // 4. Remoção de vogais temáticas finais residuais (a, e, o)
  if (stem.length > 3 && /[aeo]$/.test(stem)) {
    stem = stem.slice(0, -1);
  }

  return stem;
}

/**
 * Retorna os radicais (stems) únicos de um texto para indexação e busca.
 */
export function stemmedTokensPt(text: string): string[] {
  const tokens = tokenizePt(text);
  const stems = tokens.map(token => stemPt(token)).filter(s => s.length >= 2);
  return [...new Set(stems)];
}
