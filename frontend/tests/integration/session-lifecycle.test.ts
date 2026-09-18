import 'fake-indexeddb/auto';
import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

// Setup browser globals for Node test environment
globalThis.window = globalThis as any;
const eventRegistry = new Map<string, Array<(e: any) => void>>();
(globalThis.window as any).addEventListener = (event: string, fn: (e: any) => void) => {
  const list = eventRegistry.get(event) || [];
  list.push(fn);
  eventRegistry.set(event, list);
};
(globalThis.window as any).removeEventListener = (event: string, fn: (e: any) => void) => {
  const list = eventRegistry.get(event) || [];
  eventRegistry.set(event, list.filter(cb => cb !== fn));
};
(globalThis.window as any).dispatchEvent = (event: any) => {
  const eventName = typeof event === 'string' ? event : event?.type;
  const list = eventRegistry.get(eventName) || [];
  for (const fn of list) {
    fn(event);
  }
  return true;
};
(globalThis as any).window = globalThis;
(globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: () => {},
};
(globalThis as any).window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: () => {},
};

// Storage mock
const storage = new Map<string, string>();
globalThis.sessionStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, String(v)),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
  length: 0,
  key: () => null,
} as unknown as Storage;

// Tauri Mock infrastructure
let callbackCounter = 1;
const tauriCallbacks = new Map<number, (event: any) => void>();
const tauriEventListeners = new Map<string, number[]>();

export function emitTauriEvent(eventName: string, payload: any) {
  const handlerIds = tauriEventListeners.get(eventName) || [];
  for (const id of handlerIds) {
    const cb = tauriCallbacks.get(id);
    if (cb) {
      cb({ event: eventName, payload, id });
    }
  }
}

let mockBackendIsRecording = false;
let mockBackendMeetingId: string | null = null;
let mockBackendMeetingName = 'Default Meeting';
let mockBackendHistory: any[] = [];
let failRecordingStart = false;
let startRecordingCallCount = 0;
let startRecordingDelayMs = 0;

(globalThis.window as any).__TAURI_INTERNALS__ = {
  transformCallback: (fn: (event: any) => void) => {
    const id = callbackCounter++;
    tauriCallbacks.set(id, fn);
    return id;
  },
  invoke: async (cmd: string, args: any) => {
    if (cmd === 'plugin:event|listen') {
      const list = tauriEventListeners.get(args.event) || [];
      list.push(args.handler);
      tauriEventListeners.set(args.event, list);
      return 100;
    }
    if (cmd === 'plugin:event|unlisten') {
      return null;
    }
    if (cmd === 'get_recording_state') {
      return {
        is_recording: mockBackendIsRecording,
        meeting_id: mockBackendMeetingId,
        is_paused: false,
        is_active: mockBackendIsRecording,
        recording_duration: null,
        active_duration: null,
      };
    }
    if (cmd === 'get_current_meeting_id') {
      return mockBackendMeetingId;
    }
    if (cmd === 'get_recording_meeting_name') {
      return mockBackendMeetingName;
    }
    if (cmd === 'get_transcript_history') {
      return mockBackendHistory;
    }
    if (cmd === 'api_get_transcript_config') {
      return { provider: 'parakeet' };
    }
    if (cmd === 'parakeet_init') {
      return null;
    }
    if (cmd === 'parakeet_has_available_models') {
      return true;
    }
    if (cmd === 'start_recording_with_devices_and_meeting') {
      startRecordingCallCount++;
      if (startRecordingDelayMs > 0) {
        await new Promise(r => setTimeout(r, startRecordingDelayMs));
      }
      if (failRecordingStart) {
        throw new Error('Device failed to initialize');
      }
      if (mockBackendIsRecording) {
        throw new Error('Recording already in progress');
      }
      mockBackendIsRecording = true;
      mockBackendMeetingId = args?.meetingName ? `meeting-${Date.now()}` : 'meeting-default';
      mockBackendMeetingName = args?.meetingName || 'Meeting';
      // Emit recording-started before resolving, mirroring real backend
      emitTauriEvent('recording-started', {
        meeting_id: mockBackendMeetingId,
        meeting_name: mockBackendMeetingName,
      });
      return null;
    }
    if (cmd === 'stop_recording') {
      mockBackendIsRecording = false;
      const stoppedId = mockBackendMeetingId;
      mockBackendMeetingId = null;
      emitTauriEvent('recording-stopped', {
        folder_path: `/tmp/${stoppedId}`,
      });
      return null;
    }
    if (cmd === 'get_meeting_folder_path') {
      return `/tmp/${mockBackendMeetingId}`;
    }
    return null;
  },
};

// Now import React contexts and services
import { TranscriptProvider, useTranscripts, type TranscriptContextType } from '../../src/contexts/TranscriptContext';
import { RecordingStateProvider, useRecordingState } from '../../src/contexts/RecordingStateContext';
import { SidebarContext } from '../../src/components/Sidebar/SidebarProvider';
import { ConfigContext } from '../../src/contexts/ConfigContext';
import { useRecordingStart } from '../../src/hooks/useRecordingStart';
import { indexedDBService } from '../../src/services/indexedDBService';
import { recordingService } from '../../src/services/recordingService';

let activeContext: TranscriptContextType | null = null;
let activeStartFn: (() => Promise<void>) | null = null;
let renderer: ReactTestRenderer | undefined;

function TestHarness() {
  activeContext = useTranscripts();
  const recordingState = useRecordingState();
  const [isRecording, setIsRecording] = useState(false);

  React.useEffect(() => {
    setIsRecording(recordingState.isRecording);
  }, [recordingState.isRecording]);

  const { handleRecordingStart } = useRecordingStart(isRecording, setIsRecording);
  activeStartFn = handleRecordingStart;
  return null;
}

function renderApp() {
  return React.createElement(SidebarContext.Provider, { value: { setIsMeetingActive: () => {} } as any },
    React.createElement(ConfigContext.Provider, { value: { selectedDevices: null } as any },
      React.createElement(RecordingStateProvider, null,
        React.createElement(TranscriptProvider, null,
          React.createElement(TestHarness, null)
        )
      )
    )
  );
}

describe('Sincronização de Sessão e Testes Integrados', () => {
  beforeEach(async () => {
    storage.clear();
    tauriEventListeners.clear();
    tauriCallbacks.clear();
    mockBackendIsRecording = false;
    mockBackendMeetingId = null;
    mockBackendMeetingName = 'Default Meeting';
    mockBackendHistory = [];
    failRecordingStart = false;
    startRecordingCallCount = 0;
    startRecordingDelayMs = 0;
    activeContext = null;
    activeStartFn = null;

    // Reset IndexedDB
    indexedDBService.close();
    try {
      indexedDB.deleteDatabase('MeetilyRecoveryDB');
    } catch {}
    await indexedDBService.init();
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer!.unmount();
      });
      renderer = undefined;
    }
  });

  it('Cenário A — início normal: recording-started adotado, clearTranscripts prévio não apaga sessão e primeira fala é aceita', async () => {
    await act(async () => {
      renderer = create(renderApp());
    });

    assert.ok(activeContext, 'Contexto deve ter sido montado');
    assert.strictEqual(activeContext.currentMeetingId, null, 'ID inicial deve ser nulo');

    // Executa o fluxo real de início (useRecordingStart -> recordingService -> backend mock)
    await act(async () => {
      await activeStartFn!();
    });

    const adoptedId = activeContext.currentMeetingId;
    assert.ok(adoptedId, 'currentMeetingId deve ser preenchido após início');
    assert.ok((adoptedId as string).startsWith('meeting-'), 'Deve ter prefixo meeting-');

    // Envia o primeiro transcript-update após o início
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: adoptedId,
        sequence_id: 1,
        text: 'Primeira fala da reuniao A',
        is_partial: false,
        source: 'Microphone',
        timestamp: new Date().toISOString(),
      });
      // Tempo para o buffer debounce (10ms)
      await new Promise(r => setTimeout(r, 60));
    });

    // 1. currentMeetingId continua com o novo ID
    assert.strictEqual(activeContext.currentMeetingId, adoptedId);

    // 2. A primeira transcrição aparece na tela
    assert.strictEqual(activeContext.transcripts.length, 1, 'Transcripts deve conter 1 elemento');
    assert.strictEqual(activeContext.transcripts[0].text, 'Primeira fala da reuniao A');
    assert.strictEqual(activeContext.transcripts[0].speaker, 'Você');

    // 3. A transcrição é persistida no IndexedDB
    const savedInIdb = await indexedDBService.getTranscripts(adoptedId);
    assert.strictEqual(savedInIdb.length, 1, 'IndexedDB deve ter 1 registro');
    assert.strictEqual(savedInIdb[0].text, 'Primeira fala da reuniao A');
  });

  it('Cenário B — segunda reunião: descarta eventos atrasados da reunião anterior e aceita os da reunião ativa', async () => {
    await act(async () => {
      renderer = create(renderApp());
    });

    // Inicia e encerra Reunião A
    await act(async () => {
      await activeStartFn!();
    });
    const meetingA = activeContext!.currentMeetingId!;
    assert.ok(meetingA);

    await act(async () => {
      mockBackendIsRecording = false;
      mockBackendMeetingId = null;
      emitTauriEvent('recording-stopped', { folder_path: `/tmp/${meetingA}` });
      await new Promise(r => setTimeout(r, 30));
    });

    assert.strictEqual(activeContext!.currentMeetingId, null, 'Reunião A deve estar inativa');

    // Inicia Reunião B
    await act(async () => {
      await activeStartFn!();
    });
    const meetingB = activeContext!.currentMeetingId!;
    assert.ok(meetingB);
    assert.notStrictEqual(meetingA, meetingB, 'Reunião B deve ter ID diferente de A');

    // Envia evento atrasado da Reunião A
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: meetingA,
        sequence_id: 99,
        text: 'Fala atrasada de A (deve ser descartada)',
        is_partial: false,
        source: 'Microphone',
        timestamp: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 40));
    });

    // Envia evento válido da Reunião B
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: meetingB,
        sequence_id: 1,
        text: 'Primeira fala legítima de B',
        is_partial: false,
        source: 'Microphone',
        timestamp: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 60));
    });

    // Confirma que apenas o evento de B está na tela
    assert.strictEqual(activeContext!.transcripts.length, 1);
    assert.strictEqual(activeContext!.transcripts[0].text, 'Primeira fala legítima de B');
    assert.strictEqual(activeContext!.transcripts[0].meeting_id, meetingB);

    // Confirma no IndexedDB: B recebeu 1 transcrição, A não recebeu nada atrasado
    const bRecords = await indexedDBService.getTranscripts(meetingB);
    assert.strictEqual(bRecords.length, 1);
    assert.strictEqual(bRecords[0].text, 'Primeira fala legítima de B');

    const aRecords = await indexedDBService.getTranscripts(meetingA);
    assert.strictEqual(aRecords.length, 0);
  });

  it('Cenário C — reload durante gravação: restaura sessão antes de novos eventos e continua recebendo transcrições', async () => {
    // Configura o backend simulando gravação ativa com histórico
    mockBackendIsRecording = true;
    mockBackendMeetingId = 'meeting-active-reload-123';
    mockBackendMeetingName = 'Gravação Recuperada';
    mockBackendHistory = [
      {
        id: 'hist-1',
        text: 'Fala gravada antes do reload',
        display_time: '10:00:00',
        sequence_id: 1,
        audio_start_time: 0,
        confidence: 0.95,
        source: 'System Audio',
      }
    ];

    // Monta o TranscriptProvider simulando o reload da página
    await act(async () => {
      renderer = create(renderApp());
      // Aguarda syncFromBackend
      await new Promise(r => setTimeout(r, 80));
    });

    // Confirma que a sessão foi restaurada com o ID do backend
    assert.strictEqual(activeContext!.currentMeetingId, 'meeting-active-reload-123');
    assert.strictEqual(activeContext!.meetingTitle, 'Gravação Recuperada');
    assert.strictEqual(activeContext!.transcripts.length, 1);
    assert.strictEqual(activeContext!.transcripts[0].text, 'Fala gravada antes do reload');
    assert.strictEqual(activeContext!.transcripts[0].speaker, 'Participante');

    // Envia novo evento ao vivo pós-reload com o ID recuperado
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: 'meeting-active-reload-123',
        sequence_id: 2,
        text: 'Fala ao vivo pós-reload',
        is_partial: false,
        source: 'Microphone',
        timestamp: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 60));
    });

    assert.strictEqual(activeContext!.transcripts.length, 2);
    assert.strictEqual(activeContext!.transcripts[1].text, 'Fala ao vivo pós-reload');

    const savedIdb = await indexedDBService.getTranscripts('meeting-active-reload-123');
    assert.strictEqual(savedIdb.length, 1, 'Segmento ao vivo pós-reload deve ter sido salvo no IDB');
    assert.strictEqual(savedIdb[0].text, 'Fala ao vivo pós-reload');
  });

  it('Cenário D — evento órfão: descartado quando não há reunião ativa', async () => {
    await act(async () => {
      renderer = create(renderApp());
    });

    assert.strictEqual(activeContext!.currentMeetingId, null);

    // Envia evento sem nenhuma sessão ativa
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: 'meeting-orfao-xyz',
        sequence_id: 1,
        text: 'Esta fala orfã não deve entrar',
        is_partial: false,
        timestamp: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 60));
    });

    // Confirma descarte completo
    assert.strictEqual(activeContext!.transcripts.length, 0);

    const savedIdb = await indexedDBService.getTranscripts('meeting-orfao-xyz');
    assert.strictEqual(savedIdb.length, 0);
  });

  it('Cenário E — correção no IndexedDB: upsert com chave composta não duplica e não incrementa transcriptCount', async () => {
    const meetingId = 'meeting-test-idb-upsert';

    // Salva metadata inicial
    await indexedDBService.saveMeetingMetadata({
      meetingId,
      title: 'Teste Upsert',
      startTime: Date.now(),
      lastUpdated: Date.now(),
      transcriptCount: 0,
      savedToSQLite: false,
    });

    // 1. Salva sequence_id = 1 com texto inicial (parcial)
    await indexedDBService.saveTranscript(meetingId, {
      sequence_id: 1,
      text: 'O que você achou',
      is_partial: true,
      timestamp: new Date().toISOString(),
    });

    let count = await indexedDBService.getTranscriptCount(meetingId);
    let meta = await indexedDBService.getMeetingMetadata(meetingId);
    let items = await indexedDBService.getTranscripts(meetingId);

    assert.strictEqual(count, 1, 'Deve ter 1 registro');
    assert.strictEqual(meta?.transcriptCount, 1, 'transcriptCount deve ser 1');
    assert.strictEqual(items[0].text, 'O que você achou');

    // 2. Salva novamente o mesmo sequence_id = 1 com texto corrigido pelo Whisper
    await indexedDBService.saveTranscript(meetingId, {
      sequence_id: 1,
      text: 'O que você achou do projeto final?',
      is_partial: false,
      timestamp: new Date().toISOString(),
    });

    count = await indexedDBService.getTranscriptCount(meetingId);
    meta = await indexedDBService.getMeetingMetadata(meetingId);
    items = await indexedDBService.getTranscripts(meetingId);

    // 3. Confirma: somente um registro, texto atualizado, transcriptCount === 1
    assert.strictEqual(count, 1, 'Count total de registros deve continuar 1');
    assert.strictEqual(meta?.transcriptCount, 1, 'transcriptCount não deve ser duplicado');
    assert.strictEqual(items.length, 1, 'Lista deve conter exatamente 1 registro');
    assert.strictEqual(items[0].text, 'O que você achou do projeto final?');
    assert.strictEqual(items[0].is_partial, false);
  });

  it('Início com erro: mantém a sessão inativa', async () => {
    failRecordingStart = true;

    await act(async () => {
      renderer = create(renderApp());
    });

    let errorThrown: any = null;
    await act(async () => {
      try {
        await activeStartFn!();
      } catch (err) {
        errorThrown = err;
      }
    });

    assert.ok(errorThrown, 'Erro deve ter sido lançado');
    assert.strictEqual(activeContext!.currentMeetingId, null, 'Sessão deve permanecer inativa após erro');
    assert.strictEqual(activeContext!.transcripts.length, 0);
  });

  it('Cenário F — início duplicado com corrida: backend rejeita chamada concorrente, novo transcript e sessão são preservados', async () => {
    await act(async () => {
      renderer = create(renderApp());
    });

    // 1. Início da reunião 1
    await act(async () => {
      await activeStartFn!();
    });

    const activeId = activeContext!.currentMeetingId;
    assert.ok(activeId, 'currentMeetingId deve estar ativo');

    // 2. Recebe transcrições durante a reunião 1
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: activeId,
        sequence_id: 1,
        text: 'Fala importante da reunião ativa',
        is_partial: false,
        source: 'Microphone',
        timestamp: new Date().toISOString(),
      });
    });

    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(activeContext!.transcripts.length, 1, 'Deve ter 1 transcrição na reunião ativa');
    assert.strictEqual(activeContext!.transcripts[0].text, 'Fala importante da reunião ativa');

    // 3. Simula chamada concorrente direta ao backend que recebe erro 'Recording already in progress'
    let rejectedError: string | null = null;
    await act(async () => {
      try {
        await recordingService.startRecordingWithDevices(null, null, 'Meeting Concorrente');
      } catch (err: any) {
        rejectedError = err?.message || String(err);
      }
    });

    assert.ok(rejectedError && rejectedError.includes('already in progress'), 'Backend deve rejeitar chamada concorrente');

    // 4. Recebe mais um transcript da reunião vencedora após a rejeição da concorrente
    await act(async () => {
      emitTauriEvent('transcript-update', {
        meeting_id: activeId,
        sequence_id: 2,
        text: 'Segunda fala após tentativa concorrente',
        is_partial: false,
        source: 'System Audio',
        timestamp: new Date().toISOString(),
      });
    });

    await new Promise(r => setTimeout(r, 40));

    // 5. Garante que as transcrições e o ID da reunião ativa não foram apagados nem corrompidos
    assert.strictEqual(activeContext!.currentMeetingId, activeId, 'currentMeetingId da reunião ativa deve ser preservado');
    assert.strictEqual(activeContext!.transcripts.length, 2, 'Transcrições não devem ser apagadas por início duplicado');
    assert.strictEqual(activeContext!.transcripts[0].text, 'Fala importante da reunião ativa');
    assert.strictEqual(activeContext!.transcripts[1].text, 'Segunda fala após tentativa concorrente');
  });

  it('Cenário G — concorrência botão + sidebar: coordenador único trava início simultâneo', async () => {
    await act(async () => {
      renderer = create(renderApp());
    });

    startRecordingCallCount = 0;

    // Dispara start manual e evento de sidebar simultaneamente
    await act(async () => {
      const p1 = activeStartFn!();
      window.dispatchEvent(new Event('start-recording-from-sidebar'));
      await p1;
    });

    // Deve ter invocado o start nativo apenas 1 vez graças ao isStartingRef coordenador
    assert.strictEqual(startRecordingCallCount, 1, 'Deve haver exatamente 1 invocação do start nativo');
    assert.ok(activeContext!.currentMeetingId, 'Reunião deve ter sido iniciada com sucesso');
    assert.strictEqual(mockBackendIsRecording, true, 'isRecording deve estar ativo');
  });

  it('Cenário H — timeout e reconciliação: evita captura invisível e encerra recursos de forma segura', async () => {
    await act(async () => {
      renderer = create(renderApp());
    });

    // Simula backend que demora mais que o timeout especificado
    let timeoutHappened = false;
    try {
      startRecordingDelayMs = 80;
      await recordingService.startRecordingWithDevices(null, null, 'Slow Meeting', 20);
    } catch (err: any) {
      timeoutHappened = true;
      assert.ok(err.message.includes('timed out'), 'Erro deve ser de timeout');
    } finally {
      startRecordingDelayMs = 0;
    }

    assert.ok(timeoutHappened, 'Timeout deve ter sido disparado');
    // Reconciliação deve garantir que não há gravação fantasma deixada no backend
    assert.strictEqual(mockBackendIsRecording, false, 'Backend não pode ficar gravando silenciosamente');
  });

  after(() => {
    indexedDBService.close();
  });
});
