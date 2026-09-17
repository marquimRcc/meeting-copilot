import type { CopilotSegment } from './types.ts';

/**
 * Buffer deslizante de alta performance para janela de contexto de reuniões.
 */
export class TranscriptBuffer {
  private segments = new Map<string, CopilotSegment>();
  private orderedIds: string[] = [];
  private watermarkMs = 0;
  readonly sessionId: string;
  readonly windowMs: number;
  readonly maxSegments: number;

  constructor(sessionId: string, windowMs = 120000, maxSegments = 200) {
    this.sessionId = sessionId;
    this.windowMs = windowMs;
    this.maxSegments = maxSegments;
  }

  /**
   * Adiciona ou atualiza um segmento no buffer.
   * Retorna true se o segmento foi adicionado como novo ou atualizado substancialmente.
   */
  append(segment: CopilotSegment): { isNew: boolean; isQuestionEligible: boolean } {
    if (!segment || !segment.text || !segment.text.trim()) {
      return { isNew: false, isQuestionEligible: false };
    }

    if (segment.channel !== 'remote-system' || !segment.final) {
      return { isNew: false, isQuestionEligible: false };
    }

    // Tolerância para saltos de relógio ou timestamps desordenados
    if (this.watermarkMs > 0 && segment.endMs < this.watermarkMs - this.windowMs) {
      return { isNew: false, isQuestionEligible: false };
    }

    this.watermarkMs = Math.max(this.watermarkMs, segment.endMs);

    const existing = this.segments.get(segment.id);
    if (existing) {
      const textChanged = existing.text !== segment.text;
      this.segments.set(segment.id, { ...segment });
      return { isNew: false, isQuestionEligible: textChanged };
    }

    this.segments.set(segment.id, { ...segment });
    this.orderedIds.push(segment.id);

    this.prune();

    return { isNew: true, isQuestionEligible: true };
  }

  snapshot(): CopilotSegment[] {
    const list: CopilotSegment[] = [];
    for (const id of this.orderedIds) {
      const seg = this.segments.get(id);
      if (seg) list.push({ ...seg });
    }
    return list;
  }

  private prune(): void {
    const minEndMs = this.watermarkMs - this.windowMs;

    // Prune por tempo
    while (this.orderedIds.length > 0) {
      const oldestId = this.orderedIds[0];
      const oldest = this.segments.get(oldestId);
      if (oldest && oldest.endMs < minEndMs) {
        this.segments.delete(oldestId);
        this.orderedIds.shift();
      } else {
        break;
      }
    }

    // Prune por limite máximo de segmentos
    while (this.orderedIds.length > this.maxSegments) {
      const oldestId = this.orderedIds.shift();
      if (oldestId) this.segments.delete(oldestId);
    }
  }

  clear(): void {
    this.segments.clear();
    this.orderedIds = [];
    this.watermarkMs = 0;
  }
}
