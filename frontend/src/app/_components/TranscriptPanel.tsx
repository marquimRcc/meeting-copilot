import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { PermissionWarning } from '@/components/PermissionWarning';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, GlobeIcon, Sparkles } from 'lucide-react';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { ModalType } from '@/hooks/useModalState';
import { useIsLinux } from '@/hooks/usePlatform';
import { useMemo } from 'react';

/**
 * TranscriptPanel Component
 *
 * Displays transcript content with controls for copying and language settings.
 * Uses TranscriptContext, ConfigContext, and RecordingStateContext internally.
 */

interface TranscriptPanelProps {
  // indicates stop-processing state for transcripts; derived from backend statuses.
  isProcessingStop: boolean;
  isStopping: boolean;
  showModal: (name: ModalType, message?: string) => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
  hasCopilotSuggestion?: boolean;
  isCopilotGenerating?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TranscriptPanel({
  isProcessingStop,
  isStopping,
  showModal,
  isCopilotOpen = true,
  onToggleCopilot,
  hasCopilotSuggestion = false,
  isCopilotGenerating = false,
  isCollapsed = false,
  onToggleCollapse,
}: TranscriptPanelProps) {
  // Contexts
  const { transcripts, transcriptContainerRef, copyTranscript } = useTranscripts();
  const { transcriptModelConfig } = useConfig();
  const { isRecording, isPaused } = useRecordingState();
  const { checkPermissions, isChecking, hasSystemAudio, hasMicrophone } = usePermissionCheck();
  const isLinux = useIsLinux();

  // Convert transcripts to segments for virtualized view
  const segments = useMemo(() =>
    transcripts.map(t => ({
      id: t.id,
      timestamp: t.audio_start_time ?? 0,
      endTime: t.audio_end_time,
      text: t.text,
      confidence: t.confidence,
      source: t.source,
      speaker: t.speaker,
    })),
    [transcripts]
  );

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-gray-200 bg-gray-50/80 flex flex-col items-center py-4 justify-between select-none shrink-0 transition-all duration-200">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 shadow-xs transition-colors"
          title="Expandir Transcrição de Áudio"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        <div className="writing-vertical text-xs font-semibold text-gray-400 tracking-wider flex items-center gap-2 rotate-180" style={{ writingMode: 'vertical-rl' }}>
          <span>TRANSCRIÇÃO ({transcripts.length})</span>
        </div>
        <div />
      </div>
    );
  }

  return (
    <div
      ref={transcriptContainerRef}
      className="w-80 lg:w-96 border-r border-gray-200 bg-white flex flex-col overflow-y-auto shrink-0 transition-all duration-200"
    >
      {/* Title area - Sticky header */}
      <div className="sticky top-0 z-10 bg-white p-3.5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">Áudio da Call</span>
            <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
              {transcripts.length}
            </span>
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Recolher transcrição (Modo 100% Foco na Resposta)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex flex-col space-y-3">
          <div className="flex  flex-col space-y-2">
            <div className="flex justify-center  items-center space-x-2">
              <ButtonGroup>
                {onToggleCopilot && (
                  <Button
                    variant={isCopilotOpen ? "secondary" : "outline"}
                    size="sm"
                    onClick={onToggleCopilot}
                    title="Alternar Meeting Copilot (Alt+Q)"
                    className={`relative transition-colors ${
                      isCopilotOpen
                        ? "text-indigo-600 bg-indigo-50 border-indigo-200 font-medium"
                        : hasCopilotSuggestion
                          ? "border-indigo-400 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/60 font-medium shadow-xs"
                          : ""
                    }`}
                  >
                    <Sparkles
                      className={`mr-1 ${
                        isCopilotGenerating ? "animate-spin text-amber-500" : "text-indigo-600"
                      }`}
                      size={14}
                    />
                    <span>Copilot</span>
                    {/* Indicador visual / pulso discreto de notificação quando houver pergunta ou sugestão com painel fechado */}
                    {!isCopilotOpen && (hasCopilotSuggestion || isCopilotGenerating) && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span
                          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            isCopilotGenerating ? "bg-amber-400" : "bg-indigo-400"
                          }`}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            isCopilotGenerating ? "bg-amber-500" : "bg-indigo-600"
                          }`}
                        />
                      </span>
                    )}
                  </Button>
                )}
                {transcripts?.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyTranscript}
                    title="Copiar Transcrição"
                  >
                    <Copy />
                    <span className='hidden md:inline'>
                      Copiar
                    </span>
                  </Button>
                )}
                {transcriptModelConfig.provider === "localWhisper" &&
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => showModal('languageSettings')}
                    title="Idioma"
                  >
                    <GlobeIcon />
                    <span className='hidden md:inline'>
                      Idioma
                    </span>
                  </Button>
                }
              </ButtonGroup>
            </div>
          </div>
        </div>
      </div>

      {/* Permission Warning - Not needed on Linux */}
      {!isRecording && !isChecking && !isLinux && (
        <div className="flex justify-center px-4 pt-4">
          <PermissionWarning
            hasMicrophone={hasMicrophone}
            hasSystemAudio={hasSystemAudio}
            onRecheck={checkPermissions}
            isRechecking={isChecking}
          />
        </div>
      )}

      {/* Transcript content */}
      <div className="pb-20">
        <div className="flex justify-center">
          <div className="w-2/3 max-w-[750px]">
            <VirtualizedTranscriptView
              segments={segments}
              isRecording={isRecording}
              isPaused={isPaused}
              isProcessing={isProcessingStop}
              isStopping={isStopping}
              enableStreaming={isRecording}
              showConfidence={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
