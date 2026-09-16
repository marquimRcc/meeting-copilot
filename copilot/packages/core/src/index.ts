import type { ContextDocument, PreparedQuestion, Segment } from '../../contracts/src/index.ts';
import { TranscriptBuffer } from '../../transcript/src/index.ts';
import { QuestionDetector } from '../../questions/src/index.ts';
import { ContextIndex } from '../../context/src/index.ts';
import { prepareQuestion } from '../../assistant/src/index.ts';

export class MeetingCopilot {
  private buffer: TranscriptBuffer;
  private detector = new QuestionDetector();
  private index: ContextIndex;
  private scopes: readonly string[];
  private stopped = false;

  constructor(options: { sessionId: string; documents: readonly ContextDocument[]; scopes: readonly string[] }) {
    this.buffer = new TranscriptBuffer(options.sessionId);
    this.index = new ContextIndex(options.documents);
    this.scopes = [...options.scopes];
  }

  ingest(segment: Segment): PreparedQuestion | null {
    if (this.stopped) throw new Error('Session stopped; create a new copilot for the next meeting');
    if (!this.buffer.append(segment)) return null;
    const question = this.detector.detect(segment);
    if (!question) return null;
    const conversation = this.buffer.snapshot();
    // Prefer explicit question. Use preceding context only when no direct match exists.
    let evidence = this.index.search(question.text, this.scopes);
    if (!evidence.length) {
      evidence = this.index.search(conversation.slice(-3).map(item => item.text).join(' '), this.scopes);
    }
    return prepareQuestion(question, conversation, evidence);
  }

  snapshot(): Segment[] { return this.buffer.snapshot(); }
  stop(): void { this.stopped = true; }
}
