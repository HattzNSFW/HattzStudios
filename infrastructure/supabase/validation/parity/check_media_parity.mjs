// Parity gate for the canonical media contract (migration 0017).
//
// There is deliberately NO generator here: migration 0017 is immutable and must never be rewritten.
// This script reads two sources as text and fails (exit 1) on ANY divergence:
//   * packages/contracts/src/domains.ts  -> MEDIA_ASSET_KINDS (canonical source)
//   * migrations/0017_media_kind_canonical.sql -> ck_media_assets_kind_canonical CHECK
//
// Usage:
//   node infrastructure/supabase/validation/parity/check_media_parity.mjs
//   node infrastructure/supabase/validation/parity/check_media_parity.mjs --verify
//   node ... check_media_parity.mjs --contracts <file> --sql <file>   # negative tests
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');

const DEFAULT_CONTRACTS = resolve(repoRoot, 'packages/contracts/src/domains.ts');
const DEFAULT_SQL = resolve(
  repoRoot,
  'infrastructure/supabase/migrations/0017_media_kind_canonical.sql',
);

function fail(message) {
  console.error(`MEDIA PARITY FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { contracts: DEFAULT_CONTRACTS, sql: DEFAULT_SQL, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--verify') {
      options.verify = true;
    } else if (arg === '--contracts' || arg === '--sql') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(`${arg} exige um caminho.`);
      options[arg === '--contracts' ? 'contracts' : 'sql'] = resolve(value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Uso: check_media_parity.mjs [--verify] [--contracts <arquivo>] [--sql <arquivo>]',
      );
      process.exit(0);
    } else {
      fail(`argumento desconhecido: ${arg}`);
    }
  }
  return options;
}

/** Extrai os literais de MEDIA_ASSET_KINDS sem executar TypeScript. */
function parseContracts(source) {
  const declarations = [
    ...source.matchAll(/export\s+const\s+MEDIA_ASSET_KINDS\s*=\s*\[([\s\S]*?)\]\s*as\s+const\s*;/g),
  ];
  if (declarations.length !== 1) {
    fail(`esperada 1 declaracao de MEDIA_ASSET_KINDS; encontradas ${declarations.length}.`);
  }
  const body = declarations[0][1];
  const literal = /'([^']*)'/g;
  const values = [...body.matchAll(literal)].map((match) => match[1]);
  const residual = body
    .replace(literal, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[\s,]/g, '');
  if (residual) fail(`MEDIA_ASSET_KINDS contem expressao nao literal: ${residual}`);
  if (values.some((value) => !/^[a-z0-9_-]+$/i.test(value))) {
    fail('MEDIA_ASSET_KINDS contem valor que nao e identificador simples.');
  }
  return values;
}

/** Extrai os literais do CHECK canonico da migration 0017 sem executar SQL. */
function parseSql(source) {
  const checks = [...source.matchAll(/check\s*\(\s*kind\s+in\s*\(([\s\S]*?)\)\s*\)/gi)];
  if (checks.length !== 1) {
    fail(`esperado 1 CHECK (kind in ...) na migration; encontrados ${checks.length}.`);
  }
  const constraint = source.match(/add\s+constraint\s+ck_media_assets_kind_canonical\b/i);
  if (!constraint) fail('constraint ck_media_assets_kind_canonical ausente ou renomeada.');

  const body = checks[0][1];
  const literal = /'([^']*)'/g;
  const values = [...body.matchAll(literal)].map((match) => match[1]);
  const residual = body
    .replace(literal, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[\s,]/g, '');
  if (residual) fail(`CHECK SQL contem expressao nao literal: ${residual}`);
  if (values.some((value) => !/^[a-z0-9_-]+$/i.test(value))) {
    fail('CHECK SQL contem valor que nao e identificador simples.');
  }
  return values;
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function compare(contractValues, sqlValues) {
  const problems = [];

  const duplicateContracts = duplicates(contractValues);
  if (duplicateContracts.length) {
    problems.push(`valores duplicados em MEDIA_ASSET_KINDS: ${duplicateContracts.join(', ')}`);
  }
  const duplicateSql = duplicates(sqlValues);
  if (duplicateSql.length) {
    problems.push(`valores duplicados no CHECK SQL: ${duplicateSql.join(', ')}`);
  }

  const sqlSet = new Set(sqlValues);
  const contractSet = new Set(contractValues);
  const missing = contractValues.filter((value) => !sqlSet.has(value));
  const extra = sqlValues.filter((value) => !contractSet.has(value));
  if (missing.length) problems.push(`ausentes no CHECK SQL: ${missing.join(', ')}`);
  if (extra.length) problems.push(`extras no CHECK SQL: ${extra.join(', ')}`);

  if (!missing.length && !extra.length && contractValues.join('|') !== sqlValues.join('|')) {
    problems.push('ordem divergente entre MEDIA_ASSET_KINDS e o CHECK SQL');
  }

  if (problems.length) {
    for (const problem of problems) console.error(`  - ${problem}`);
    fail(`${problems.length} divergencia(s) detectada(s).`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let contractsSource;
  let sqlSource;
  try {
    contractsSource = readFileSync(options.contracts, 'utf8');
  } catch (error) {
    fail(`nao foi possivel ler ${options.contracts}: ${error.message}`);
  }
  try {
    sqlSource = readFileSync(options.sql, 'utf8');
  } catch (error) {
    fail(`nao foi possivel ler ${options.sql}: ${error.message}`);
  }

  const contractValues = parseContracts(contractsSource);
  const sqlValues = parseSql(sqlSource);
  compare(contractValues, sqlValues);

  const prefix = options.verify ? 'MEDIA PARITY VERIFY OK' : 'MEDIA PARITY OK';
  console.log(`${prefix}: ${contractValues.length} valores (${contractValues.join(', ')})`);
  console.log(`  contracts: ${options.contracts}`);
  console.log(`  sql:       ${options.sql}`);
}

main();
