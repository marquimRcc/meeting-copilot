import type { CopilotConfig, SuggestionRequest } from './types.ts';

export interface SuggestionCallbacks {
  onToken?: (token: string, accumulated: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Monta o prompt instrucional estruturado para o modelo de linguagem.
 */
export function buildPrompt(request: SuggestionRequest): { system: string; user: string } {
  const system = [
    'Você é um copiloto confidencial de reuniões em tempo real. Responda em Português do Brasil.',
    'Seu objetivo é sugerir respostas concisas, técnicas e assertivas que a pessoa possa ler e falar de imediato.',
    'REGRAS OBRIGATÓRIAS:',
    '1. Responda diretamente à pergunta em 1 a 3 parágrafos curtos. Não enrole com introduções vazias como "Certamente!" ou "Boa pergunta".',
    '2. Use APENAS os fatos e orientações dos documentos de evidência citados. Não invente ferramentas, projetos ou responsabilidades.',
    '3. Se os documentos de contexto responderem à pergunta, cite os pontos técnicos relevantes (ex.: "conforme o procedimento de incidentes...").',
    '4. Se o contexto não cobrir a resposta, ofereça a resposta técnica padrão de mercado e declare claramente a premissa a ser confirmada.',
    '5. Mantenha tom profissional, direto e objetivo.'
  ].join('\n');

  let user = `### PERGUNTA FEITA NA REUNIÃO:\n"${request.question}"\n\n`;

  if (request.evidence.length > 0) {
    user += '### DOCUMENTOS DE CONTEXTO E FATOS:\n';
    for (const item of request.evidence) {
      user += `[Documento: ${item.title} | Parágrafo ${item.paragraph} | Relevância: ${Math.round(item.score * 100)}%]\n`;
      user += `${item.text}\n\n`;
    }
  } else {
    user += '### CONTEXTO:\nNenhum documento específico encontrado nos escopos selecionados. Use conhecimento padrão e seja cauteloso.\n\n';
  }

  if (request.conversation.length > 0) {
    user += '### FALAS ANTERIORES NA REUNIÃO (Últimos minutos):\n';
    const recent = request.conversation.slice(-5);
    for (const msg of recent) {
      user += `- ${msg.text}\n`;
    }
    user += '\n';
  }

  user += 'Sugira uma resposta objetiva e pronta para ser dita:';

  return { system, user };
}

/**
 * Serviço de comunicação com LLM (Ollama / OpenAI) com suporte nativo a streaming de tokens.
 */
export class CopilotAssistantService {
  private activeController: AbortController | null = null;

  /**
   * Cancela qualquer geração em andamento.
   */
  cancel(): void {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
  }

  /**
   * Dispara a geração de sugestão com streaming.
   */
  async generateSuggestion(
    request: SuggestionRequest,
    config: CopilotConfig,
    callbacks: SuggestionCallbacks = {}
  ): Promise<string> {
    this.cancel();

    const controller = new AbortController();
    this.activeController = controller;

    const { system, user } = buildPrompt(request);

    try {
      if (config.provider === 'ollama') {
        return await this.streamOllama(config, system, user, controller.signal, callbacks);
      } else {
        return await this.streamOpenAI(config, system, user, controller.signal, callbacks);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return '';
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      let friendlyMsg = rawMsg;
      if (rawMsg.includes('Failed to fetch') || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('fetch failed')) {
        const ep = config.endpoint || (config.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1');
        friendlyMsg = `Não foi possível conectar ao servidor de IA em ${ep}. Certifique-se de que o servidor local (LM Studio na porta 1234 ou Ollama na porta 11434) está ativo, ou configure sua API nas configurações do Meetily.`;
      }
      const error = new Error(friendlyMsg);
      callbacks.onError?.(error);
      throw error;
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
    }
  }

  /**
   * Streaming com Ollama API (/api/chat).
   */
  private async streamOllama(
    config: CopilotConfig,
    system: string,
    user: string,
    signal: AbortSignal,
    callbacks: SuggestionCallbacks
  ): Promise<string> {
    const endpoint = (config.endpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const url = `${endpoint}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: config.model || 'llama3.2',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`Erro na chamada Ollama (${response.status}): ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Corpo de resposta vazio retornado pelo Ollama.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulated = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const token = parsed.message?.content || '';
          if (token) {
            accumulated += token;
            callbacks.onToken?.(token, accumulated);
          }
        } catch {
          // Linha parcial ou incompleta
        }
      }
    }

    callbacks.onComplete?.(accumulated);
    return accumulated;
  }

  /**
   * Streaming com OpenAI API (/v1/chat/completions).
   */
  private async streamOpenAI(
    config: CopilotConfig,
    system: string,
    user: string,
    signal: AbortSignal,
    callbacks: SuggestionCallbacks
  ): Promise<string> {
    const endpoint = (config.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = `${endpoint}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`Erro na chamada OpenAI/Custom (${response.status}): ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Corpo de resposta vazio retornado pela API.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulated = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') break;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const token = data.choices?.[0]?.delta?.content || '';
            if (token) {
              accumulated += token;
              callbacks.onToken?.(token, accumulated);
            }
          } catch {
            // Ignorar chunk SSE malformado
          }
        }
      }
    }

    callbacks.onComplete?.(accumulated);
    return accumulated;
  }
}
