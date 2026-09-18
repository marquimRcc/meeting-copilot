import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { recordingService } from '@/services/recordingService';
import Analytics from '@/lib/analytics';
import { showRecordingNotification } from '@/lib/recordingNotification';
import {
  getProviderCommands,
  hasDownloadingModel,
  type ModelWithStatus,
} from '@/lib/transcription-model-readiness';
import { toast } from 'sonner';

const TRANSCRIPTION_RUNTIME_START_ERROR_CODE = 'TRANSCRIPTION_RUNTIME_INITIALIZATION_FAILED';
const TRANSCRIPTION_RUNTIME_USER_MESSAGE = 'Não foi possível inicializar o reconhecimento de fala. Reinicie o Meetily. Se o problema persistir, repare ou reinstale o aplicativo.';

const isTranscriptionRuntimeStartError = (error: unknown) =>
  String(error) === TRANSCRIPTION_RUNTIME_START_ERROR_CODE;

interface UseRecordingStartReturn {
  handleRecordingStart: () => Promise<void>;
  isAutoStarting: boolean;
}

interface TranscriptConfig {
  provider?: string;
}

/**
 * Custom hook for managing recording start lifecycle.
 * Handles manual start (button click), auto-start (from navigation) and direct start (sidebar).
 *
 * Coordinated via a single synchronous latch (isStartingRef) to prevent races
 * between multiple entry points.
 */
export function useRecordingStart(
  isRecording: boolean,
  setIsRecording: (value: boolean) => void,
  showModal?: (name: 'modelSelector', message?: string) => void
): UseRecordingStartReturn {
  const [isAutoStarting, setIsAutoStarting] = useState(false);

  // Synchronous latch: a single coordinator lock across ALL entry points
  // (manual button click, sidebar direct start, and auto-start on navigation).
  const isStartingRef = useRef(false);

  const { clearTranscripts, setMeetingTitle } = useTranscripts();
  const { setIsMeetingActive } = useSidebar();
  const { selectedDevices } = useConfig();
  const { setStatus } = useRecordingState();

  // Generate meeting title with timestamp
  const generateMeetingTitle = useCallback(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `Reunião ${day}_${month}_${year}_${hours}_${minutes}_${seconds}`;
  }, []);

  const getTranscriptionProvider = useCallback(async (): Promise<string> => {
    try {
      const config = await invoke<TranscriptConfig | null>('api_get_transcript_config');
      return config?.provider || 'parakeet';
    } catch (error) {
      console.error('Failed to load transcription provider:', error);
      return 'parakeet';
    }
  }, []);

  // Check the selected local transcription provider, not a hardcoded engine.
  const checkTranscriptionModelReady = useCallback(async (): Promise<boolean> => {
    try {
      const provider = await getTranscriptionProvider();
      const commands = getProviderCommands(provider);

      if (commands) {
        await invoke(commands.initialize);
        return await invoke<boolean>(commands.hasAvailableModels);
      }

      console.error(`Unsupported transcription provider: ${provider}`);
      return false;
    } catch (error) {
      console.error('Failed to check transcription model status:', error);
      return false;
    }
  }, [getTranscriptionProvider]);

  // Check download status for the selected local transcription provider.
  const checkIfModelDownloading = useCallback(async (): Promise<boolean> => {
    try {
      const provider = await getTranscriptionProvider();
      const commands = getProviderCommands(provider);
      if (!commands) return false;

      const models = await invoke<ModelWithStatus[]>(commands.getAvailableModels);
      return hasDownloadingModel(models);
    } catch (error) {
      console.error('Failed to check model download status:', error);
      return false;
    }
  }, [getTranscriptionProvider]);

  // Unified start coordinator for manual, sidebar-auto, and sidebar-direct
  const executeRecordingStart = useCallback(async (triggerSource: 'manual' | 'sidebar_auto' | 'sidebar_direct') => {
    if (isStartingRef.current || isRecording) {
      console.log(`[RecordingStart] ${triggerSource} ignored - start already in progress or recording active`);
      return;
    }
    isStartingRef.current = true;
    if (triggerSource !== 'manual') {
      setIsAutoStarting(true);
    }

    try {
      console.log(`[RecordingStart] ${triggerSource} called - checking backend state and model readiness`);

      // 1. Check if backend is already recording before initiating start
      try {
        const backendState = await recordingService.getRecordingState();
        if (backendState?.is_recording) {
          console.warn(`[RecordingStart] ${triggerSource} ignored - backend recording already in progress`);
          setStatus(RecordingStatus.RECORDING);
          setIsRecording(true);
          setIsMeetingActive(true);
          return;
        }
      } catch (e) {
        console.warn('Failed to check backend recording state before start:', e);
      }

      // 2. Check the selected transcription model before starting
      const modelReady = await checkTranscriptionModelReady();
      if (!modelReady) {
        const isDownloading = await checkIfModelDownloading();
        const trackingSource = triggerSource === 'manual' ? 'home_page' : triggerSource;
        if (isDownloading) {
          toast.info('Download do modelo em andamento', {
            description: 'Aguarde o download do modelo de transcrição terminar antes de iniciar a gravação.',
            duration: 5000,
          });
          Analytics.trackButtonClick('start_recording_blocked_downloading', trackingSource);
        } else {
          toast.error('Modelo de transcrição não disponível', {
            description: 'Baixe um modelo de transcrição antes de iniciar a gravação.',
            duration: 5000,
          });
          showModal?.('modelSelector', 'Configuração de modelo de transcrição necessária');
          Analytics.trackButtonClick('start_recording_blocked_missing', trackingSource);
        }
        setStatus(RecordingStatus.IDLE);
        return;
      }

      // 3. Prepare meeting title & starting status
      const randomTitle = generateMeetingTitle();
      setMeetingTitle(randomTitle);
      setStatus(RecordingStatus.STARTING, 'Iniciando gravação...');

      // 4. Clear previous transcripts before initiating backend recording
      clearTranscripts();

      // 5. Start the actual backend recording
      console.log(`[RecordingStart] ${triggerSource} starting backend recording with meeting:`, randomTitle);
      await recordingService.startRecordingWithDevices(
        selectedDevices?.micDevice || null,
        selectedDevices?.systemDevice || null,
        randomTitle
      );
      console.log(`[RecordingStart] ${triggerSource} backend recording started successfully`);

      // 6. Update UI state after successful backend start
      setIsRecording(true);
      setIsMeetingActive(true);
      Analytics.trackButtonClick('start_recording', triggerSource === 'manual' ? 'home_page' : triggerSource);

      // Show recording notification if enabled
      await showRecordingNotification();
    } catch (error) {
      console.error(`[RecordingStart] ${triggerSource} failed:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      const trackingSource = triggerSource === 'manual' ? 'home_page' : triggerSource;

      // When backend rejects because recording is already active, adopt the active backend session
      // rather than restoring a blind snapshot of previous meeting's transcripts.
      if (errorMsg.includes('already in progress') || errorMsg.includes('already active')) {
        console.warn(`[RecordingStart] ${triggerSource} rejected because recording is already active - adopting active session`);
        try {
          const backendMeetingId = await recordingService.getCurrentMeetingId();
          if (backendMeetingId) {
            console.log('[RecordingStart] Adopted active backend meeting ID:', backendMeetingId);
          }
        } catch (syncErr) {
          console.warn('[RecordingStart] Failed to query active meeting ID on duplicate start:', syncErr);
        }
        setStatus(RecordingStatus.RECORDING);
        setIsRecording(true);
        setIsMeetingActive(true);
        Analytics.trackButtonClick('start_recording_error', trackingSource);
        return;
      }

      clearTranscripts(); // Keep session inactive on error
      const isRuntimeError = isTranscriptionRuntimeStartError(error);
      if (errorMsg.includes('Recording start timed out')) {
        toast.error('Tempo limite para iniciar a gravação esgotado — por favor, tente novamente');
      }

      setStatus(RecordingStatus.ERROR, isRuntimeError
        ? TRANSCRIPTION_RUNTIME_USER_MESSAGE
        : errorMsg);
      setIsRecording(false);
      setIsMeetingActive(false);
      Analytics.trackButtonClick('start_recording_error', trackingSource);

      if (isRuntimeError) return;

      if (triggerSource === 'manual') {
        throw error;
      } else {
        alert(`Falha ao iniciar a gravação.\n\n${errorMsg}`);
      }
    } finally {
      isStartingRef.current = false;
      setIsAutoStarting(false);
    }
  }, [
    isRecording,
    setIsRecording,
    clearTranscripts,
    generateMeetingTitle,
    setMeetingTitle,
    setIsMeetingActive,
    checkTranscriptionModelReady,
    checkIfModelDownloading,
    selectedDevices,
    showModal,
    setStatus,
  ]);

  const handleRecordingStart = useCallback(async () => {
    return executeRecordingStart('manual');
  }, [executeRecordingStart]);

  // Check for autoStartRecording flag and start recording automatically
  useEffect(() => {
    const checkAutoStartRecording = async () => {
      if (typeof window !== 'undefined') {
        const shouldAutoStart = sessionStorage.getItem('autoStartRecording');
        if (shouldAutoStart === 'true' && !isRecording && !isStartingRef.current) {
          console.log('Auto-starting recording from navigation...');
          sessionStorage.removeItem('autoStartRecording');
          executeRecordingStart('sidebar_auto');
        }
      }
    };

    checkAutoStartRecording();
  }, [isRecording, executeRecordingStart]);

  // Listen for direct recording trigger from sidebar when already on home page
  useEffect(() => {
    const handleDirectStart = () => {
      executeRecordingStart('sidebar_direct');
    };

    window.addEventListener('start-recording-from-sidebar', handleDirectStart);

    return () => {
      window.removeEventListener('start-recording-from-sidebar', handleDirectStart);
    };
  }, [executeRecordingStart]);

  return {
    handleRecordingStart,
    isAutoStarting,
  };
}
