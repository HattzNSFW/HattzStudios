import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const checker = resolve(
  repoRoot,
  'infrastructure/supabase/validation/parity/check_media_parity.mjs',
);
const realContracts = resolve(repoRoot, 'packages/contracts/src/domains.ts');
const realSql = resolve(
  repoRoot,
  'infrastructure/supabase/migrations/0017_media_kind_canonical.sql',
);

function contractSource(values: string[]): string {
  return [
    'export const MEDIA_ASSET_KINDS = [',
    ...values.map((value) => `  '${value}',`),
    '] as const;',
    '',
    'export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];',
    '',
  ].join('\n');
}

function sqlSource(values: string[]): string {
  return [
    '-- fixture sintetica para teste negativo',
    'begin;',
    'alter table public.media_assets',
    '  add constraint ck_media_assets_kind_canonical',
    '  check (kind in (',
    `${values.map((value) => `    '${value}'`).join(',\n')}`,
    '  ));',
    'commit;',
    '',
  ].join('\n');
}

function runChecker(options: { contracts: string; sql: string; verify?: boolean }): {
  status: number | null;
  output: string;
} {
  const args = [checker, '--contracts', options.contracts, '--sql', options.sql];
  if (options.verify) args.push('--verify');
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('paridade automatizada do contrato de mídia', () => {
  const canonical = [
    'avatar',
    'banner',
    'image',
    'audio',
    'cover',
    'frame',
    'badge',
    'background',
    'card',
    'widget',
    'other',
  ];
  let tempDir: string;
  let fixtureCount = 0;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hattz-media-parity-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function fixture(contracts: string[], sql: string[]): { contracts: string; sql: string } {
    fixtureCount += 1;
    const contractsPath = join(tempDir, `contracts-${fixtureCount}.ts`);
    const sqlPath = join(tempDir, `constraint-${fixtureCount}.sql`);
    writeFileSync(contractsPath, contractSource(contracts), 'utf8');
    writeFileSync(sqlPath, sqlSource(sql), 'utf8');
    return { contracts: contractsPath, sql: sqlPath };
  }

  it('aprova as fontes reais no modo normal e no modo --verify', () => {
    expect(runChecker({ contracts: realContracts, sql: realSql }).status).toBe(0);
    expect(runChecker({ contracts: realContracts, sql: realSql, verify: true }).status).toBe(0);
  });

  it('detecta valor ausente no CHECK SQL', () => {
    const result = runChecker(
      fixture(
        canonical,
        canonical.filter((value) => value !== 'other'),
      ),
    );
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/ausentes no CHECK SQL: other/);
  });

  it('detecta valor extra no CHECK SQL', () => {
    const result = runChecker(fixture(canonical, [...canonical, 'sticker']));
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/extras no CHECK SQL: sticker/);
  });

  it('detecta duplicata no CHECK SQL', () => {
    const result = runChecker(fixture(canonical, [...canonical, 'banner']));
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/duplicados no CHECK SQL: banner/);
  });

  it('detecta duplicata em MEDIA_ASSET_KINDS', () => {
    const result = runChecker(fixture([...canonical, 'image'], canonical));
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/duplicados em MEDIA_ASSET_KINDS: image/);
  });

  it('detecta divergência de ordem', () => {
    const result = runChecker(fixture(canonical, [...canonical].reverse()));
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/ordem divergente/);
  });

  it('detecta CHECK ausente ou renomeado', () => {
    fixtureCount += 1;
    const sqlPath = join(tempDir, `sem-constraint-${fixtureCount}.sql`);
    writeFileSync(sqlPath, 'alter table public.media_assets drop constraint anything;\n', 'utf8');
    const result = runChecker({ contracts: realContracts, sql: sqlPath });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/esperado 1 CHECK/);
  });
});
