'use client';

import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks';

/**
 * Polyfill e Mock automático para execução no navegador (fora do WebView do Tauri).
 * Quando a aplicação é aberta diretamente no Chrome/Firefox/Brave (ex: http://localhost:3118),
 * provê mocks para o IPC, sistema operacional e eventos, evitando crashes e permitindo testar
 * a interface do Copiloto, telas e conexões locais sem necessidade do binário Tauri em execução.
 *
 * No executável desktop nativo (.AppImage), o Tauri já provê window.__TAURI_INTERNALS__.invoke
 * nativamente e este polyfill não sobrescreve nada.
 */
if (typeof window !== 'undefined') {
  const isTauriDesktop =
    typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function' &&
    !(window as any).__TAURI_INTERNALS__?.__isMock;

  if (!isTauriDesktop) {
    // 1. Mock do plugin OS
    if (!(window as any).__TAURI_OS_PLUGIN_INTERNALS__) {
      (window as any).__TAURI_OS_PLUGIN_INTERNALS__ = {
        platform: 'linux',
        version: '6.0.0',
        family: 'unix',
        type: 'Linux',
        arch: 'x86_64',
        exeExtension: '',
        locale: navigator.language || 'pt-BR',
      };
    }

    // 2. Mock de janelas
    mockWindows('main', 'copilot-overlay');
    mockConvertFileSrc('linux');

    // 3. Mock do IPC
    mockIPC(
      async (cmd, args) => {
        switch (cmd) {
          case 'check_onboarding_status_cmd':
            return { is_completed: true };
          case 'plugin:os|platform':
            return 'linux';
          case 'plugin:app|version':
          case 'get_app_version':
            return '0.4.1';
          case 'plugin:app|name':
            return 'meetily';
          case 'api_get_transcript_config':
            return {
              model: 'small',
              language: 'auto',
              prompt: '',
              temperature: 0.0,
            };
          case 'api_get_model_config':
            return {
              selected_provider: 'lmstudio',
              selected_model: 'local-model',
              lm_studio_endpoint: 'http://127.0.0.1:1234',
              ollama_endpoint: 'http://127.0.0.1:11434',
            };
          case 'get_audio_devices':
            return {
              devices: [
                { id: 'default', name: 'Dispositivo Padrão' },
                { id: 'none', name: 'Nenhum Microfone (Apenas Interlocutor)' },
              ],
            };
          case 'builtin_ai_list_models':
            return [];
          case 'is_analytics_enabled':
          case 'is_analytics_session_active':
            return false;
          case 'get_recording_state':
            return {
              is_recording: false,
              meeting_id: null,
              is_paused: false,
              is_active: false,
              recording_duration: null,
              active_duration: null,
            };
          case 'is_recording':
            return false;
          case 'get_current_meeting_id':
          case 'get_recording_meeting_name':
          case 'get_meeting_folder_path':
          case 'cleanup_checkpoints':
            return null;
          case 'get_transcript_history':
            return [];
          case 'get_onboarding_status': {
            if (typeof localStorage !== 'undefined') {
              const saved = localStorage.getItem('mock_onboarding_status');
              if (saved) {
                try {
                  return JSON.parse(saved);
                } catch (e) {
                  // ignore JSON parse errors
                }
              }
            }
            return null;
          }
          case 'save_onboarding_status_cmd': {
            if (typeof localStorage !== 'undefined' && (args as any)?.status) {
              try {
                localStorage.setItem('mock_onboarding_status', JSON.stringify((args as any).status));
              } catch (e) {
                // ignore storage quota errors
              }
            }
            return true;
          }
          case 'complete_onboarding': {
            if (typeof localStorage !== 'undefined') {
              try {
                const prev = localStorage.getItem('mock_onboarding_status');
                let statusObj: any = {};
                if (prev) {
                  try {
                    statusObj = JSON.parse(prev);
                  } catch (e) {}
                }
                statusObj.completed = true;
                statusObj.current_step = 4;
                statusObj.model_status = {
                  parakeet: 'downloaded',
                  summary: 'downloaded',
                  selected_summary_model: (args as any)?.model || 'gemma-2-2b-it',
                };
                localStorage.setItem('mock_onboarding_status', JSON.stringify(statusObj));
              } catch (e) {}
            }
            return true;
          }
          case 'builtin_ai_get_recommended_model':
            return 'gemma-2-2b-it';
          case 'builtin_ai_is_model_ready':
            return true;
          case 'builtin_ai_download_model': {
            const modelName = (args as any)?.modelName || 'gemma-2-2b-it';
            setTimeout(async () => {
              try {
                const { emit } = await import('@tauri-apps/api/event');
                await emit('builtin-ai-download-progress', {
                  model: modelName,
                  progress: 100,
                  downloaded_mb: 1500,
                  total_mb: 1500,
                  speed_mbps: 35,
                  status: 'completed',
                });
              } catch (e) {
                console.warn('[MockIPC] Failed to emit builtin_ai progress:', e);
              }
            }, 400);
            return true;
          }
          case 'parakeet_init':
            return null;
          case 'parakeet_has_available_models':
            return true;
          case 'parakeet_validate_model_ready':
            return 'ready';
          case 'parakeet_get_available_models':
            return [
              {
                name: 'parakeet-tdt-0.6b-v3-int8',
                status: 'Available',
                size_mb: 670,
                speed: 'Ultra Fast (v3)',
                quantization: 'Int8',
                description: 'Real time on M4 Max, latest version with int8 quantization',
                path: '/mock/models/parakeet',
              },
            ];
          case 'parakeet_download_model':
          case 'parakeet_retry_download': {
            const modelName = (args as any)?.modelName || 'parakeet-tdt-0.6b-v3-int8';
            setTimeout(async () => {
              try {
                const { emit } = await import('@tauri-apps/api/event');
                await emit('parakeet-model-download-progress', {
                  modelName,
                  progress: 45,
                  downloaded_bytes: 300 * 1024 * 1024,
                  total_bytes: 670 * 1024 * 1024,
                  downloaded_mb: 300.0,
                  total_mb: 670.0,
                  speed_mbps: 25.0,
                  status: 'downloading',
                });
                setTimeout(async () => {
                  await emit('parakeet-model-download-progress', {
                    modelName,
                    progress: 100,
                    downloaded_bytes: 670 * 1024 * 1024,
                    total_bytes: 670 * 1024 * 1024,
                    downloaded_mb: 670.0,
                    total_mb: 670.0,
                    speed_mbps: 30.0,
                    status: 'completed',
                  });
                  await emit('parakeet-model-download-complete', { modelName });
                }, 500);
              } catch (e) {
                console.warn('[MockIPC] Failed to emit parakeet progress:', e);
              }
            }, 300);
            return true;
          }
          case 'get_recording_preferences':
            return { micDevice: 'none' };
          case 'set_recording_preferences':
          case 'set_language_preference':
          case 'set_notification_settings':
          case 'initialize_fresh_database':
            return true;
          case 'get_ollama_models':
            return [];
          case 'init_analytics':
          case 'disable_analytics':
          case 'track_event':
          case 'identify_user':
          case 'start_analytics_session':
          case 'end_analytics_session':
          case 'track_daily_active_user':
          case 'track_user_first_launch':
          case 'track_meeting_started':
          case 'track_recording_started':
          case 'track_recording_stopped':
          case 'track_meeting_deleted':
          case 'track_settings_changed':
          case 'track_feature_used':
            return true;
          default:
            return null;
        }
      },
      { shouldMockEvents: true }
    );

    // Marcação para identificação do mock
    if ((window as any).__TAURI_INTERNALS__) {
      (window as any).__TAURI_INTERNALS__.__isMock = true;
    }
  }
}
