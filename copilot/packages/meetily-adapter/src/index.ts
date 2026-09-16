import { validateSegment, type CaptureSession, type Segment } from '../../contracts/src/index.ts';

/** Shape emitted by Meetily worker.rs at the pinned upstream revision. */
export interface MeetilyTranscriptUpdate {
  text: string;
  timestamp: string;
  source: string;
  sequence_id: number;
  chunk_start_time: number;
  is_partial: boolean;
  confidence?: number;
  audio_start_time: number;
  audio_end_time: number;
  duration: number;
}

/** Do not pass source="Audio" as proof of remote-only capture. Upstream mixes it. */
export function fromMeetily(update: MeetilyTranscriptUpdate, session: CaptureSession): Segment {
  if (!session || !session.sessionId?.trim() || !session.sourceId?.trim()
    || session.microphoneOpened !== false || session.verifiedSystemSource !== true
    || !((session.platform === 'windows' && session.backend === 'wasapi-loopback')
      || (session.platform === 'linux' && ['pulse-monitor', 'pipewire-monitor'].includes(session.backend)))) {
    throw new Error('Native remote-only capture session required; upstream Audio is not proof');
  }
  if (update.source !== 'Audio' || typeof update.is_partial !== 'boolean'
    || !Number.isFinite(update.audio_start_time) || !Number.isFinite(update.audio_end_time)) {
    throw new Error('Unsupported Meetily transcript event');
  }
  const segment: Segment = {
    sessionId: session.sessionId, id: String(update.sequence_id), sequence: update.sequence_id,
    startMs: Math.round(update.audio_start_time * 1000),
    endMs: Math.round(update.audio_end_time * 1000),
    text: update.text, final: !update.is_partial, channel: 'remote-system',
  };
  validateSegment(segment);
  return segment;
}
