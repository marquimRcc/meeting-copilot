import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

describe('Teste Canário — Integridade de Códigos de Saída do Test Runner', () => {
  it('garante que uma asserção quebrada devolve código de saída 1 (diferente de zero)', () => {
    // Executa um subprocesso Node com uma asserção quebrada propositalmente
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import assert from 'node:assert/strict'; assert.strictEqual(1, 2);"
      ],
      { encoding: 'utf8' }
    );

    // O processo DEVE falhar com status code 1
    assert.strictEqual(
      result.status,
      1,
      `O processo deve finalizar com código 1 em caso de falha de asserção, mas retornou status: ${result.status}`
    );

    // A saída de erro deve conter a exceção AssertionError
    assert.ok(
      result.stderr.includes('ERR_ASSERTION') || result.stderr.includes('AssertionError'),
      'A saída de erro deve documentar explicitamente a AssertionError'
    );
  });
});
