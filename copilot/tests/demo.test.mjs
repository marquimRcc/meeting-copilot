import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../demo/run.mjs', import.meta.url));
test('interactive demo exports the full simulation and never overwrites an existing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-'));
  try {
    const output = join(dir, 'session.json');
    const result = spawnSync(process.execPath, [script, '--interactive', '--export', output], {
      input: 'Vamos discutir erros em produção.\nComo investigar erros em produção?\n/sair\n', encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const saved = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(saved.simulated, true);
    assert.equal(saved.transcripts.length, 2);
    assert.equal(saved.preparedQuestions.length, 1);
    assert.equal(saved.preparedQuestions[0].evidence[0].documentId, 'exemplo-incidentes');
    const again = spawnSync(process.execPath, [script, '--export', output], { encoding: 'utf8' });
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /EEXIST/);
    assert.equal(JSON.parse(await readFile(output, 'utf8')).transcripts[0].text, saved.transcripts[0].text);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
