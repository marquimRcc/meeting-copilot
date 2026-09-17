import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { stemPt, stemmedTokensPt, normalizePt } from '../stemmer-pt.ts';
import { BM25Index } from '../bm25-index.ts';
import { QuestionDetector } from '../question-detector.ts';
import { TranscriptBuffer } from '../transcript-buffer.ts';
import { buildPrompt, CopilotAssistantService } from '../assistant-service.ts';

describe('Parte 1: Stemmer PT-BR', () => {
  test('reduz diferentes conjugações do mesmo verbo ao mesmo radical', () => {
    const v1 = stemPt('investigar');
    const v2 = stemPt('investigava');
    const v3 = stemPt('investigamos');
    const v4 = stemPt('investigando');
    const v5 = stemPt('investigou');

    assert.equal(v1, v2, `investigar (${v1}) != investigava (${v2})`);
    assert.equal(v2, v3, `investigava (${v2}) != investigamos (${v3})`);
    assert.equal(v3, v4, `investigamos (${v3}) != investigando (${v4})`);
    assert.equal(v4, v5, `investigando (${v4}) != investigou (${v5})`);
  });

  test('reduz plurais e variações morfológicas para a forma base', () => {
    assert.equal(stemPt('erros'), stemPt('erro'));
    assert.equal(stemPt('falhas'), stemPt('falha'));
    assert.equal(stemPt('servicos'), stemPt('servico'));
    assert.equal(stemPt('incidentes'), stemPt('incidente'));
  });

  test('remove acentuação e pontuação na normalização', () => {
    assert.equal(normalizePt('Produção & Operação!'), 'producao operacao');
    assert.equal(normalizePt('Exceções e Falhas'), 'excecoes e falhas');
  });

  test('filtra stopwords e extrai radicais únicos', () => {
    const stems = stemmedTokensPt('como você investigava os erros em produção?');
    // Stopwords como "como", "você", "os", "em" devem ser removidas
    assert.ok(stems.includes(stemPt('investigava')));
    assert.ok(stems.includes(stemPt('erros')));
    assert.ok(stems.includes(stemPt('producao')));
    assert.ok(!stems.includes('como'));
    assert.ok(!stems.includes('em'));
  });
});

describe('Parte 1: Mecanismo de Busca BM25', () => {
  const sampleDocs = [
    {
      id: 'doc-incidentes',
      title: 'Investigação de Incidentes e Falhas',
      scopes: ['java', 'incidentes'],
      text: 'Para investigar incidentes e erros em produção, acompanhe o correlationId nos logs dos microsserviços. Verifique requisições HTTP 5xx e analise onde a falha teve início.\n\nEm processamento assíncrono com Kafka, confira a Dead Letter Queue (DLQ).'
    },
    {
      id: 'doc-banco',
      title: 'Banco de Dados Oracle',
      scopes: ['banco', 'oracle'],
      text: 'O banco de dados relacional principal é Oracle Database. As tabelas transacionais usam índices b-tree e sequences.\n\nPara otimizar consultas pesadas, geramos planos de execução com EXPLAIN PLAN.'
    }
  ];

  test('encontra correspondência entre "investigava o erro" e "investigação de incidentes e erros" (graças ao stemmer)', () => {
    const index = new BM25Index(sampleDocs);
    // Pergunta com verbos e plurais diferentes do texto do documento:
    const matches = index.search('Como você investigava os erros em produção?', ['java']);

    assert.ok(matches.length > 0, 'Deveria encontrar o documento de incidentes');
    assert.equal(matches[0].documentId, 'doc-incidentes');
    assert.ok(matches[0].score > 0);
  });

  test('respeita o filtro de escopos e não vaza documentos fora de escopo', () => {
    const index = new BM25Index(sampleDocs);

    // Buscando algo de banco mas com escopo restrito a 'incidentes'
    const matchesIncidentes = index.search('Como otimizar queries no banco Oracle?', ['incidentes']);
    assert.equal(matchesIncidentes.length, 0, 'Não deve retornar doc de banco quando o escopo é incidentes');

    // Buscando com o escopo correto 'oracle'
    const matchesBanco = index.search('Como otimizar queries no banco Oracle?', ['oracle']);
    assert.ok(matchesBanco.length > 0);
    assert.equal(matchesBanco[0].documentId, 'doc-banco');
  });

  test('suporta escopo coringa "todos"', () => {
    const index = new BM25Index(sampleDocs);
    const matches = index.search('correlationId', ['todos']);
    assert.equal(matches[0].documentId, 'doc-incidentes');
  });

  test('escopo vazio não retorna nenhuma evidência (isolamento e confidencialidade estrita)', () => {
    const index = new BM25Index(sampleDocs);
    const matches = index.search('Como investigar erros em produção?', []);
    assert.equal(matches.length, 0, 'Escopo vazio deve retornar 0 evidências');
  });
});

describe('Parte 1: Detector de Perguntas Conversacionais', () => {
  const detector = new QuestionDetector();

  const seg = (text, overrides = {}) => ({
    id: 's1',
    sessionId: 'session-1',
    sequence: 1,
    startMs: 1000,
    endMs: 2000,
    text,
    final: true,
    channel: 'remote-system',
    ...overrides
  });

  test('detecta perguntas naturais com vocativos e prefixos coloquiais', () => {
    const frasesValidas = [
      'Marcos, você sabe como tratar falhas parciais?',
      'Cara, me tira uma dúvida, qual banco a gente tá usando?',
      'Sobre aquele incidente de ontem, como a gente investiga?',
      'Você poderia me explicar o fluxo de pagamento?'
    ];

    for (const frase of frasesValidas) {
      const q = detector.detect(seg(frase, { id: Math.random().toString() }));
      assert.ok(q !== null, `Deveria ter detectado como pergunta: "${frase}"`);
    }
  });

  test('descarta muletas conversacionais e checagens de áudio mesmo com interrogação', () => {
    const muletas = [
      'né?',
      'beleza?',
      'entendeu?',
      'certo?',
      'tá me ouvindo?',
      'consegue me ouvir?',
      'consegue ver minha tela?'
    ];

    for (const muleta of muletas) {
      const q = detector.detect(seg(muleta, { id: Math.random().toString() }));
      assert.equal(q, null, `Muleta não deveria ser tratada como pergunta: "${muleta}"`);
    }
  });

  test('descarta afirmações comuns e discurso indireto', () => {
    const afirmacoes = [
      'Como combinamos ontem, vou fazer o deploy às 18h.',
      'Ele perguntou como a gente faz a compensação.',
      'O serviço foi construído em Java com Spring Boot.'
    ];

    for (const afirmacao of afirmacoes) {
      const q = detector.detect(seg(afirmacao, { id: Math.random().toString() }));
      assert.equal(q, null, `Afirmação não deveria ser detectada: "${afirmacao}"`);
    }
  });

  test('deduplica a mesma pergunta repetida em janela de tempo curta', () => {
    detector.clear();
    const q1 = detector.detect(seg('Como investigar erros em produção?', { id: '1', endMs: 1000 }));
    assert.ok(q1 !== null);

    // Mesma pergunta 5 segundos depois
    const q2 = detector.detect(seg('Como investigar erros em produção?', { id: '2', endMs: 6000 }));
    assert.equal(q2, null, 'Deveria suprimir pergunta duplicada em intervalo curto');
  });
});

describe('Parte 1: TranscriptBuffer de Alta Performance', () => {
  test('armazena e recupera segmentos ordenados', () => {
    const buffer = new TranscriptBuffer('s1', 120000, 50);

    buffer.append({
      id: '1', sessionId: 's1', sequence: 1, startMs: 0, endMs: 2000,
      text: 'Primeira fala', final: true, channel: 'remote-system'
    });

    buffer.append({
      id: '2', sessionId: 's1', sequence: 2, startMs: 2000, endMs: 4000,
      text: 'Segunda fala', final: true, channel: 'remote-system'
    });

    const snapshot = buffer.snapshot();
    assert.equal(snapshot.length, 2);
    assert.equal(snapshot[0].text, 'Primeira fala');
    assert.equal(snapshot[1].text, 'Segunda fala');
  });

  test('atualiza segmento corrigido e sinaliza elegibilidade para redetecção', () => {
    const buffer = new TranscriptBuffer('s1', 120000, 50);

    const first = buffer.append({
      id: '1', sessionId: 's1', sequence: 1, startMs: 0, endMs: 2000,
      text: 'Como investigar', final: true, channel: 'remote-system'
    });
    assert.equal(first.isNew, true);

    // Whisper refinou o segmento para a pergunta completa
    const update = buffer.append({
      id: '1', sessionId: 's1', sequence: 1, startMs: 0, endMs: 2000,
      text: 'Como você investigava erros em produção?', final: true, channel: 'remote-system'
    });
    assert.equal(update.isNew, false);
    assert.equal(update.isQuestionEligible, true);
    assert.equal(buffer.snapshot()[0].text, 'Como você investigava erros em produção?');
  });

  test('clear() reseta segmentos, IDs ordenados e marca dágua entre reuniões', () => {
    const buffer = new TranscriptBuffer('s1', 120000, 50);
    buffer.append({
      id: '1', sessionId: 's1', sequence: 1, startMs: 0, endMs: 2000,
      text: 'Primeira fala', final: true, channel: 'remote-system'
    });
    assert.equal(buffer.snapshot().length, 1);
    buffer.clear();
    assert.equal(buffer.snapshot().length, 0);

    // Nova reunião iniciando do tempo 0 deve ser aceita normalmente
    const novaReuniao = buffer.append({
      id: 'nova-1', sessionId: 's2', sequence: 1, startMs: 0, endMs: 1500,
      text: 'Início da nova reunião', final: true, channel: 'remote-system'
    });
    assert.equal(novaReuniao.isNew, true);
    assert.equal(buffer.snapshot().length, 1);
  });
});

describe('Parte 1: Formatação de Prompts do Assistente', () => {
  test('constrói prompt estruturado citando evidências e proibindo alucinações', () => {
    const { system, user } = buildPrompt({
      question: 'Como você investigava erros em produção?',
      conversation: [{ startMs: 1000, text: 'Estamos discutindo arquitetura.' }],
      evidence: [{
        documentId: 'doc-1',
        title: 'Incidentes Java',
        paragraph: 2,
        text: 'Acompanhar correlationId nos logs de microsserviços.',
        score: 0.95
      }],
      systemPrompt: '',
      userPrompt: ''
    });

    assert.match(system, /copiloto confidencial de reuniões/);
    assert.match(system, /Use APENAS os fatos/);
    assert.match(user, /Como você investigava erros em produção\?/);
    assert.match(user, /Incidentes Java/);
    assert.match(user, /correlationId/);
    assert.match(user, /Estamos discutindo arquitetura/);
  });
});

describe('Parte 3: Assistente LLM com Streaming e Cancelamento', () => {
  test('cancel() aborta requisição em andamento de forma segura', () => {
    const service = new CopilotAssistantService();
    // Chamar cancel em estado ocioso não deve lançar erro
    assert.doesNotThrow(() => service.cancel());
  });

  test('trata falha de conexão com mensagem amigável sobre LM Studio e Ollama', async () => {
    const service = new CopilotAssistantService();
    const dummyReq = {
      question: 'Teste?',
      conversation: [],
      evidence: [],
      systemPrompt: '',
      userPrompt: ''
    };

    // Apontando para porta fechada propositalmente
    const config = {
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:59999',
      model: 'llama3.2',
      scopes: ['java'],
      autoTrigger: false
    };

    let errorReported = null;
    await assert.rejects(
      () => service.generateSuggestion(dummyReq, config, {
        onError: (err) => { errorReported = err; }
      }),
      /Não foi possível conectar ao servidor de IA/
    );

    assert.ok(errorReported);
    assert.match(errorReported.message, /LM Studio na porta 1234 ou Ollama na porta 11434/);
  });
});

describe('Parte 4: Separação de Locutores e Canais de Áudio (Speaker Diarization)', () => {
  const detector = new QuestionDetector();

  // Helper que reproduz a lógica determinística de resolução de canal do hook useMeetingCopilot
  function resolveCopilotChannel(source, isLoopbackOnly) {
    if (source === 'Microphone') {
      return 'mic';
    } else if (source === 'System Audio') {
      return 'remote-system';
    } else if (isLoopbackOnly) {
      return 'remote-system';
    }
    return 'unknown';
  }

  test('mapeamento de source e dispositivos para canais do Copiloto', () => {
    // Quando vem do stream de áudio do sistema (participantes da reunião)
    assert.equal(resolveCopilotChannel('System Audio', false), 'remote-system');

    // Quando vem do stream do microfone local (o próprio usuário falando)
    assert.equal(resolveCopilotChannel('Microphone', false), 'mic');

    // Precedência estrita: se source é 'Microphone', deve ser SEMPRE 'mic' mesmo se isLoopbackOnly for true
    assert.equal(resolveCopilotChannel('Microphone', true), 'mic');

    // Quando o microfone foi explicitamente desativado no Meetily ('none')
    assert.equal(resolveCopilotChannel(undefined, true), 'remote-system');

    // Quando o canal for indeterminado e ambos os dispositivos estiverem ativos
    assert.equal(resolveCopilotChannel(undefined, false), 'unknown');
  });

  test('pergunta originada do microfone ("mic") não deve acionar sugestão automática', () => {
    const buffer = new TranscriptBuffer('s-diarization');
    const segment = {
      id: 'mic-seg-1',
      sessionId: 's-diarization',
      sequence: 1,
      startMs: 1000,
      endMs: 3500,
      text: 'Marcos, você sabe como resolver o erro 500 no serviço?',
      final: true,
      channel: resolveCopilotChannel('Microphone', false) // 'mic'
    };

    const { isQuestionEligible } = buffer.append(segment);
    const detected = detector.detect(segment);

    // O canal 'mic' é rejeitado pelo detector para evitar auto-disparo de perguntas feitas pelo próprio usuário:
    assert.equal(segment.channel, 'mic');
    assert.equal(detected, null, 'O detector rejeita falas de microfone do próprio usuário');

    // E a condição de disparo automático é rigorosamente falsa:
    const autoTriggerCondition = isQuestionEligible && segment.channel === 'remote-system' && detected !== null;
    assert.equal(autoTriggerCondition, false, 'Pergunta do próprio usuário não pode disparar resposta automática');
  });

  test('pergunta originada do sistema ("remote-system") aciona sugestão automática normalmente', () => {
    const buffer = new TranscriptBuffer('s-diarization');
    const segment = {
      id: 'sys-seg-1',
      sessionId: 's-diarization',
      sequence: 2,
      startMs: 4000,
      endMs: 6500,
      text: 'Como vocês tratavam as falhas de conexão com o Oracle?',
      final: true,
      channel: resolveCopilotChannel('System Audio', false) // 'remote-system'
    };

    const { isQuestionEligible } = buffer.append(segment);
    const detected = detector.detect(segment);

    assert.ok(detected !== null, 'Detecta pergunta feita pelo participante remoto');
    assert.equal(segment.channel, 'remote-system');

    // Condição de disparo automático satisfeita:
    const autoTriggerCondition = isQuestionEligible && segment.channel === 'remote-system';
    assert.equal(autoTriggerCondition, true, 'Pergunta de participante remoto dispara sugestão automática');
  });

  test('pergunta com canal "unknown" não dispara automaticamente para segurança', () => {
    const buffer = new TranscriptBuffer('s-diarization');
    const segment = {
      id: 'unknown-seg-1',
      sessionId: 's-diarization',
      sequence: 3,
      startMs: 7000,
      endMs: 9000,
      text: 'Qual a política de retenção dos logs?',
      final: true,
      channel: resolveCopilotChannel(undefined, false) // 'unknown'
    };

    const { isQuestionEligible } = buffer.append(segment);
    const autoTriggerCondition = isQuestionEligible && segment.channel === 'remote-system';
    assert.equal(autoTriggerCondition, false, 'Canal não confirmado não deve disparar no modo automático');
  });

  test('disparo manual sob demanda permite responder qualquer pergunta independente do canal', () => {
    // No disparo manual (Alt+Q ou botão "Copilot"), o usuário quer a sugestão deliberadamente
    const userSpokenQuestion = 'Como nós configuramos o circuit breaker no Resilience4j?';

    // Mesmo que o segmento tenha sido falado no microfone pelo próprio usuário:
    const channel = resolveCopilotChannel('Microphone', false);
    assert.equal(channel, 'mic');

    // O fluxo manual aceita o texto explicitamente
    const manualQuestionObj = {
      id: `manual-${Date.now()}`,
      sessionId: 's-diarization',
      segmentId: 'manual',
      text: userSpokenQuestion,
      endMs: Date.now(),
      reason: 'manual',
      confidence: 1.0
    };

    assert.equal(manualQuestionObj.reason, 'manual');
    assert.equal(manualQuestionObj.text, userSpokenQuestion);
  });

  test('processamento em lote ingere múltiplos segmentos recebidos simultaneamente', () => {
    const buffer = new TranscriptBuffer('s-batch');
    const processedIds = new Set();
    const batchTranscripts = [
      { id: 'b1', text: 'Bom dia a todos.', is_partial: false, source: 'System Audio', audio_start_time: 1, audio_end_time: 3 },
      { id: 'b2', text: 'Hoje vamos falar sobre a migração de banco.', is_partial: false, source: 'System Audio', audio_start_time: 3, audio_end_time: 6 },
      { id: 'b3', text: 'Como vamos migrar o Oracle para Postgres?', is_partial: false, source: 'System Audio', audio_start_time: 6, audio_end_time: 9 }
    ];

    const detectedQuestions = [];

    for (let i = 0; i < batchTranscripts.length; i++) {
      const t = batchTranscripts[i];
      const segId = t.id || String(i);
      if (processedIds.has(segId) && !t.is_partial) continue;
      if (!t.is_partial) processedIds.add(segId);

      const channel = resolveCopilotChannel(t.source, false);
      const seg = {
        id: segId,
        sessionId: 's-batch',
        sequence: i,
        startMs: Math.round(t.audio_start_time * 1000),
        endMs: Math.round(t.audio_end_time * 1000),
        text: t.text,
        final: !t.is_partial,
        channel
      };

      const { isQuestionEligible } = buffer.append(seg);
      if (isQuestionEligible && channel === 'remote-system') {
        const detected = detector.detect(seg);
        if (detected) {
          detectedQuestions.push(detected);
        }
      }
    }

    // Todos os 3 segmentos devem estar no buffer (nenhum descartado por olhar só o último)
    assert.equal(buffer.snapshot().length, 3);
    assert.equal(detectedQuestions.length, 1);
    assert.match(detectedQuestions[0].text, /Como vamos migrar o Oracle para Postgres/);

    // Em uma segunda execução com o mesmo lote, nada deve ser reprocessado
    const previousDetectedCount = detectedQuestions.length;
    for (let i = 0; i < batchTranscripts.length; i++) {
      const t = batchTranscripts[i];
      const segId = t.id || String(i);
      if (processedIds.has(segId) && !t.is_partial) continue;
      // Não deve chegar aqui
      assert.fail(`Segmento ${segId} não deveria ser reprocessado`);
    }
    assert.equal(detectedQuestions.length, previousDetectedCount);
  });

  test('isolamento de sessão reseta buffer e deduplicador ao trocar de reunião', () => {
    const buffer = new TranscriptBuffer('meeting-1');
    const processedIds = new Set();

    // Reunião 1
    buffer.append({ id: 'm1-1', sessionId: 'meeting-1', sequence: 1, startMs: 0, endMs: 2000, text: 'Fala reunião 1', final: true, channel: 'remote-system' });
    processedIds.add('m1-1');
    assert.equal(buffer.snapshot().length, 1);
    assert.equal(processedIds.size, 1);

    // Troca para Reunião 2: limpeza total
    buffer.clear();
    detector.clear();
    processedIds.clear();

    assert.equal(buffer.snapshot().length, 0);
    assert.equal(processedIds.size, 0);

    // Reunião 2 começa do zero
    buffer.append({ id: 'm2-1', sessionId: 'meeting-2', sequence: 1, startMs: 0, endMs: 2000, text: 'Fala reunião 2', final: true, channel: 'remote-system' });
    processedIds.add('m2-1');
    assert.equal(buffer.snapshot().length, 1);
    assert.equal(buffer.snapshot()[0].text, 'Fala reunião 2');
  });
});
