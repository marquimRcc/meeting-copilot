import React, { useState } from 'react';
import { useMeetingCopilot } from '@/hooks/useMeetingCopilot';
import { EvidenceCard } from './EvidenceCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Mic,
  Send,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Maximize2
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
    toggleRemoteOnly,
    isRecording
  } = copilot;

  const [copied, setCopied] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showToolsDrawer, setShowToolsDrawer] = useState(false);
  const availableScopes = ['backend', 'arquitetura', 'incidentes', 'java', 'banco', 'todos'];

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!streamingAnswer) return;
    navigator.clipboard.writeText(streamingAnswer);
    setCopied(true);
    toast.success('Resposta copiada para a área de transferência');
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
          width: 480,
          height: 640,
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
      window.open('/copilot-overlay', 'copilot-overlay', 'width=480,height=640,menubar=no,toolbar=no,location=no');
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-hidden relative">
      {/* Topo Compacto: Status e Ações */}
      <header className="px-6 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between shadow-2xs z-10">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="p-1 bg-indigo-600 rounded-md text-white shadow-xs">
              <Sparkles size={15} />
            </div>
            <span className="text-xs font-bold text-gray-900 tracking-tight">RESPOSTA EM FOCO</span>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Badges de Estado */}
          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => setIsAutoTrigger(!isAutoTrigger)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center space-x-1 ${
                isAutoTrigger
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Detectar perguntas automaticamente na fala do fone"
            >
              <span>{isAutoTrigger ? '⚡ Detecção Automática' : '⏸ Detecção Pausada'}</span>
            </button>

            <button
              onClick={() => toggleRemoteOnly()}
              disabled={isRecording}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center space-x-1 ${
                isRecording
                  ? 'opacity-60 cursor-not-allowed bg-gray-100 text-gray-400 border border-gray-200'
                  : isRemoteOnly
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={
                isRecording
                  ? 'Configuração travada durante a gravação ativa'
                  : isRemoteOnly
                    ? 'Capturando somente o áudio do fone/interlocutor (Microfone mudo)'
                    : 'Modo Padrão: Grava microfone e áudio'
              }
            >
              {isRemoteOnly ? (
                <>
                  <Volume2 size={12} className="text-indigo-600" />
                  <span>Somente Fone</span>
                </>
              ) : (
                <>
                  <Mic size={12} className="text-gray-500" />
                  <span>Mic + Fone</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Ações e Controles à Direita */}
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 px-3 shadow-xs font-medium"
            onClick={() => triggerManual()}
            disabled={isGenerating}
            title="Disparar resposta sobre a última fala (Alt + Q)"
          >
            <Zap size={13} />
            <span>Sugerir (Alt+Q)</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={`h-7 text-xs px-2 gap-1 ${showToolsDrawer ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900'}`}
            onClick={() => setShowToolsDrawer(prev => !prev)}
            title="Abrir pergunta manual e escopos"
          >
            <SlidersHorizontal size={13} />
            <span className="hidden sm:inline">Ajustes</span>
            {showToolsDrawer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </Button>

          <button
            onClick={openOverlayWindow}
            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors"
            title="Destacar para Janela Flutuante (Always-on-Top)"
          >
            <ExternalLink size={15} />
          </button>
        </div>
      </header>

      {/* Gaveta de Controles Secundários (Manual Input & Escopos) */}
      {showToolsDrawer && (
        <div className="px-6 py-3 bg-white border-b border-gray-200 space-y-3 animate-in fade-in duration-150">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualInput.trim()) {
                triggerManual(manualInput.trim());
                setManualInput('');
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Digite ou cole uma pergunta específica da entrevista..."
              className="flex-1 text-xs px-3 py-2 rounded-md border border-gray-200 focus:outline-none focus:border-indigo-500 text-gray-800 placeholder-gray-400 bg-slate-50/50"
              disabled={isGenerating}
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3"
              disabled={isGenerating || !manualInput.trim()}
            >
              <Send size={12} className="mr-1" />
              <span>Enviar Pergunta</span>
            </Button>
          </form>

          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <Tag size={12} className="shrink-0" />
            <span className="font-medium text-[11px]">Tags ativas:</span>
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
        </div>
      )}

      {/* ÁREA NOBRE: Teleprompter da Resposta */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 max-w-5xl w-full mx-auto pb-28">
        {/* Alerta de Erro de Conexão */}
        {error && (
          <div className="p-3.5 bg-red-50/90 border border-red-200 rounded-xl flex flex-col space-y-2 text-xs text-red-700">
            <div className="flex items-start space-x-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">Falha na chamada do modelo de IA</p>
                <p className="text-xs text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={() => checkConnection()}
              disabled={isCheckingHealth}
              className="self-start text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-md flex items-center space-x-1.5 transition-colors"
            >
              <Activity size={13} className={isCheckingHealth ? "animate-spin text-red-600" : ""} />
              <span>{isCheckingHealth ? "Testando conexão..." : "Testar Servidor LM Studio"}</span>
            </button>
          </div>
        )}

        {/* Pergunta em Foco (Banner Elegante e Sutil) */}
        {currentQuestion && (
          <div className="bg-white border-l-4 border-indigo-600 rounded-r-xl p-3.5 shadow-xs flex items-center justify-between gap-3 border-y border-r border-gray-200/70">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center space-x-2 text-[10px] uppercase font-bold tracking-wider text-indigo-600">
                <span>Pergunta Detectada</span>
                <span className="text-gray-300">•</span>
                <span className="text-gray-400 lowercase font-normal">{currentQuestion.reason}</span>
              </div>
              <p className="text-sm md:text-base font-semibold text-gray-900 leading-snug truncate md:whitespace-normal">
                "{currentQuestion.text}"
              </p>
            </div>
            <button
              onClick={dismissQuestion}
              className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 transition-colors shrink-0"
              title="Dispensar esta pergunta"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Resposta Principal Formatada (Teleprompter) */}
        {(streamingAnswer || isGenerating) && (
          <article className="bg-white border border-gray-200/90 rounded-2xl shadow-sm p-6 space-y-4 transition-all">
            {/* Barra de Ações Rápidas da Resposta */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                  <Sparkles size={13} className="mr-1 text-indigo-600" />
                  Sugestão Direta
                </span>
                {isGenerating && (
                  <span className="flex items-center text-xs font-semibold text-amber-600 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1.5 animate-ping" />
                    Gerando resposta...
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-1.5">
                {isGenerating ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5"
                    onClick={cancelGeneration}
                  >
                    Interromper
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-gray-600 hover:text-indigo-600 px-2.5 gap-1.5"
                      onClick={regenerateAnswer}
                      title="Regerar resposta para esta pergunta"
                    >
                      <RotateCcw size={12} />
                      <span>Regerar</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-gray-700 hover:text-gray-900 px-3 gap-1.5 font-medium"
                      onClick={handleCopy}
                    >
                      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      <span>{copied ? 'Copiado' : 'Copiar'}</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Texto Renderizado em Markdown com Tipografia de Alta Legibilidade */}
            <div className="prose prose-slate max-w-none text-slate-900 text-sm md:text-base leading-relaxed tracking-normal font-sans">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-gray-900 mt-3 mb-1" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-base font-bold text-gray-800 mt-2.5 mb-1" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-gray-800 mt-2 mb-1" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-2 leading-relaxed text-gray-800 font-normal" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1 text-gray-800 font-normal" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-gray-800 font-normal" {...props} />,
                  li: ({ node, ...props }) => <li className="leading-snug" {...props} />,
                  strong: ({ node, ...props }) => <strong className="font-semibold text-indigo-950" {...props} />,
                  code: ({ inline, className, children, ...props }: any) => {
                    return inline ? (
                      <code className="bg-slate-100 text-indigo-800 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-200" {...props}>
                        {children}
                      </code>
                    ) : (
                      <pre className="bg-slate-900 text-slate-100 rounded-lg p-3.5 my-2 text-xs font-mono overflow-x-auto">
                        <code {...props}>{children}</code>
                      </pre>
                    );
                  }
                }}
              >
                {streamingAnswer}
              </ReactMarkdown>

              {isGenerating && (
                <span className="inline-block w-2 h-4 bg-indigo-600 ml-1 animate-pulse align-middle" />
              )}
            </div>
          </article>
        )}

        {/* Fatos e Contextos Utilizados (Discreto no rodapé da resposta) */}
        {evidence.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center space-x-1.5 text-xs text-gray-500 font-medium">
              <Layers size={13} />
              <span>Contextos e Documentos Referenciados ({evidence.length})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {evidence.map((item, idx) => (
                <EvidenceCard key={`${item.documentId}-${item.paragraph}-${idx}`} evidence={item} />
              ))}
            </div>
          </div>
        )}

        {/* Estado Vazio Inicial */}
        {!currentQuestion && !streamingAnswer && !isGenerating && (
          <div className="text-center py-20 px-4 space-y-3 bg-white/60 border border-dashed border-gray-200 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto text-indigo-600 shadow-inner">
              <Sparkles size={26} />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-sm font-bold text-gray-900">Aguardando Pergunta da Call</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Assim que o entrevistador fizer uma pergunta no fone, a resposta aparecerá aqui em tempo real formatada para leitura imediata. Você também pode disparar manualmente pressionando <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[11px] font-mono">Alt + Q</kbd>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Barra Inferior Fixa com Detalhes do Modelo e Limpar */}
      <footer className="px-6 py-2.5 border-t border-gray-200 bg-white flex items-center justify-between text-xs text-gray-500 z-10">
        <div className="flex items-center space-x-2" title={health?.statusText || `Modelo: ${activeModel} (${activeProvider})`}>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isCheckingHealth
                ? 'bg-amber-400 animate-ping'
                : health && !health.ok
                  ? 'bg-red-500'
                  : 'bg-emerald-500'
            }`}
          />
          <span className="font-semibold text-gray-800">{activeModel}</span>
          <span className="text-gray-400 text-[11px]">via {activeProvider}</span>
          {health?.latencyMs !== undefined && health.ok && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.2 rounded font-mono">
              {health.latencyMs}ms
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => checkConnection()}
            disabled={isCheckingHealth}
            className="hover:text-indigo-600 p-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1 text-[11px]"
            title="Testar Conexão com LM Studio"
          >
            <Activity size={12} className={isCheckingHealth ? "animate-spin text-amber-500" : ""} />
            <span>Verificar LM Studio</span>
          </button>

          <button
            onClick={clearState}
            className="hover:text-gray-800 flex items-center space-x-1 p-1 rounded hover:bg-gray-100 text-[11px]"
            title="Limpar resposta atual e histórico da tela"
          >
            <RotateCcw size={12} />
            <span>Limpar Tela</span>
          </button>
        </div>
      </footer>
    </main>
  );
};

