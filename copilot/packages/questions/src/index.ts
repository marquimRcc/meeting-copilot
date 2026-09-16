import { normalize, type Question, type Segment } from '../../contracts/src/index.ts';

/** Transparent baseline in Portuguese, not a semantic classifier. */
export class QuestionDetector {
  private recent = new Map<string, number>();
  private latestEnd = -1;

  detect(segment: Segment): Question | null {
    if (!segment.final || segment.channel !== 'remote-system') return null;
    if (segment.endMs < this.latestEnd) return null; // delayed STT result
    this.latestEnd = segment.endMs;
    for (const [key, time] of this.recent) {
      if (segment.endMs - time > 30000) this.recent.delete(key);
    }
    // Keep one candidate for all questions in a chunk; do not fire per sentence.
    const text = segment.text.trim();
    const key = normalize(text);
    if (key.length < 4 || this.recent.has(key)) return null;
    const punctuation = /\?/.test(text);
    const reported = /^(ele|ela|eles|elas|o cliente|a cliente) (perguntou|perguntaram|quer saber)\b/.test(key);
    const statement = /^(como (combinamos|falamos|discutimos|eu disse|voces sabem)|qualquer|quando (terminar|acabar))\b/.test(key);
    const interrogative = /^(e |entao |nesse caso )?(como|por que|porque|qual|quais|quem|quanto|quantos|onde)\b/.test(key);
    const request = /^(voce |voces |poderia |poderiam |pode |podem |consegue |conseguem )?(pode |podem |poderia |poderiam |consegue |conseguem )?(me )?(explicar|descrever|contar|detalhar)\b/.test(key)
      || /^(me (explique|conte|descreva)|gostaria de (saber|entender))\b/.test(key);
    if (reported || (!punctuation && (statement || (!interrogative && !request)))) return null;
    this.recent.set(key, segment.endMs);
    // Even adversarial input cannot grow this session cache without a bound.
    if (this.recent.size > 200) this.recent.delete(this.recent.keys().next().value!);
    return {
      id: `${segment.sessionId}:${segment.id}`,
      sessionId: segment.sessionId, segmentId: segment.id,
      text, endMs: segment.endMs,
      reason: punctuation ? 'punctuation' : 'pt-br-pattern',
    };
  }
}
