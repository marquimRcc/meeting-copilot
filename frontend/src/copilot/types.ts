/**
 * Contratos e tipagens do Meeting Copilot.
 */

export type AudioChannel = 'remote-system' | 'microphone' | 'mixed' | 'unknown';

export interface CopilotSegment {
  id: string;
  sessionId: string;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  final: boolean;
  channel: AudioChannel;
}

export interface CopilotQuestion {
  id: string;
  sessionId: string;
  segmentId: string;
  text: string;
  endMs: number;
  reason: 'punctuation' | 'interrogative' | 'request' | 'manual';
  confidence: number;
}

export interface ContextDocument {
  id: string;
  title: string;
  scopes: readonly string[];
  text: string;
}

export interface EvidenceMatch {
  documentId: string;
  title: string;
  paragraph: number;
  text: string;
  score: number;
}

export interface SuggestionRequest {
  question: string;
  conversation: readonly { startMs: number; text: string }[];
  evidence: readonly EvidenceMatch[];
  systemPrompt: string;
  userPrompt: string;
}

export interface CopilotConfig {
  provider: 'ollama' | 'openai' | 'custom-openai';
  endpoint?: string;
  model: string;
  apiKey?: string;
  scopes: string[];
  autoTrigger: boolean;
}

export interface CopilotState {
  currentQuestion: CopilotQuestion | null;
  evidence: EvidenceMatch[];
  streamingAnswer: string;
  isGenerating: boolean;
  error: string | null;
}
