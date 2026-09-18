'use client';

import React, { useState, useEffect } from 'react';
import { useMeetingCopilot } from '@/hooks/useMeetingCopilot';
import { EvidenceCard } from '@/components/Copilot/EvidenceCard';
import {
  Sparkles,
  Pin,
  PinOff,
  Copy,
  Check,
  Zap,
  X,
  Minus,
  ShieldCheck,
  Layers,
  RotateCcw,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CopilotOverlayPage() {
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
    checkConnection
  } = useMeetingCopilot();

  const [isPinned, setIsPinned] = useState(true);
  const [copied, setCopied] = useState(false);
  const availableScopes = ['backend', 'arquitetura', 'incidentes', 'java', 'banco', 'todos'];

  // Tauri window handler (com fallback seguro para navegador comum)
  const togglePin = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const next = !isPinned;
      await win.setAlwaysOnTop(next);
      setIsPinned(next);
      toast.info(next ? 'Janela fixada no topo' : 'Janela desafixada');
    } catch {
      setIsPinned(!isPinned);
    }
  };

  const minimizeWindow = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.minimize();
    } catch {
      // Ignorar fora do Tauri
    }
  };

  const closeWindow = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.close();
    } catch {
      window.close();
    }
  };

  const handleCopy = () => {
    if (!streamingAnswer) return;
    navigator.clipboard.writeText(streamingAnswer);
    setCopied(true);
    toast.success('Copiado!');
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

  return (
    <div className="h-screen w-screen bg-slate-900/95 text-slate-100 flex flex-col select-none border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Barra de Título Arrastável (Drag Region) */}
      <header
        data-tauri-drag-region
        className="h-10 px-3 bg-slate-800/90 border-b border-slate-700/60 flex items-center justify-between cursor-move shrink-0"
      >
        <div className="flex items-center space-x-2 pointer-events-none">
          <div className="p-1 bg-indigo-500 rounded-md text-white shadow-xs">
            <Sparkles size={13} />
          </div>
          <span className="text-xs font-semibold tracking-wide text-slate-200">
            Copilot Overlay
          </span>
          <span className="flex items-center space-x-0.5 text-[10px] text-emerald-400 font-medium px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-800/50 rounded">
            <ShieldCheck size={11} />
            <span>Discreto</span>
          </span>
        </div>

        {/* Botões de Ação da Janela */}
        <div className="flex items-center space-x-1 pointer-events-auto">
          <button
            onClick={togglePin}
            className={`p-1 rounded transition-colors ${
              isPinned
                ? 'text-indigo-400 bg-indigo-950/80 border border-indigo-700/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title={isPinned ? 'Desafixar do topo' : 'Fixar sempre no topo'}
          >
            {isPinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>

          <button
            onClick={minimizeWindow}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
            title="Minimizar"
          >
            <Minus size={13} />
          </button>

          <button
            onClick={closeWindow}
            className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors"
            title="Fechar"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {/* Controles de Disparo e Escopos */}
      <div className="px-3 py-2 bg-slate-800/40 border-b border-slate-700/40 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsAutoTrigger(!isAutoTrigger)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              isAutoTrigger
                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {isAutoTrigger ? '⚡ Auto ON' : '⏸ Auto OFF'}
          </button>

          <div className="flex gap-1 overflow-x-auto max-w-[200px] scrollbar-none">
            {availableScopes.map(scope => {
              const active = scopes.includes(scope) || (scope === 'todos' && scopes.includes('todos'));
              return (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors shrink-0 ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {scope}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          size="sm"
          className="h-6 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white gap-1 px-2 shadow-xs"
          onClick={() => triggerManual()}
          disabled={isGenerating}
        >
          <Zap size={11} />
          <span>Alt+Q</span>
        </Button>
      </div>

      {/* Corpo com Streaming e Evidências */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* Alerta de erro */}
        {error && (
          <div className="p-2.5 bg-red-950/60 border border-red-800/60 rounded-lg text-red-300 text-[11px] leading-relaxed">
            {error}
          </div>
        )}

        {/* Pergunta em Foco */}
        {currentQuestion && (
          <div className="p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-lg space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-indigo-400">Pergunta</span>
              <div className="flex items-center space-x-1">
                <span className="capitalize">{currentQuestion.reason}</span>
                <button
                  onClick={dismissQuestion}
                  className="text-slate-400 hover:text-red-400 p-0.5 rounded transition-colors"
                  title="Dispensar esta pergunta"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-100">
              "{currentQuestion.text}"
            </p>
          </div>
        )}

        {/* Resposta em Streaming */}
        {(streamingAnswer || isGenerating) && (
          <div className="p-3 bg-indigo-950/30 border border-indigo-700/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-indigo-300">
                <Sparkles size={12} className="text-indigo-400" />
                <span>Sugestão da IA</span>
                {isGenerating && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping ml-1" />
                )}
              </div>

              <div className="flex items-center space-x-1">
                {isGenerating ? (
                  <button
                    onClick={cancelGeneration}
                    className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-950/50"
                  >
                    Parar
                  </button>
                ) : (
                  <>
                    <button
                      onClick={regenerateAnswer}
                      className="text-[10px] text-slate-300 hover:text-indigo-300 px-1.5 py-0.5 rounded hover:bg-slate-700 flex items-center space-x-1"
                      title="Regerar sugestão"
                    >
                      <RotateCcw size={10} />
                      <span>Regerar</span>
                    </button>
                    <button
                      onClick={handleCopy}
                      className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-700 flex items-center space-x-1"
                    >
                      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copied ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="text-[12px] text-slate-200 leading-relaxed font-sans select-text whitespace-pre-wrap">
              {streamingAnswer}
              {isGenerating && (
                <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}

        {/* Evidências Encontradas */}
        {evidence.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center space-x-1 text-[10px] text-slate-400 font-medium">
              <Layers size={11} />
              <span>Contexto Citado ({evidence.length})</span>
            </div>
            <div className="space-y-1.5">
              {evidence.map((item, idx) => (
                <EvidenceCard key={`${item.documentId}-${idx}`} evidence={item} />
              ))}
            </div>
          </div>
        )}

        {/* Estado Ocioso */}
        {!currentQuestion && !streamingAnswer && !isGenerating && (
          <div className="text-center py-8 px-2 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center mx-auto text-indigo-400 shadow-inner">
              <Sparkles size={18} />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Pronto. Pressione <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-indigo-300 font-mono">Alt + Q</kbd> durante a reunião para sugerir uma resposta sobre a última fala.
            </p>
          </div>
        )}
      </main>

      {/* Rodapé */}
      <footer className="h-7 px-3 bg-slate-800/80 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
        <div className="flex items-center space-x-1.5 truncate max-w-[200px]" title={health?.statusText || `Modelo: ${activeModel} (${activeProvider})`}>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isCheckingHealth
                ? 'bg-amber-400 animate-ping'
                : health && !health.ok
                  ? 'bg-red-400'
                  : 'bg-emerald-400'
            }`}
          />
          <span className="truncate">{activeModel}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => checkConnection()}
            disabled={isCheckingHealth}
            className="hover:text-slate-200 transition-colors p-0.5 rounded"
            title="Verificar conectividade com LM Studio / Ollama"
          >
            <Activity size={11} className={isCheckingHealth ? "animate-spin text-amber-400" : ""} />
          </button>
          <button
            onClick={clearState}
            className="hover:text-slate-200 flex items-center space-x-1 transition-colors"
            title="Limpar sugestões"
          >
            <RotateCcw size={11} />
            <span>Limpar</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
