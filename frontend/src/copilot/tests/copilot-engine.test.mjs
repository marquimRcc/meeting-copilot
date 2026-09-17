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
