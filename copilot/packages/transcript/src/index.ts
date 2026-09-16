import { validateSegment, type Segment } from '../../contracts/src/index.ts';

/** Session-owned, bounded context. This is not the permanent transcript store. */
export class TranscriptBuffer {
  private segments = new Map<string, Segment>();
  private watermarkMs = 0;
  readonly sessionId: string;
  readonly windowMs: number;
  readonly maxSegments: number;

  constructor(sessionId: string, windowMs = 120000, maxSegments = 200) {
    if (!sessionId.trim() || !Number.isFinite(windowMs) || windowMs <= 0
      || !Number.isSafeInteger(maxSegments) || maxSegments < 1) {
      throw new Error('Invalid buffer configuration');
    }
    this.sessionId = sessionId;
    this.windowMs = windowMs;
    this.maxSegments = maxSegments;
  }

  append(segment: Segment): boolean {
    validateSegment(segment);
    if (segment.sessionId !== this.sessionId) throw new Error('Session mismatch');
    if (segment.channel !== 'remote-system' || !segment.final || !segment.text.trim()) return false;
    if (segment.endMs < this.watermarkMs - this.windowMs) return false;
    const previous = this.segments.get(segment.id);
    if (previous) {
      // Corrections replace history but never trigger a second automatic answer.
      if (segment.sequence !== previous.sequence) throw new Error('Segment id reused');
      this.watermarkMs = Math.max(this.watermarkMs, segment.endMs);
      this.segments.set(segment.id, { ...segment });
      this.prune();
      return false;
    }
    this.watermarkMs = Math.max(this.watermarkMs, segment.endMs);
    this.segments.set(segment.id, { ...segment });
    this.prune();
    return this.segments.has(segment.id);
  }

  snapshot(): Segment[] {
    return [...this.segments.values()].sort((a, b) => a.startMs - b.startMs || a.sequence - b.sequence)
      .map(segment => ({ ...segment }));
  }

  private prune(): void {
    for (const [id, segment] of this.segments) {
      if (segment.endMs < this.watermarkMs - this.windowMs) this.segments.delete(id);
    }
    const ordered = this.snapshot();
    for (const segment of ordered.slice(0, Math.max(0, ordered.length - this.maxSegments))) {
      this.segments.delete(segment.id);
    }
  }
}
