import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Paridade TS↔SQL — reprodutibilidade dos artefatos gerados', () => {
  it('os artefatos commitados são exatamente os produzidos pelo gerador', () => {
    const script = resolve(
      process.cwd(),
      'infrastructure/supabase/validation/parity/build_parity.mjs',
    );

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(process.execPath, [script, '--verify'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const failure = error as {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        status?: number;
      };
      stdout = String(failure.stdout ?? '');
      stderr = String(failure.stderr ?? '');
      exitCode = failure.status ?? 1;
    }

    expect(
      exitCode,
      `build_parity.mjs --verify falhou (exit=${exitCode}). stdout:\n${stdout}\nstderr:\n${stderr}`,
    ).toBe(0);
    expect(stdout).toContain('PARITY ARTIFACT OK');
  });
});
