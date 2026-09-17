import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useConfig } from '@/contexts/ConfigContext';
import {
  BM25Index,
  CopilotAssistantService,
  CopilotConfig,
  CopilotQuestion,
  CopilotSegment,
  EvidenceMatch,
  QuestionDetector,
  TranscriptBuffer
} from '@/copilot';
import defaultDocuments from '@/copilot/default-context.json';
import { toast } from 'sonner';

export interface UseMeetingCopilotReturn {
  currentQuestion: CopilotQuestion | null;
  evidence: EvidenceMatch[];
  streamingAnswer: string;
  isGenerating: boolean;
  error: string | null;
  scopes: string[];
  setScopes: (scopes: string[]) => void;
  isAutoTrigger: boolean;
  setIsAutoTrigger: (value: boolean) => void;
  triggerManual: (text?: string) => Promise<void>;
  cancelGeneration: () => void;
  clearState: () => void;
}

export function useMeetingCopilot(): UseMeetingCopilotReturn {
  const { transcripts, currentMeetingId } = useTranscripts();
  const { modelConfig, providerApiKeys, selectedDevices } = useConfig();

  const [currentQuestion, setCurrentQuestion] = useState<CopilotQuestion | null>(null);
  const [evidence, setEvidence] = useState<EvidenceMatch[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>(['backend', 'incidentes', 'java']);
  const [isAutoTrigger, setIsAutoTrigger] = useState<boolean>(false);

  // Instâncias singleton de processamento
  const bufferRef = useRef<TranscriptBuffer>(new TranscriptBuffer(currentMeetingId || 'copilot-session'));
  const detectorRef = useRef<QuestionDetector>(new QuestionDetector());
  const indexRef = useRef<BM25Index>(new BM25Index(defaultDocuments));
  const assistantRef = useRef<CopilotAssistantService>(new CopilotAssistantService());

  // Rastreamento de sessão e segmentos processados (suporte a lotes, correções e isolamento)
  const lastMeetingIdRef = useRef<string | null>(currentMeetingId);
  const processedSegmentsRef = useRef<Map<string, string>>(new Map());

  // Refs de estado para callbacks e atalhos
  const isAutoTriggerRef = useRef(isAutoTrigger);
  isAutoTriggerRef.current = isAutoTrigger;
  const scopesRef = useRef(scopes);
  scopesRef.current = scopes;
  const transcriptsRef = useRef(transcripts);
  transcriptsRef.current = transcripts;

  // Monta a configuração do provedor com base no ConfigContext do Meetily
  const getCopilotConfig = useCallback((): CopilotConfig => {
    const rawProvider = modelConfig.provider || 'ollama';
    let provider: CopilotConfig['provider'] = 'ollama';
    let endpoint: string | undefined;
    let model = modelConfig.model || '';
    let apiKey: string | undefined;

    if (rawProvider === 'ollama') {
      provider = 'ollama';
      endpoint = modelConfig.ollamaEndpoint || 'http://127.0.0.1:11434';
      model = model || 'llama3.2';
    } else if (rawProvider === 'custom-openai') {
      provider = 'custom-openai';
      endpoint = modelConfig.customOpenAIEndpoint || 'http://127.0.0.1:1234/v1';
      model = modelConfig.customOpenAIModel || model || 'qwen2.5-coder-14b-instruct';
      apiKey = modelConfig.customOpenAIApiKey || undefined;
    } else if (rawProvider === 'groq') {
      provider = 'openai';
      endpoint = 'https://api.groq.com/openai/v1';
      model = model || 'llama-3.3-70b-versatile';
      apiKey = providerApiKeys?.groq || modelConfig.apiKey || undefined;
    } else if (rawProvider === 'openrouter') {
      provider = 'openai';
      endpoint = 'https://openrouter.ai/api/v1';
      model = model || 'meta-llama/llama-3.3-70b-instruct';
      apiKey = providerApiKeys?.openrouter || modelConfig.apiKey || undefined;
    } else if (rawProvider === 'openai') {
      provider = 'openai';
      endpoint = 'https://api.openai.com/v1';
      model = model || 'gpt-4o-mini';
      apiKey = providerApiKeys?.openai || modelConfig.apiKey || undefined;
    } else {
      // Provedores não compatíveis diretamente com streaming chat/completions (claude, builtin-ai, etc.)
      throw new Error(`O provedor "${rawProvider}" não suporta streaming direto do Copiloto. Selecione OpenAI, Groq, OpenRouter ou LM Studio (Custom OpenAI) nas configurações.`);
    }

    return {
      provider,
      endpoint,
      model,
      apiKey,
      scopes: scopesRef.current,
      autoTrigger: isAutoTriggerRef.current
    };
  }, [modelConfig, providerApiKeys]);

  // Execução da busca e geração para uma pergunta
  const executeCopilotSuggestion = useCallback(async (questionText: string, questionObj: CopilotQuestion) => {
    setIsGenerating(true);
    setError(null);
    setStreamingAnswer('');
    setCurrentQuestion(questionObj);

    // 1. Busca por evidências com BM25
    let matches = indexRef.current.search(questionText, scopesRef.current, 3);

    // Se a pergunta isolada não trouxe match, busca usando as últimas falas
    if (matches.length === 0) {
      const recentHistory = bufferRef.current.snapshot().slice(-3).map(s => s.text).join(' ');
      if (recentHistory) {
        matches = indexRef.current.search(recentHistory, scopesRef.current, 3);
      }
    }

    setEvidence(matches);

    // 2. Prepara requisição com histórico
    const conversation = bufferRef.current.snapshot().slice(-10).map(s => ({
      startMs: s.startMs,
      text: s.text
    }));

    try {
      const config = getCopilotConfig();
      await assistantRef.current.generateSuggestion(
        {
          question: questionText,
          conversation,
          evidence: matches,
          systemPrompt: '',
          userPrompt: ''
        },
        config,
        {
          onToken: (_token, accumulated) => {
            setStreamingAnswer(accumulated);
          },
          onComplete: (fullText) => {
            setStreamingAnswer(fullText);
            setIsGenerating(false);
          },
          onError: (err) => {
            setError(err.message);
            setIsGenerating(false);
            toast.error('Falha ao gerar sugestão do Copiloto', {
              description: err.message
            });
          }
        }
      );
    } catch (err: unknown) {
      setIsGenerating(false);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error('Falha na configuração do Copiloto', {
        description: msg
      });
    }
  }, [getCopilotConfig]);

  // Processamento automático de falas recebidas (suporte a lotes e isolamento de sessão)
  useEffect(() => {
    // 1. Detecta troca de reunião para garantir isolamento estrito de contexto
    if (currentMeetingId !== lastMeetingIdRef.current) {
      lastMeetingIdRef.current = currentMeetingId;
      processedSegmentsRef.current.clear();
      assistantRef.current.cancel();
      bufferRef.current = new TranscriptBuffer(currentMeetingId || 'copilot-session');
      detectorRef.current.clear();
      setIsGenerating(false);
      setStreamingAnswer('');
      setCurrentQuestion(null);
      setEvidence([]);
      setError(null);
    }

    // 2. Quando a lista de transcrições é limpa
    if (!transcripts || transcripts.length === 0) {
      processedSegmentsRef.current.clear();
      assistantRef.current.cancel();
      bufferRef.current = new TranscriptBuffer(currentMeetingId || 'copilot-session');
      detectorRef.current.clear();
      setIsGenerating(false);
      setStreamingAnswer('');
      setCurrentQuestion(null);
      setEvidence([]);
      return;
    }

    const isLoopbackOnly = selectedDevices?.micDevice === 'none';

    // 3. Processa todos os novos segmentos recebidos (inclusive múltiplos em lote e correções)
    for (let i = 0; i < transcripts.length; i++) {
      const t = transcripts[i];
      if (!t) continue;

      // Validação estrita de isolamento de sessão:
      // Se o evento possuir meeting_id de outra sessão, descarta imediatamente (evita eventos atrasados)
      if (t.meeting_id && currentMeetingId && t.meeting_id !== currentMeetingId) {
        continue;
      }

      const segId = t.id || String(t.sequence_id ?? i);

      // Suporte a correções tardias de texto:
      // Pula apenas se o segmento já foi processado como final E o texto não sofreu alteração
      const prevText = processedSegmentsRef.current.get(segId);
      if (prevText === t.text && !t.is_partial) {
        continue;
      }
      if (!t.is_partial) {
        processedSegmentsRef.current.set(segId, t.text);
      }

      // Precedência estrita de canal:
      // A) Se microfone estiver explicitamente desativado ('none'), opera em loopback exclusivo ('remote-system')
      // B) Origem confirmada 'Microphone' é 'microphone'
      // C) Origem confirmada 'System Audio' é 'remote-system'
      let channel: CopilotSegment['channel'] = 'unknown';
      if (isLoopbackOnly) {
        channel = 'remote-system';
      } else if (t.source === 'Microphone') {
        channel = 'microphone';
      } else if (t.source === 'System Audio') {
        channel = 'remote-system';
      }

      const segment: CopilotSegment = {
        id: segId,
        sessionId: currentMeetingId || 'copilot-session',
        sequence: t.sequence_id ?? i,
        startMs: Math.round((t.audio_start_time ?? 0) * 1000),
        endMs: Math.round((t.audio_end_time ?? (t.audio_start_time ?? 0) + 3) * 1000),
        text: t.text,
        final: !t.is_partial,
        channel
      };

      const { isQuestionEligible } = bufferRef.current.append(segment);

      // O gatilho automático dispara APENAS para canais 'remote-system' (áudio de outros participantes)
      if (isAutoTriggerRef.current && isQuestionEligible && channel === 'remote-system') {
        const detected = detectorRef.current.detect(segment);
        if (detected) {
          executeCopilotSuggestion(detected.text, detected);
        }
      }
    }
  }, [transcripts, currentMeetingId, selectedDevices, executeCopilotSuggestion]);

  // Disparo manual (sob demanda)
  const triggerManual = useCallback(async (customText?: string) => {
    let questionText = customText?.trim();

    if (!questionText) {
      // Pega a última fala final da transcrição
      const list = transcriptsRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].is_partial && list[i].text.trim()) {
          questionText = list[i].text.trim();
          break;
        }
      }
    }

    if (!questionText) {
      toast.info('Nenhuma fala recente detectada para sugerir resposta.');
      return;
    }

    const questionObj: CopilotQuestion = {
      id: `manual-${Date.now()}`,
      sessionId: currentMeetingId || 'copilot-session',
      segmentId: 'manual',
      text: questionText,
      endMs: Date.now(),
      reason: 'manual',
      confidence: 1.0
    };

    toast.info('Copiloto analisando...', {
      description: `Pergunta: "${questionText.slice(0, 50)}${questionText.length > 50 ? '...' : ''}"`
    });

    await executeCopilotSuggestion(questionText, questionObj);
  }, [executeCopilotSuggestion, currentMeetingId]);

  // Cancelar geração
  const cancelGeneration = useCallback(() => {
    assistantRef.current.cancel();
    setIsGenerating(false);
  }, []);

  // Limpar estado
  const clearState = useCallback(() => {
    cancelGeneration();
    processedSegmentsRef.current.clear();
    setCurrentQuestion(null);
    setEvidence([]);
    setStreamingAnswer('');
    setError(null);
    bufferRef.current = new TranscriptBuffer(currentMeetingId || 'copilot-session');
    detectorRef.current.clear();
  }, [cancelGeneration, currentMeetingId]);

  // Registro de atalho global de teclado (Alt + Q)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Alt + Q ou Option + Q
      if (event.altKey && (event.key === 'q' || event.key === 'Q')) {
        event.preventDefault();
        triggerManual();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerManual]);

  return {
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
    clearState
  };
}
