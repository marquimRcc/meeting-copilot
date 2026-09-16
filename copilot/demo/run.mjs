import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { MeetingCopilot } from '../packages/core/src/index.ts';

const { values } = parseArgs({ options: {
  interactive: { type: 'boolean', default: false },
  context: { type: 'string' }, scopes: { type: 'string', default: 'java' },
  export: { type: 'string' },
} });
const documents = JSON.parse(await readFile(values.context ?? new URL('./context.json', import.meta.url), 'utf8'));
if (!Array.isArray(documents)) throw new Error('Contexto deve ser um array JSON de documentos.');
const copilot = new MeetingCopilot({ sessionId: 'demo-01', documents,
  scopes: values.scopes.split(',').map(scope => scope.trim()).filter(Boolean) });
const history = [];
const preparedQuestions = [];
console.log('\nCOPILOTO · demonstração com texto simulado · sem áudio e sem chamada de IA\n');

const lines = [
  'Vamos conversar sobre investigação de incidentes em serviços Java.',
  'Como você investigava erros em produção?',
];
function ingest(text) {
  if (!text.trim()) return;
  const sequence = history.length;
  console.log(`Remoto (simulado): ${text}`);
  const segment = { sessionId: 'demo-01', id: String(sequence), sequence,
    startMs: sequence * 8000, endMs: sequence * 8000 + 4000,
    text, final: true, channel: 'remote-system' };
  const prepared = copilot.ingest(segment);
  history.push(segment);
  if (prepared) {
    preparedQuestions.push(prepared);
    console.log(`\nPergunta candidata: ${prepared.question.text}`);
    console.log('Contexto encontrado (trechos, ainda não é uma resposta de IA):');
    for (const source of prepared.evidence) {
      console.log(`\n[${source.documentId}, parágrafo ${source.paragraph}]\n${source.text}`);
    }
    if (!prepared.evidence.length) console.log('Nenhum trecho encontrado no escopo selecionado.');
    console.log('\nSolicitação para o futuro provedor de IA preparada. Nenhum dado enviado.');
  }
}
if (values.interactive) {
  console.log('Digite uma fala por linha. Use /sair para encerrar. Horários são simulados.\n');
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of input) {
      if (line.trim() === '/sair') break;
      ingest(line);
    }
  } finally { input.close(); }
} else {
  for (const line of lines) ingest(line);
}
copilot.stop();
if (values.export) {
  await writeFile(values.export, JSON.stringify({ formatVersion: 1, simulated: true,
    transcripts: history, preparedQuestions }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`\nDemonstração exportada para ${values.export}`);
}
