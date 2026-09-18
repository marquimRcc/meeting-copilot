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
          case 'get_recording_preferences':
            return { micDevice: 'none' };
          case 'set_recording_preferences':
          case 'set_language_preference':
          case 'set_notification_settings':
          case 'save_onboarding_status_cmd':
          case 'complete_onboarding':
          case 'initialize_fresh_database':
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
