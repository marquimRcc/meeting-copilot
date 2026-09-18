import React, { useState } from 'react';
import { useMeetingCopilot } from '@/hooks/useMeetingCopilot';
import { EvidenceCard } from './EvidenceCard';
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Tag,
  X,
  Layers,
  AlertCircle,
  ExternalLink,
  Activity,
  Volume2,
  Mic
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import type { UseMeetingCopilotReturn } from '@/hooks/useMeetingCopilot';

export interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  copilot?: UseMeetingCopilotReturn;
}

export const CopilotPanel: React.FC<CopilotPanelProps> = ({ isOpen, onClose, copilot }) => {
  if (copilot) {
    return <CopilotPanelContent isOpen={isOpen} onClose={onClose} copilot={copilot} />;
  }
  return <CopilotPanelWithInternalHook isOpen={isOpen} onClose={onClose} />;
};

const CopilotPanelWithInternalHook: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const copilot = useMeetingCopilot();
  return <CopilotPanelContent isOpen={isOpen} onClose={onClose} copilot={copilot} />;
};

const CopilotPanelContent: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  copilot: UseMeetingCopilotReturn;
}> = ({ isOpen, onClose, copilot }) => {
  const {
    currentQuestion,
    evidence,
    streamingAnswer,
    isGenerating,
    error,
    scopes,
    setScopes,
    isAutoTrigger,
    setIsAutoTrigger,
    triggerManual,
    cancelGeneration,
    clearState,
    dismissQuestion,
    regenerateAnswer,
    activeProvider,
    activeModel,
    health,
    isCheckingHealth,
    checkConnection,
    isRemoteOnly,
    toggleRemoteOnly
  } = copilot;

  const [copied, setCopied] = useState(false);
  const availableScopes = ['backend', 'arquitetura', 'incidentes', 'java', 'banco', 'todos'];

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!streamingAnswer) return;
    navigator.clipboard.writeText(streamingAnswer);
    setCopied(true);
    toast.success('Sugestão copiada para a área de transferência');
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleScope = (scope: string) => {
    if (scope === 'todos') {
      setScopes(['todos']);
      return;
    }
    const filtered = scopes.filter(s => s !== 'todos');
    if (filtered.includes(scope)) {
      const next = filtered.filter(s => s !== scope);
      setScopes(next);
    } else {
      setScopes([...filtered, scope]);
    }
  };

  const openOverlayWindow = async () => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      let overlay = await WebviewWindow.getByLabel('copilot-overlay');
      if (overlay) {
        await overlay.show();
        await overlay.setFocus();
      } else {
        overlay = new WebviewWindow('copilot-overlay', {
          url: '/copilot-overlay',
          title: 'Meeting Copilot Overlay',
          width: 420,
          height: 580,
          alwaysOnTop: true,
          decorations: false,
          transparent: true
        });
        overlay.once('tauri://created', () => {
          overlay?.show();
          overlay?.setFocus();
        });
      }
    } catch {
      window.open('/copilot-overlay', 'copilot-overlay', 'width=420,height=580,menubar=no,toolbar=no,location=no');
    }
  };

  return (
    <aside className="w-96 border-l border-gray-200 bg-white flex flex-col h-full shadow-lg z-20 transition-all">
      {/* Cabeçalho */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 to-purple-50/30">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-600 rounded-lg text-white shadow-sm">
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 leading-none">Meeting Copilot</h2>
            <span className="text-[10px] text-gray-500 font-medium">Sugestões em tempo real</span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={openOverlayWindow}
            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors"
            title="Destacar para Janela Flutuante (Always-on-Top)"
          >
            <ExternalLink size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            title="Fechar Copiloto"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Barra de controle: Modo e Gatilho */}
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200/80 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsAutoTrigger(!isAutoTrigger)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              isAutoTrigger
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title="Detectar perguntas automaticamente na fala remota"
          >
            {isAutoTrigger ? '⚡ Auto' : '⏸ Pausado'}
          </button>

          <button
            onClick={() => toggleRemoteOnly()}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center space-x-1 ${
              isRemoteOnly
                ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 font-semibold'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title={
              isRemoteOnly
                ? 'Modo Somente Interlocutor ativo: Microfone desativado, captura apenas a saída da chamada'
                : 'Modo Padrão: Grava microfone local e áudio da chamada'
            }
          >
            {isRemoteOnly ? (
              <>
                <Volume2 size={11} className="text-indigo-600" />
                <span>Chamada</span>
              </>
            ) : (
              <>
                <Mic size={11} className="text-gray-500" />
                <span>Mic+Chamada</span>
              </>
            )}
          </button>
        </div>

        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1 px-2.5 shadow-sm"
          onClick={() => triggerManual()}
          disabled={isGenerating}
        >
          <Zap size={13} />
          <span>Sugerir (Alt+Q)</span>
        </Button>
      </div>

      {/* Seletor de Escopos */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white">
        <div className="flex items-center space-x-1 text-[11px] text-gray-500 mb-1.5">
          <Tag size={12} />
          <span>Escopos de contexto ativos:</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {availableScopes.map(scope => {
            const active = scopes.includes(scope) || (scope === 'todos' && scopes.includes('todos'));
            return (
              <button
                key={scope}
                onClick={() => toggleScope(scope)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {scope}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Erro */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex flex-col space-y-2 text-xs text-red-700">
            <div className="flex items-start space-x-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Falha na chamada do modelo</p>
                <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={() => checkConnection()}
              disabled={isCheckingHealth}
              className="self-start text-[11px] font-medium text-red-700 bg-red-100 hover:bg-red-200 px-2 py-1 rounded flex items-center space-x-1.5 transition-colors"
            >
              <Activity size={12} className={isCheckingHealth ? "animate-spin text-red-600" : ""} />
              <span>{isCheckingHealth ? "Testando conexão..." : "Testar Servidor LM Studio / Ollama"}</span>
            </button>
          </div>
        )}

        {/* Pergunta Atual */}
        {currentQuestion && (
          <div className="p-3 bg-white border border-indigo-100 rounded-xl shadow-xs space-y-1.5 transition-all">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-indigo-600">Pergunta em Foco</span>
              <div className="flex items-center space-x-1.5">
                <span className="capitalize">{currentQuestion.reason}</span>
                <button
                  onClick={dismissQuestion}
                  className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors"
                  title="Dispensar esta pergunta"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900 leading-snug">
              "{currentQuestion.text}"
            </p>
          </div>
        )}

        {/* Sugestão da IA (Streaming) */}
        {(streamingAnswer || isGenerating) && (
          <div className="p-3.5 bg-gradient-to-b from-indigo-50/70 to-white border border-indigo-200/80 rounded-xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-900">
                <Sparkles size={14} className="text-indigo-600" />
                <span>Sugestão Recomendada</span>
                {isGenerating && (
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-ping ml-1" />
                )}
              </div>

              <div className="flex items-center space-x-1">
                {isGenerating ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                    onClick={cancelGeneration}
                  >
                    Parar
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px] text-gray-600 hover:text-indigo-600 px-1.5 gap-1"
                      onClick={regenerateAnswer}
                      title="Regerar sugestão para a pergunta em foco"
                    >
                      <RotateCcw size={11} />
                      <span className="hidden sm:inline">Regerar</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px] text-gray-600 hover:text-gray-900 px-2 gap-1"
                      onClick={handleCopy}
                    >
                      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      <span>{copied ? 'Copiado' : 'Copiar'}</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
              {streamingAnswer}
              {isGenerating && (
                <span className="inline-block w-1.5 h-3.5 bg-indigo-600 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}

        {/* Evidências do Contexto (BM25) */}
        {evidence.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
              <div className="flex items-center space-x-1">
                <Layers size={12} />
                <span>Fatos e Contexto Utilizados ({evidence.length})</span>
              </div>
            </div>

            <div className="space-y-2">
              {evidence.map((item, idx) => (
                <EvidenceCard key={`${item.documentId}-${item.paragraph}-${idx}`} evidence={item} />
              ))}
            </div>
          </div>
        )}

        {/* Estado Vazio Inicial */}
        {!currentQuestion && !streamingAnswer && !isGenerating && (
          <div className="text-center py-10 px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto text-indigo-600 shadow-inner">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-800">Copiloto Pronto</h3>
              <p className="text-[11px] text-gray-500 mt-1 leading-normal">
                Pressione <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono">Alt + Q</kbd> a qualquer momento durante a reunião para sugerir uma resposta sobre a última fala, ou ative a detecção automática acima.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé com Indicador de Modelo e Limpar */}
      <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-[11px] text-gray-500">
        <div className="flex items-center space-x-1.5 truncate max-w-[220px]" title={health?.statusText || `Modelo: ${activeModel} (${activeProvider})`}>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isCheckingHealth
                ? 'bg-amber-400 animate-ping'
                : health && !health.ok
                  ? 'bg-red-500'
                  : 'bg-emerald-500'
            }`}
          />
          <span className="truncate font-medium text-gray-700">{activeModel}</span>
          {health?.latencyMs !== undefined && health.ok && (
            <span className="text-[10px] text-gray-400 shrink-0">({health.latencyMs}ms)</span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => checkConnection()}
            disabled={isCheckingHealth}
            className="hover:text-indigo-600 p-1 rounded hover:bg-gray-100 transition-colors"
            title="Verificar conectividade com LM Studio / Ollama"
          >
            <Activity size={12} className={isCheckingHealth ? "animate-spin text-amber-500" : ""} />
          </button>
          <button
            onClick={clearState}
            className="hover:text-gray-800 flex items-center space-x-1 p-1 rounded hover:bg-gray-100"
            title="Limpar sugestões e histórico do copiloto"
          >
            <RotateCcw size={12} />
            <span>Limpar</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
