// Single source of truth for SQL<->TS validator parity cases (migration 0009).
//
// Running this script regenerates BOTH committed artifacts:
//   * tests/fixtures/publishable-snapshot-parity.json  (consumed by the Vitest suite)
//   * infrastructure/supabase/validation/sql/30_validator_parity.sql (consumed by psql)
// so the TS and SQL validators are exercised against exactly the same inputs.
//
// Usage:
//   node infrastructure/supabase/validation/parity/build_parity.mjs           # regenerates artifacts
//   node infrastructure/supabase/validation/parity/build_parity.mjs --verify  # CI/test gate
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');

const rep = (n, ch = 'x') => ch.repeat(n);
const astral = (n) => '\u{1F600}'.repeat(n);
// Object chain of `levels` objects ending in a scalar. Used to probe maxDepth.
function chain(levels, leaf = 'leaf') {
  let v = leaf;
  for (let i = 0; i < levels; i++) v = { n: v };
  return v;
}
function keys(n) {
  const o = {};
  for (let i = 0; i < n; i++) o[`k${i}`] = i;
  return o;
}
function section(overrides = {}) {
  return {
    id: 'sec-1',
    type: 'hero',
    visible: true,
    order: 0,
    blocks: [{ id: 'blk-1', type: 'text', visible: true, order: 0, props: { text: 'hi' } }],
    ...overrides,
  };
}
function base(overrides = {}) {
  return {
    schemaVersion: 1,
    profile: { displayName: 'Perfil', bio: 'bio', avatarAssetId: 'asset_1' },
    sections: [section()],
    theme: { color: '#fff', tokens: { radius: 8 } },
    effects: { glow: true },
    seo: { title: 't', description: 'd' },
    ...overrides,
  };
}
// Content with a single block whose props are exactly `props`.
function withProps(props) {
  return base({
    sections: [
      section({ blocks: [{ id: 'blk-1', type: 'text', visible: true, order: 0, props }] }),
    ],
  });
}

const cases = [
  // --- valid ---
  { id: 'valid_base', expect: true, content: base() },
  {
    id: 'valid_minimal',
    expect: true,
    content: { schemaVersion: 1, profile: { displayName: 'A' }, sections: [] },
  },
  { id: 'tokens_accepted', expect: true, content: base({ theme: { tokens: { radius: 8 } } }) },

  // --- SQL NULL vs JSON null ---
  { id: 'sql_null', expect: false, content: null, sql: 'NULL::jsonb' },
  { id: 'json_null', expect: false, content: null, sql: "'null'::jsonb" },

  // --- non-object roots ---
  { id: 'root_scalar_number', expect: false, content: 5 },
  { id: 'root_scalar_string', expect: false, content: 'x' },
  { id: 'root_array', expect: false, content: [1, 2] },

  // --- schemaVersion ---
  {
    id: 'schema_version_missing',
    expect: false,
    content: { profile: { displayName: 'A' }, sections: [] },
  },
  { id: 'schema_version_zero', expect: false, content: base({ schemaVersion: 0 }) },
  { id: 'schema_version_negative', expect: false, content: base({ schemaVersion: -1 }) },
  { id: 'schema_version_decimal', expect: false, content: base({ schemaVersion: 1.5 }) },
  { id: 'schema_version_string', expect: false, content: base({ schemaVersion: '1' }) },
  {
    id: 'schema_version_safe_large',
    expect: true,
    content: base({ schemaVersion: 9007199254740991 }),
  },
  {
    id: 'schema_version_over_safe',
    expect: false,
    content: base({ schemaVersion: 9007199254740992 }),
  },
  { id: 'schema_version_huge', expect: false, content: base({ schemaVersion: 1e21 }) },

  // --- scalars where objects/arrays expected ---
  { id: 'profile_scalar', expect: false, content: base({ profile: 'x' }) },
  { id: 'sections_scalar', expect: false, content: base({ sections: 'nope' }) },
  { id: 'section_scalar_in_array', expect: false, content: base({ sections: [5] }) },
  {
    id: 'block_scalar_in_array',
    expect: false,
    content: base({ sections: [section({ blocks: [5] })] }),
  },
  { id: 'props_scalar', expect: false, content: withProps(5) },
  { id: 'theme_scalar', expect: false, content: base({ theme: 5 }) },
  { id: 'effects_array', expect: false, content: base({ effects: [1, 2] }) },
  { id: 'seo_scalar', expect: false, content: base({ seo: 'x' }) },

  // --- forbidden keys at several levels ---
  { id: 'forbidden_root', expect: false, content: base({ adminNotes: 'x' }) },
  {
    id: 'forbidden_profile',
    expect: false,
    content: base({ profile: { displayName: 'A', passwordHash: 'x' } }),
  },
  {
    id: 'forbidden_section',
    expect: false,
    content: base({ sections: [section({ draftState: true })] }),
  },
  {
    id: 'forbidden_props_nested',
    expect: false,
    content: withProps({ nested: [{ role_assignment: 'x' }] }),
  },
  { id: 'forbidden_theme', expect: false, content: base({ theme: { feature_flag: true } }) },
  { id: 'forbidden_effects', expect: false, content: base({ effects: { sync_operation: {} } }) },
  {
    id: 'forbidden_seo',
    expect: false,
    content: base({ seo: { title: 't', internalConfig: 'x' } }),
  },
  { id: 'token_rejected', expect: false, content: base({ theme: { token: 'x' } }) },
  { id: 'token_nested_rejected', expect: false, content: withProps({ token: 'x' }) },
  // Internal ownership identifiers must never reach a public snapshot.
  { id: 'forbidden_technical_id', expect: false, content: withProps({ technicalId: 'prof_1' }) },
  { id: 'forbidden_profile_id', expect: false, content: base({ theme: { profile_id: 'p1' } }) },
  { id: 'forbidden_is_official', expect: false, content: base({ effects: { isOfficial: true } }) },
  { id: 'forbidden_owner', expect: false, content: withProps({ owner: 'x' }) },

  // --- ids ---
  {
    id: 'id_valid_128',
    expect: true,
    content: base({
      sections: [
        section({
          id: rep(128),
          blocks: [{ id: rep(128), type: 'text', visible: true, order: 0, props: {} }],
        }),
      ],
    }),
  },
  { id: 'id_over_128', expect: false, content: base({ sections: [section({ id: rep(129) })] }) },
  {
    id: 'id_invalid_chars',
    expect: false,
    content: base({ sections: [section({ id: 'bad id!' })] }),
  },
  {
    id: 'block_id_over_128',
    expect: false,
    content: base({
      sections: [
        section({ blocks: [{ id: rep(129), type: 'text', visible: true, order: 0, props: {} }] }),
      ],
    }),
  },
  {
    id: 'duplicate_ids_allowed',
    expect: true,
    content: base({ sections: [section({ id: 'dup' }), section({ id: 'dup' })] }),
  },

  // --- order ---
  { id: 'order_non_integer', expect: true, content: base({ sections: [section({ order: 1.5 })] }) },
  { id: 'order_string', expect: false, content: base({ sections: [section({ order: '1' })] }) },
  {
    id: 'order_missing',
    expect: false,
    content: base({ sections: [section({ order: undefined })] }),
  },

  // --- limits: arrays / objects / strings ---
  {
    id: 'array_at_limit',
    expect: true,
    content: base({ theme: { arr: Array.from({ length: 100 }, () => 1) } }),
  },
  {
    id: 'array_over_limit',
    expect: false,
    content: base({ theme: { arr: Array.from({ length: 101 }, () => 1) } }),
  },
  { id: 'object_at_limit', expect: true, content: withProps(keys(50)) },
  { id: 'object_over_limit', expect: false, content: withProps(keys(51)) },
  { id: 'string_at_limit', expect: true, content: withProps({ txt: rep(2000) }) },
  { id: 'string_over_limit', expect: false, content: withProps({ txt: rep(2001) }) },
  { id: 'string_astral_at_limit', expect: true, content: withProps({ txt: astral(2000) }) },
  { id: 'string_astral_over_limit', expect: false, content: withProps({ txt: astral(2001) }) },
  {
    id: 'display_name_astral_at_limit',
    expect: true,
    content: base({ profile: { displayName: astral(80) } }),
  },
  { id: 'display_name_over', expect: false, content: base({ profile: { displayName: rep(81) } }) },
  // SQL `btrim` removes only U+0020; JS `trim()` removes the whole Unicode White_Space set.
  { id: 'display_name_tab_only', expect: false, content: base({ profile: { displayName: '\t' } }) },
  {
    id: 'display_name_newline_only',
    expect: false,
    content: base({ profile: { displayName: '\n' } }),
  },
  {
    id: 'display_name_nbsp_only',
    expect: false,
    content: base({ profile: { displayName: '\u00a0' } }),
  },
  {
    id: 'schema_version_decimal_point_zero',
    expect: true,
    content: base({ schemaVersion: 1 }),
    // JSON.stringify(1) emits `1`; the SQL side must exercise the JSON literal `1.0`, which is
    // the same integer for the TS validator (Number.isSafeInteger(1.0) === true).
    sql: `$j$${JSON.stringify(base()).replace('"schemaVersion":1,', '"schemaVersion":1.0,')}$j$::jsonb`,
  },
  { id: 'props_key_invalid', expect: false, content: withProps({ 'bad key': 'x' }) },

  // --- sections / blocks limits ---
  {
    id: 'sections_at_limit',
    expect: true,
    content: base({ sections: Array.from({ length: 50 }, (_, i) => section({ id: `s-${i}` })) }),
  },
  {
    id: 'sections_over_limit',
    expect: false,
    content: base({ sections: Array.from({ length: 51 }, (_, i) => section({ id: `s-${i}` })) }),
  },
  {
    id: 'blocks_over_limit',
    expect: false,
    content: base({
      sections: [
        section({
          blocks: Array.from({ length: 51 }, (_, i) => ({
            id: `b-${i}`,
            type: 'text',
            visible: true,
            order: 0,
            props: {},
          })),
        }),
      ],
    }),
  },

  // --- depth (absolute from content root, matching the SQL recursive walk) ---
  // `theme` sits at absolute depth 1, so a `chain(n)` leaf lands at depth 1+n; the at-limit
  // case is n=11 (leaf at 12) and n=12 is the first rejected case.
  { id: 'depth_props_at_limit', expect: true, content: withProps({ p: chain(6) }) },
  { id: 'depth_props_over_limit', expect: false, content: withProps({ p: chain(7) }) },
  { id: 'depth_theme_at_limit', expect: true, content: base({ theme: chain(11) }) },
  { id: 'depth_theme_over_limit', expect: false, content: base({ theme: chain(12) }) },

  // --- unknown keys ---
  { id: 'unknown_root_key', expect: false, content: base({ extraRoot: 1 }) },
  {
    id: 'unknown_profile_key',
    expect: false,
    content: base({ profile: { displayName: 'A', unknown: 1 } }),
  },
  {
    id: 'unknown_section_key',
    expect: false,
    content: base({ sections: [section({ extra: 1 })] }),
  },
  {
    id: 'unknown_block_key',
    expect: false,
    content: base({
      sections: [
        section({ blocks: [{ id: 'b', type: 't', visible: true, order: 0, props: {}, extra: 1 }] }),
      ],
    }),
  },

  // --- seo lengths / asset refs ---
  { id: 'seo_title_over', expect: false, content: base({ seo: { title: rep(121) } }) },
  { id: 'seo_description_over', expect: false, content: base({ seo: { description: rep(301) } }) },
  {
    id: 'asset_invalid',
    expect: false,
    content: base({ profile: { displayName: 'A', avatarAssetId: '../bad' } }),
  },
  {
    id: 'bio_over',
    expect: false,
    content: base({ profile: { displayName: 'A', bio: rep(2001) } }),
  },
];

// Strip `undefined` produced by `section({ order: undefined })` so the JSON stays valid.
const clean = (v) => JSON.parse(JSON.stringify(v ?? null));

const fixture = {
  $comment:
    'GENERATED by infrastructure/supabase/validation/parity/build_parity.mjs — do not edit by hand.',
  cases: cases.map((c) => ({
    id: c.id,
    expect: c.expect,
    content: clean(c.content),
    ...(c.sql ? { sql: c.sql } : {}),
  })),
};

const verifyMode = process.argv.includes('--verify');
function emit(path, content) {
  if (!verifyMode) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
    console.log(`wrote ${path}`);
    return;
  }
  let current = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    current = null;
  }
  if (current !== content) {
    console.error(`PARITY ARTIFACT OUT OF DATE: ${path} — run build_parity.mjs`);
    process.exitCode = 1;
  } else {
    console.log(`PARITY ARTIFACT OK: ${path}`);
  }
}

const fixturePath = resolve(repoRoot, 'tests', 'fixtures', 'publishable-snapshot-parity.json');
// Format with the project's Prettier config so the generated fixture is stable under `npm run format`.
const prettierOptions = (await prettier.resolveConfig(fixturePath)) ?? {};
const fixtureJson = await prettier.format(JSON.stringify(fixture), {
  ...prettierOptions,
  parser: 'json',
});
emit(fixturePath, fixtureJson);

const jsonLiteral = (c) => c.sql ?? `$j$${JSON.stringify(c.content)}$j$::jsonb`;

const sqlLines = [];
sqlLines.push('-- GENERATED by infrastructure/supabase/validation/parity/build_parity.mjs');
sqlLines.push(
  '-- SQL side of the 0009 validator parity check. Mirrors tests/fixtures/publishable-snapshot-parity.json.',
);
sqlLines.push(
  '-- Hard-fails (non-zero exit under ON_ERROR_STOP) on any SQL<->expected divergence.',
);
sqlLines.push('\\set ON_ERROR_STOP 1');
sqlLines.push('');
sqlLines.push('begin;');
sqlLines.push('');
sqlLines.push(
  'create temp table parity_cases (id text primary key, expect boolean, content jsonb) on commit drop;',
);
sqlLines.push('insert into parity_cases (id, expect, content) values');
sqlLines.push(
  fixture.cases.map((c) => `  ('${c.id}', ${c.expect}, ${jsonLiteral(c)})`).join(',\n') + ';',
);
sqlLines.push('');
sqlLines.push('create temp table parity_results on commit drop as');
sqlLines.push('select c.id,');
sqlLines.push('       c.expect,');
sqlLines.push(
  '       coalesce(public.validate_publishable_snapshot_content(c.content) is true, false) as accepted',
);
sqlLines.push('from parity_cases c;');
sqlLines.push('');
sqlLines.push('do $$');
sqlLines.push('declare');
sqlLines.push('  r record;');
sqlLines.push('  total int;');
sqlLines.push('begin');
sqlLines.push('  select count(*) into total from parity_results;');
sqlLines.push(
  '  for r in select * from parity_results where accepted is distinct from expect order by id loop',
);
sqlLines.push(
  "    raise exception 'PARITY FAIL: case % expected % got %', r.id, r.expect, r.accepted;",
);
sqlLines.push('  end loop;');
sqlLines.push("  raise notice 'PARITY OK: % cases matched expected result', total;");
sqlLines.push('end $$;');
sqlLines.push('');
sqlLines.push('commit;');

const sqlPath = resolve(here, '..', 'sql', '30_validator_parity.sql');
emit(sqlPath, `${sqlLines.join('\n')}\n`);

console.log(`cases: ${fixture.cases.length}`);
