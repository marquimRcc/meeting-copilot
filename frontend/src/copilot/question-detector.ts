import type { CopilotQuestion, CopilotSegment } from './types.ts';
import { normalizePt } from './stemmer-pt.ts';

/**
 * Muletas de fala, confirmações curtas e checagens de microfone a ignorar.
 */
const RHETORICAL_AND_FILLER_PATTERNS = [
  /^(ne|beleza|certo|entendeu|entende|tranquilo|ok|ta bom|tudo bem)\??$/i,
  /^(ta me ouvindo|consegue me ouvir|esta me ouvindo|me ouvem|me ouve)\??$/i,
  /^(consegue ver minha tela|esta vendo minha tela|veem minha tela)\??$/i,
  /^(alo|oi|ola|bom dia|boa tarde|boa noite)\??$/i,
];

/**
 * Padrões interrogativos no português falado (independente de onde apareçam na frase).
 */
const INTERROGATIVE_KEYWORDS = [
  /\bcomo\s+(e\s+que|funciona|fazer|tratar|investigar|resolver|usar|implementar|voce|a gente|voces)\b/i,
  /\bqual\s+(e|foi|seria|sao|foram)\s+(o|a|os|as|seu|sua)\b/i,
  /\bquais\s+(sao|foram|seriam)\b/i,
  /\bpor\s*que\s+(voce|nao|usamos|foi|aconteceu)\b/i,
  /\bonde\s+(fica|esta|estao|armazenamos|rodam)\b/i,
  /\bquem\s+(e|ficou|esta|ficara)\s+responsavel\b/i,
  /\bquanto\s+tempo\b/i
];

/**
 * Padrões de solicitação ou pedido de explicação.
 */
const REQUEST_PATTERNS = [
  /\b(pode|poderia|consegue)\s+(me\s+)?(explicar|detalhar|contar|falar|mostrar|esclarecer)\b/i,
  /\bme\s+(explica|conte|descreva|fale|mostre)\b/i,
  /\b(gostaria|queria)\s+de\s+(saber|entender|ver)\b/i,
  /\b(tira|tirar)\s+(uma\s+)?duvida\b/i
];

/**
 * Detector robusto de perguntas e solicitações para reuniões orais em PT-BR.
 */
export class QuestionDetector {
  private recentQuestions = new Map<string, number>();
  private minIntervalMs = 25000; // 25s deduplicação

  detect(segment: CopilotSegment): CopilotQuestion | null {
    if (!segment || !segment.final || segment.channel !== 'remote-system') {
      return null;
    }

    const rawText = segment.text.trim();
    if (rawText.length < 5) return null;

    const normalized = normalizePt(rawText);

    // 1. Descartar muletas e verificações de áudio
    for (const pattern of RHETORICAL_AND_FILLER_PATTERNS) {
      if (pattern.test(rawText) || pattern.test(normalized)) {
        return null;
      }
    }

    // 2. Descartar discurso indireto ("Ele me perguntou como...", "Como combinamos...")
    if (/^(ele|ela|eles|elas|o cliente|a equipe)\s+(perguntou|falou|disse)\b/i.test(normalized)) {
      return null;
    }
    if (/^como\s+(combinamos|falamos|discutimos|eu disse|voce sabe|voces sabem)\b/i.test(normalized)) {
      return null;
    }

    // 3. Deduplicação por hash normalizado
    const now = segment.endMs || Date.now();
    for (const [key, timestamp] of this.recentQuestions) {
      if (now - timestamp > this.minIntervalMs) {
        this.recentQuestions.delete(key);
      }
    }

    const dedupeKey = normalized.slice(0, 50);
    if (this.recentQuestions.has(dedupeKey)) {
      return null;
    }

    // 4. Avaliação por regras
    const hasPunctuation = /\?/.test(rawText);
    let isMatch = false;
    let reason: CopilotQuestion['reason'] = 'punctuation';
    let confidence = 0.5;

    // Se tem ponto de interrogação e não foi descartado pelos filtros
    if (hasPunctuation) {
      // Requer que a pergunta tenha substância (mais de 2 palavras além de vocativo)
      const words = normalized.split(' ').filter(w => w.length > 2);
      if (words.length >= 2) {
        isMatch = true;
        reason = 'punctuation';
        confidence = 0.8;
      }
    }

    // Verificação de interrogativas orais mesmo sem pontuação
    if (!isMatch) {
      for (const pattern of INTERROGATIVE_KEYWORDS) {
        if (pattern.test(normalized)) {
          isMatch = true;
          reason = 'interrogative';
          confidence = 0.85;
          break;
        }
      }
    }

    // Verificação de pedidos de explicação/descrição
    if (!isMatch) {
      for (const pattern of REQUEST_PATTERNS) {
        if (pattern.test(normalized)) {
          isMatch = true;
          reason = 'request';
          confidence = 0.9;
          break;
        }
      }
    }

    if (!isMatch) return null;

    this.recentQuestions.set(dedupeKey, now);

    return {
      id: `q-${segment.sessionId}-${segment.id}`,
      sessionId: segment.sessionId,
      segmentId: segment.id,
      text: rawText,
      endMs: segment.endMs,
      reason,
      confidence
    };
  }

  /**
   * Limpa o cache de deduplicação.
   */
  clear(): void {
    this.recentQuestions.clear();
  }
}
