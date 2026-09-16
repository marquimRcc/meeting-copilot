export type AudioChannel = 'remote-system' | 'microphone' | 'mixed' | 'unknown';

export interface Segment {
  sessionId: string;
  id: string;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  final: boolean;
  channel: AudioChannel;
}

export interface ContextDocument {
  id: string;
  title: string;
  scopes: readonly string[];
  text: string;
}

export interface Evidence {
  documentId: string;
  title: string;
  paragraph: number;
  text: string;
  score: number;
}

export interface Question {
  id: string;
  sessionId: string;
  text: string;
  endMs: number;
  segmentId: string;
  reason: 'punctuation' | 'pt-br-pattern';
}

export interface PreparedQuestion {
  question: Question;
  conversation: readonly Segment[];
  evidence: readonly Evidence[];
  evidenceStatus: 'matches-found' | 'no-matches';
  request: { system: string; user: string };
}

/** Native capture must establish these facts. A TS boolean is not an audio check. */
export interface CaptureSession {
  sessionId: string;
  platform: 'windows' | 'linux';
  backend: 'wasapi-loopback' | 'pulse-monitor' | 'pipewire-monitor';
  sourceId: string;
  microphoneOpened: false;
  verifiedSystemSource: true;
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function validateSegment(segment: Segment): void {
  if (!segment || typeof segment.sessionId !== 'string' || !segment.sessionId.trim()
    || typeof segment.id !== 'string' || !segment.id.trim()
    || !Number.isSafeInteger(segment.sequence) || segment.sequence < 0
    || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)
    || segment.startMs < 0 || segment.endMs < segment.startMs
    || typeof segment.text !== 'string' || segment.text.length > 12000
    || typeof segment.final !== 'boolean'
    || !['remote-system', 'microphone', 'mixed', 'unknown'].includes(segment.channel)) {
    throw new Error('Invalid transcript segment');
  }
}
