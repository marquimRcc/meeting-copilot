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
  const { transcripts } = useTranscripts();
  const { modelConfig, providerApiKeys, selectedDevices } = useConfig();

  const [currentQuestion, setCurrentQuestion] = useState<CopilotQuestion | null>(null);
  const [evidence, setEvidence] = useState<EvidenceMatch[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>(['backend', 'incidentes', 'java']);
  const [isAutoTrigger, setIsAutoTrigger] = useState<boolean>(false);

  // Instâncias singleton de processamento
  const bufferRef = useRef<TranscriptBuffer>(new TranscriptBuffer('copilot-session'));
  const detectorRef = useRef<QuestionDetector>(new QuestionDetector());
  const indexRef = useRef<BM25Index>(new BM25Index(defaultDocuments));
  const assistantRef = useRef<CopilotAssistantService>(new CopilotAssistantService());

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

    const config = getCopilotConfig();

    try {
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
    }
  }, [getCopilotConfig]);

  // Processamento automático de novas falas
  useEffect(() => {
    // Quando a lista de transcrições é limpa (fim da reunião ou início de uma nova)
    if (!transcripts || transcripts.length === 0) {
      assistantRef.current.cancel();
      bufferRef.current.clear();
      detectorRef.current.clear();
      setIsGenerating(false);
      setStreamingAnswer('');
      setCurrentQuestion(null);
      setEvidence([]);
      return;
    }

    const last = transcripts[transcripts.length - 1];
    if (!last || last.is_partial) return;

    // Atribuição de canal de áudio:
    // Se o microfone foi desativado explicitamente ('none'), a captura contém exclusivamente loopback do sistema (outros participantes).
    // Se o microfone estiver ativo, a fala pode ser do próprio usuário (canal 'unknown' para evitar que o usuário pergunte e o copiloto responda a ele mesmo no modo automático).
    const isLoopbackOnly = selectedDevices?.micDevice === 'none';
    const channel: CopilotSegment['channel'] = isLoopbackOnly ? 'remote-system' : 'unknown';

    const segment: CopilotSegment = {
      id: last.id || String(last.sequence_id),
      sessionId: 'copilot-session',
      sequence: last.sequence_id ?? transcripts.length,
      startMs: Math.round((last.audio_start_time ?? 0) * 1000),
      endMs: Math.round((last.audio_end_time ?? (last.audio_start_time ?? 0) + 3) * 1000),
      text: last.text,
      final: !last.is_partial,
      channel
    };

    const { isQuestionEligible } = bufferRef.current.append(segment);

    // O gatilho automático dispara APENAS se for canal 'remote-system' (áudio remoto)
    if (isAutoTriggerRef.current && isQuestionEligible && channel === 'remote-system') {
      const detected = detectorRef.current.detect(segment);
      if (detected) {
        executeCopilotSuggestion(detected.text, detected);
      }
    }
  }, [transcripts, selectedDevices, executeCopilotSuggestion]);

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
      sessionId: 'copilot-session',
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
  }, [executeCopilotSuggestion]);

  // Cancelar geração
  const cancelGeneration = useCallback(() => {
    assistantRef.current.cancel();
    setIsGenerating(false);
  }, []);

  // Limpar estado
  const clearState = useCallback(() => {
    cancelGeneration();
    setCurrentQuestion(null);
    setEvidence([]);
    setStreamingAnswer('');
    setError(null);
    bufferRef.current.clear();
    detectorRef.current.clear();
  }, [cancelGeneration]);

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
