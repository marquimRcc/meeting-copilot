import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeetingCopilot } from '../packages/core/src/index.ts';
import { TranscriptBuffer } from '../packages/transcript/src/index.ts';
import { QuestionDetector } from '../packages/questions/src/index.ts';
import { ContextIndex } from '../packages/context/src/index.ts';
import { SuggestionRunner } from '../packages/assistant/src/index.ts';
import { fromMeetily } from '../packages/meetily-adapter/src/index.ts';

const segment = (overrides = {}) => ({ sessionId: 's1', id: '1', sequence: 1,
  startMs: 1000, endMs: 2000, text: 'Como investigar erros em produção?',
  final: true, channel: 'remote-system', ...overrides });
const docs = [
  { id: 'java', title: 'Incidentes', scopes: ['java'], text: 'Investigar erros usando logs e correlationId.' },
  { id: 'bnb', title: 'Projeto BNB', scopes: ['bnb'], text: 'Erros de produção em outro projeto.' },
];
const make = () => new MeetingCopilot({ sessionId: 's1', documents: docs, scopes: ['java'] });

test('full path prepares question with selected context and traceable source', () => {
  const result = make().ingest(segment());
  assert.equal(result.question.reason, 'punctuation');
  assert.deepEqual(result.evidence.map(item => item.documentId), ['java']);
  assert.equal(result.evidence[0].paragraph, 1);
  assert.match(result.request.system, /Não invente experiência/);
  assert.doesNotMatch(result.request.user, /Projeto BNB/);
});

test('microphone, mixed and unknown input cannot enter meeting history or trigger', () => {
  const copilot = make();
  for (const channel of ['microphone', 'mixed', 'unknown']) assert.equal(copilot.ingest(segment({ channel })), null);
  assert.deepEqual(copilot.snapshot(), []);
});

test('partial before final triggers only when final arrives', () => {
  const copilot = make();
  assert.equal(copilot.ingest(segment({ final: false })), null);
  assert.ok(copilot.ingest(segment()));
  assert.equal(copilot.ingest(segment()), null);
});

test('replayed/corrected final updates history without duplicate automatic answer', () => {
  const copilot = make();
  copilot.ingest(segment());
  assert.equal(copilot.ingest(segment({ text: 'Como investigar falhas em produção?' })), null);
  assert.match(copilot.snapshot()[0].text, /falhas/);
});

test('delayed older question enters history but does not displace current question', () => {
  const copilot = make();
  assert.ok(copilot.ingest(segment({ id: '2', sequence: 2, startMs: 6000, endMs: 8000 })));
  assert.equal(copilot.ingest(segment({ text: 'Qual banco vocês usam?' })), null);
  assert.deepEqual(copilot.snapshot().map(item => item.id), ['1', '2']);
});

test('same wording deduplicates for 30 seconds but can be asked again later', () => {
  const copilot = make();
  assert.ok(copilot.ingest(segment()));
  assert.equal(copilot.ingest(segment({ id: '2', sequence: 2, startMs: 4000, endMs: 5000 })), null);
  assert.ok(copilot.ingest(segment({ id: '3', sequence: 3, startMs: 40000, endMs: 41000 })));
});

test('buffer evicts old context, bounds segment count and protects snapshots', () => {
  const buffer = new TranscriptBuffer('s1', 10000, 2);
  buffer.append(segment());
  buffer.append(segment({ id: '2', sequence: 2, startMs: 5000, endMs: 6000 }));
  buffer.append(segment({ id: '3', sequence: 3, startMs: 7000, endMs: 8000 }));
  assert.deepEqual(buffer.snapshot().map(item => item.id), ['2', '3']);
  buffer.append(segment({ id: '4', sequence: 4, startMs: 20000, endMs: 21000 }));
  assert.deepEqual(buffer.snapshot().map(item => item.id), ['4']);
  assert.equal(buffer.append(segment()), false);
  buffer.snapshot()[0].text = 'tampered';
  assert.notEqual(buffer.snapshot()[0].text, 'tampered');
});

test('invalid timestamps, id reuse and session contamination fail explicitly', () => {
  const copilot = make();
  assert.throws(() => copilot.ingest(segment({ endMs: NaN })), /Invalid/);
  assert.throws(() => copilot.ingest(segment({ startMs: -1 })), /Invalid/);
  assert.throws(() => copilot.ingest(segment({ sessionId: 's2' })), /Session/);
  copilot.ingest(segment());
  assert.throws(() => copilot.ingest(segment({ sequence: 3 })), /reused/);
});

test('implicit Portuguese requests are candidates; reported speech is excluded', () => {
  for (const text of ['Como tratar falhas parciais', 'Você pode me explicar o fluxo', 'Me conte sobre o projeto']) {
    assert.ok(new QuestionDetector().detect(segment({ text })), text);
  }
  for (const text of ['Como combinamos ontem, vou enviar o arquivo.', 'Ele perguntou como tratar falhas?', 'O serviço usa Java.']) {
    assert.equal(new QuestionDetector().detect(segment({ text })), null, text);
  }
});

test('no scopes, no lexical matches and duplicate document ids are explicit', () => {
  const index = new ContextIndex(docs);
  assert.deepEqual(index.search('erros', []), []);
  assert.deepEqual(index.search('telescópio', ['java']), []);
  assert.throws(() => new ContextIndex([docs[0], docs[0]]), /duplicate/);
  assert.equal(make().ingest(segment({ text: 'Qual telescópio comprar?' })).evidenceStatus, 'no-matches');
});

test('pronoun question can retrieve from preceding conversation', () => {
  const copilot = make();
  copilot.ingest(segment({ id: '0', sequence: 0, startMs: 0, endMs: 900, text: 'Estamos discutindo erros e correlationId.' }));
  const result = copilot.ingest(segment({ text: 'E nesse caso?' }));
  assert.equal(result.evidence[0].documentId, 'java');
});

test('a matching document title does not turn unrelated paragraphs into evidence', () => {
  const index = new ContextIndex([{ id: 'x', title: 'Erros em produção', scopes: ['java'],
    text: 'Descrição genérica do projeto.\n\nOs erros foram investigados nos logs.' }]);
  assert.deepEqual(index.search('erros', ['java']).map(item => item.paragraph), [2]);
  assert.throws(() => new ContextIndex([{ id: 'x', title: 'x', scopes: ['java'] }]), /Invalid/);
});

test('a corrected timestamp also advances the context eviction watermark', () => {
  const buffer = new TranscriptBuffer('s1', 10000);
  buffer.append(segment());
  buffer.append(segment({ id: '2', sequence: 2, startMs: 4000, endMs: 5000 }));
  buffer.append(segment({ id: '2', sequence: 2, startMs: 20000, endMs: 21000 }));
  assert.deepEqual(buffer.snapshot().map(item => item.id), ['2']);
});

test('stopped session refuses new events and next meeting has independent history', () => {
  const copilot = make();
  copilot.ingest(segment()); copilot.stop();
  assert.throws(() => copilot.ingest(segment()), /stopped/);
  assert.deepEqual(make().snapshot(), []);
});

const nativeSession = { sessionId: 's1', platform: 'windows', backend: 'wasapi-loopback',
  sourceId: 'output-endpoint', microphoneOpened: false, verifiedSystemSource: true };
const update = { text: 'Como tratar erros?', source: 'Audio', sequence_id: 1,
  timestamp: '12:00:00', chunk_start_time: 1, is_partial: false,
  audio_start_time: 1, audio_end_time: 2, duration: 1 };

test('Meetily generic Audio event alone is insufficient to assert remote audio', () => {
  assert.throws(() => fromMeetily(update, undefined), /remote-only/);
  assert.throws(() => fromMeetily(update, { ...nativeSession, microphoneOpened: true }), /remote-only/);
  assert.throws(() => fromMeetily(update, { ...nativeSession, verifiedSystemSource: false }), /remote-only/);
  assert.throws(() => fromMeetily(update, { ...nativeSession, platform: 'linux' }), /remote-only/);
});

test('adapter normalizes timestamps for both platform contracts', () => {
  assert.equal(fromMeetily(update, nativeSession).endMs, 2000);
  assert.equal(fromMeetily(update, { ...nativeSession, platform: 'linux', backend: 'pulse-monitor' }).channel, 'remote-system');
  assert.throws(() => fromMeetily({ ...update, source: 'microphone' }, nativeSession), /Unsupported/);
  assert.throws(() => fromMeetily({ ...update, is_partial: undefined }, nativeSession), /Unsupported/);
});

test('late provider answer is discarded when a newer question exists', async () => {
  const pending = [];
  const runner = new SuggestionRunner({ suggest: (_request, signal) => new Promise(resolve => pending.push({ resolve, signal })) });
  const prepared = make().ingest(segment());
  const first = runner.run(prepared);
  const second = runner.run(prepared);
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve('resposta nova');
  assert.equal(await second, 'resposta nova');
  pending[0].resolve('resposta antiga');
  assert.equal(await first, null);
});

test('cancel on meeting end discards answer; active provider errors surface', async () => {
  let resolve;
  const runner = new SuggestionRunner({ suggest: () => new Promise(r => { resolve = r; }) });
  const pending = runner.run(make().ingest(segment()));
  runner.cancel(); resolve('tarde');
  assert.equal(await pending, null);
  const failing = new SuggestionRunner({ suggest: async () => { throw new Error('offline'); } });
  await assert.rejects(() => failing.run(make().ingest(segment())), /offline/);
});
