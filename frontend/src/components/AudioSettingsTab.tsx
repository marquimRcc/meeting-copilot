'use client';

import React, { useState, useEffect } from 'react';
import { DeviceSelection, SelectedDevices } from '@/components/DeviceSelection';
import { AudioBackendSelector } from '@/components/AudioBackendSelector';
import { invoke } from '@tauri-apps/api/core';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { toast } from 'sonner';
import { Volume2, Mic, Info } from 'lucide-react';

export interface RecordingPreferences {
  save_folder: string;
  auto_save: boolean;
  file_format: string;
  preferred_mic_device: string | null;
  preferred_system_device: string | null;
}

export function AudioSettingsTab() {
  const { selectedDevices, setSelectedDevices } = useConfig();
  const { isRecording } = useRecordingState();
  const [preferences, setPreferences] = useState<RecordingPreferences>({
    save_folder: '',
    auto_save: true,
    file_format: 'mp4',
    preferred_mic_device: null,
    preferred_system_device: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await invoke<RecordingPreferences>('get_recording_preferences');
        setPreferences(prefs);
      } catch (error) {
        console.error('Failed to load recording preferences:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, []);

  const handleDeviceChange = async (devices: SelectedDevices) => {
    const newPreferences = {
      ...preferences,
      preferred_mic_device: devices.micDevice,
      preferred_system_device: devices.systemDevice,
    };
    setPreferences(newPreferences);
    setSelectedDevices(devices);
    setSaving(true);
    try {
      await invoke('set_recording_preferences', { preferences: newPreferences });
      const micDevice = devices.micDevice || 'Padrão do Sistema';
      const systemDevice = devices.systemDevice || 'Padrão do Sistema';
      toast.success('Dispositivos de áudio atualizados', {
        description: `Microfone: ${micDevice} | Áudio/Fone: ${systemDevice}`,
      });
    } catch (error) {
      console.error('Failed to save device preferences:', error);
      toast.error('Erro ao salvar preferências de áudio');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Dispositivos de Áudio</h3>
        <p className="text-sm text-gray-600">
          Escolha o microfone e o fone/saída de áudio que devem ser utilizados nas reuniões e no Copiloto.
        </p>
      </div>

      {isRecording && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Gravação em andamento. A alteração de dispositivos de áudio fica disponível quando a gravação for finalizada.
          </span>
        </div>
      )}

      {/* Dispositivos de Entrada e Saída */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <Volume2 className="w-5 h-5 text-indigo-600" />
          <h4 className="font-semibold text-gray-800 text-sm">Seleção de Dispositivos (Microfone e Fone)</h4>
        </div>

        <DeviceSelection
          selectedDevices={{
            micDevice: preferences.preferred_mic_device,
            systemDevice: preferences.preferred_system_device,
          }}
          onDeviceChange={handleDeviceChange}
          disabled={saving || isRecording}
        />
      </div>

      {/* Backend do Áudio */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <Mic className="w-5 h-5 text-indigo-600" />
          <h4 className="font-semibold text-gray-800 text-sm">Servidor / Backend do Sistema de Áudio</h4>
        </div>
        <p className="text-xs text-gray-600">
          O backend gerencia como o áudio do sistema e do microfone é capturado (ALSA/PulseAudio/PipeWire no Linux).
        </p>
        <AudioBackendSelector disabled={saving || isRecording} />
      </div>
    </div>
  );
}
