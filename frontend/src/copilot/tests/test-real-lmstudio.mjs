import { BM25Index } from '../bm25-index.ts';
import { CopilotAssistantService } from '../assistant-service.ts';
import { readFileSync } from 'node:fs';

const defaultDocs = JSON.parse(
  readFileSync(new URL('../default-context.json', import.meta.url), 'utf-8')
);

async function main() {
  console.log('🧪 Iniciando teste real de streaming com LM Studio (Qwen 2.5 Coder 14B)...');

  const question = 'Como você investigava erros em produção nos microsserviços?';
  console.log(`\n🎤 Pergunta simulada da reunião:\n"${question}"\n`);

  // 1. Busca de evidências com BM25
  const index = new BM25Index(defaultDocs);
  const evidence = index.search(question, ['java', 'incidentes'], 2);

  console.log(`📚 Evidências encontradas via BM25 (${evidence.length}):`);
  for (const item of evidence) {
    console.log(`  - [${item.title} §${item.paragraph}] (match: ${Math.round(item.score * 100)}%)`);
  }

  // 2. Chamada de streaming para o LM Studio
  const assistant = new CopilotAssistantService();
  const config = {
    provider: 'custom-openai',
    endpoint: 'http://127.0.0.1:1234/v1',
    model: 'qwen2.5-coder-14b-instruct',
    scopes: ['java', 'incidentes'],
    autoTrigger: false
  };

  const startTime = Date.now();
  let firstTokenTime = null;
  let tokenCount = 0;

  console.log('\n💬 Sugestão da IA em streaming (tempo real):\n');

  try {
    const fullText = await assistant.generateSuggestion(
      {
        question,
        conversation: [{ startMs: 1000, text: 'Estamos discutindo arquitetura e suporte a incidentes.' }],
        evidence,
        systemPrompt: '',
        userPrompt: ''
      },
      config,
      {
        onToken: (token) => {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
          }
          tokenCount++;
          process.stdout.write(token);
        }
      }
    );

    const totalTimeMs = Date.now() - startTime;
    const ttft = firstTokenTime ? firstTokenTime - startTime : 0;
    const tokensPerSec = Math.round((tokenCount / (totalTimeMs / 1000)) * 10) / 10;

    console.log('\n\n' + '─'.repeat(60));
    console.log(`⚡ Desempenho na GPU:`);
    console.log(`   - Tempo até o primeiro token (TTFT): ${ttft} ms`);
    console.log(`   - Duração total: ${(totalTimeMs / 1000).toFixed(2)} s`);
    console.log(`   - Tokens gerados: ${tokenCount} (~${tokensPerSec} tokens/s)`);
    console.log('─'.repeat(60));
  } catch (err) {
    console.error('❌ Erro no teste do LM Studio:', err);
    process.exit(1);
  }
}

main();
