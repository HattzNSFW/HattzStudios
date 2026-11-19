import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SNAPSHOT_LIMITS, validatePublishableSnapshotContent } from '@hattz/validation';

const sql = readFileSync(
  resolve(
    process.cwd(),
    'infrastructure/supabase/migrations/0009_hardening_public_views_and_snapshot_validation.sql',
  ),
  'utf8',
);

const validContent = {
  schemaVersion: 1,
  profile: {
    displayName: 'Perfil Público',
    bio: 'Bio segura',
    avatarAssetId: 'asset_avatar_1',
  },
  sections: [
    {
      id: 'sec-1',
      type: 'hero',
      visible: true,
      order: 0,
      blocks: [
        {
          id: 'blk-1',
          type: 'text',
          visible: true,
          order: 0,
          props: { text: 'Olá', nested: { enabled: true } },
        },
      ],
    },
  ],
  theme: { color: 'x', tokens: { radius: 8 } },
  effects: { glow: true },
  seo: { title: 't', description: 'd' },
};

function deepObject(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { leaf: 'ok' };
  for (let i = 0; i < depth; i++) obj = { [`k${i}`]: obj };
  return obj;
}

describe('publishable snapshot validation — TypeScript validator (automated)', () => {
  it('accepts valid publishable content with controlled extensible props/theme/effects', () => {
    const res = validatePublishableSnapshotContent(validContent);
    expect(res.ok).toBe(true);
  });

  it('rejects forbidden/private/admin/credential/draft/internal keys recursively (incl. underscore variants and nested arrays/props)', () => {
    const cases = [
      { ...validContent, adminNotes: 'x' },
      { ...validContent, profile: { ...validContent.profile, passwordHash: 'x' } },
      { ...validContent, sections: [{ ...validContent.sections[0]!, draftState: true }] },
      {
        ...validContent,
        sections: [
          {
            ...validContent.sections[0]!,
            blocks: [{ ...validContent.sections[0]!.blocks[0]!, props: { token: 'x' } }],
          },
        ],
      },
      { ...validContent, seo: { title: 't', internalConfig: 'x' } },
      { ...validContent, metadata: { storage_path: '/private' } },
      { ...validContent, profile: { ...validContent.profile, sessionId: 's' } },
      { ...validContent, auditInfo: {} },
      {
        ...validContent,
        sections: [
          {
            ...validContent.sections[0]!,
            blocks: [
              {
                ...validContent.sections[0]!.blocks[0]!,
                props: { nested: [{ role_assignment: 'x' }] },
              },
            ],
          },
        ],
      },
      { ...validContent, theme: { feature_flag: true } },
      { ...validContent, effects: { sync_operation: {} } },
    ];

    for (const sample of cases) {
      const res = validatePublishableSnapshotContent(sample);
      expect(res.ok).toBe(false);
      expect(res.issues.some((i) => i.code.startsWith('snapshot.'))).toBe(true);
    }
  });

  it('rejects unknown keys and invalid structure/types/lengths/formats (explicit schema)', () => {
    expect(validatePublishableSnapshotContent({ ...validContent, extraRoot: 1 }).ok).toBe(false);
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        profile: { displayName: 'A', unknown: 1 },
      }).ok,
    ).toBe(false);
    expect(
      validatePublishableSnapshotContent({ schemaVersion: 1, profile: { displayName: 'A' } }).ok,
    ).toBe(false); // missing sections
    expect(
      validatePublishableSnapshotContent({ ...validContent, sections: 'nope' as unknown }).ok,
    ).toBe(false);
    expect(validatePublishableSnapshotContent({ ...validContent, schemaVersion: 0 }).ok).toBe(
      false,
    );
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        profile: { ...validContent.profile, displayName: 'x'.repeat(81) },
      }).ok,
    ).toBe(false);
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        sections: [
          {
            ...validContent.sections[0]!,
            id: 'bad id!',
            blocks: validContent.sections[0]!.blocks,
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        profile: { ...validContent.profile, avatarAssetId: '../bad' },
      }).ok,
    ).toBe(false);
  });

  it('enforces explicit limits (sections, blocks, arrays, object keys, depth, string/size, controlled extensibility)', () => {
    // too many sections
    const manySections = Array.from({ length: SNAPSHOT_LIMITS.maxSections + 1 }, (_, i) => ({
      ...validContent.sections[0]!,
      id: `s-${i}`,
    }));
    expect(validatePublishableSnapshotContent({ ...validContent, sections: manySections }).ok).toBe(
      false,
    );

    // too many blocks per section
    const manyBlocks = Array.from({ length: SNAPSHOT_LIMITS.maxBlocksPerSection + 1 }, (_, i) => ({
      ...validContent.sections[0]!.blocks[0]!,
      id: `b-${i}`,
    }));
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        sections: [{ ...validContent.sections[0]!, blocks: manyBlocks }],
      }).ok,
    ).toBe(false);

    // array/object/key/depth/type limits in extensible props/theme/effects
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        theme: { arr: Array.from({ length: SNAPSHOT_LIMITS.maxArrayElements + 1 }, () => 1) },
      }).ok,
    ).toBe(false);
    const manyKeys: Record<string, number> = {};
    for (let i = 0; i < SNAPSHOT_LIMITS.maxObjectKeys + 1; i++) manyKeys[`k${i}`] = i;
    expect(validatePublishableSnapshotContent({ ...validContent, effects: manyKeys }).ok).toBe(
      false,
    );
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        sections: [
          {
            ...validContent.sections[0]!,
            blocks: [
              {
                ...validContent.sections[0]!.blocks[0]!,
                props: deepObject(SNAPSHOT_LIMITS.maxDepth + 2),
              },
            ],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        theme: { 'bad key': 'x' },
      }).ok,
    ).toBe(false);
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        sections: [
          {
            ...validContent.sections[0]!,
            blocks: [
              {
                ...validContent.sections[0]!.blocks[0]!,
                props: { txt: 'x'.repeat(SNAPSHOT_LIMITS.maxStringLength + 1) },
              },
            ],
          },
        ],
      }).ok,
    ).toBe(false);

    // total payload size limit
    expect(
      validatePublishableSnapshotContent({
        ...validContent,
        seo: { description: 'x'.repeat(SNAPSHOT_LIMITS.maxTotalBytes) },
      }).ok,
    ).toBe(false);
  });

  it('does not allow unpublished draft markers inside content', () => {
    const res = validatePublishableSnapshotContent({
      ...validContent,
      sections: [
        {
          ...validContent.sections[0]!,
          blocks: [{ ...validContent.sections[0]!.blocks[0]!, props: { isDraft: true } }],
        },
      ],
    });
    expect(res.ok).toBe(false);
  });

  it('accepts section/block ids up to 128 chars (TS/SQL parity) and rejects longer ids', () => {
    const id128 = 'a'.repeat(SNAPSHOT_LIMITS.maxIdLength);
    const accepted = validatePublishableSnapshotContent({
      ...validContent,
      sections: [
        {
          ...validContent.sections[0]!,
          id: id128,
          blocks: [{ ...validContent.sections[0]!.blocks[0]!, id: id128 }],
        },
      ],
    });
    expect(accepted.ok).toBe(true);

    const rejected = validatePublishableSnapshotContent({
      ...validContent,
      sections: [{ ...validContent.sections[0]!, id: 'a'.repeat(SNAPSHOT_LIMITS.maxIdLength + 1) }],
    });
    expect(rejected.ok).toBe(false);
  });

  it('fails closed (returns a failure) on circular content instead of throwing', () => {
    const circular: Record<string, unknown> = {
      schemaVersion: 1,
      profile: { displayName: 'A' },
      sections: [],
    };
    circular.self = circular;

    expect(() => validatePublishableSnapshotContent(circular)).not.toThrow();
    expect(validatePublishableSnapshotContent(circular).ok).toBe(false);
  });
});

describe('publishable snapshot validation — TS/SQL structural equivalence (migration SQL inspection)', () => {
  it('SQL validator enforces same core constraints: recursive forbidden scan, explicit schema, limits and controlled extensibility', () => {
    // Forbidden/recursive scan and limits
    expect(sql).toMatch(/with recursive walk/);
    expect(sql).toMatch(/role\[_\]\?assignment/);
    expect(sql).toMatch(/permission\[_\]\?override/);
    expect(sql).toMatch(/storage_path/);
    expect(sql).toMatch(/storage_bucket/);
    expect(sql).toMatch(/manifest_ref/);
    expect(sql).toMatch(/ip_hash/);
    expect(sql).toContain('max_total_bytes int := 262144');
    expect(sql).toContain('max_depth int := 12');
    expect(sql).toContain('max_sections int := 50');
    expect(sql).toContain('max_blocks_per_section int := 50');
    expect(sql).toContain('max_array_elements int := 100');
    expect(sql).toContain('max_object_keys int := 50');

    // Explicit schema parity
    expect(sql).toContain(
      "allowed_root text[] := array['schemaVersion','profile','sections','theme','effects','seo']",
    );
    expect(sql).toContain(
      "allowed_profile text[] := array['displayName','bio','avatarAssetId','bannerAssetId']",
    );
    expect(sql).toContain(
      "allowed_section text[] := array['id','type','visible','order','blocks']",
    );
    expect(sql).toContain("allowed_block text[] := array['id','type','visible','order','props']");
    expect(sql).toContain("allowed_seo text[] := array['title','description']");

    // Structural/type/length/format and controlled extensibility parity
    expect(sql).toContain("length(content->'profile'->>'displayName') > 80");
    expect(sql).toContain("length(content->'profile'->>'bio') > 2000");
    expect(sql).toContain("length(content->'seo'->>'title') > 120");
    expect(sql).toMatch(/avatarAssetId' !~ '\^\[a-zA-Z0-9_-]\{1,128\}\$'/);
    expect(sql).toMatch(/section->>'id' !~ '\^\[a-zA-Z0-9_-]\{1,128\}\$'/);
    expect(sql).toContain("jsonb_typeof(blk->'props') = 'object'");
    expect(sql).toMatch(/p\.key !~ '\^\[a-zA-Z0-9_-]\{1,64\}\$'/);
  });

  it('keeps TS and SQL forbidden-key semantics aligned for design tokens (word-boundary fix)', () => {
    // TS validator uses JS \b (a real word boundary), so the legitimate key `tokens`
    // (design tokens) is allowed while a bare `token` is rejected.
    expect(
      validatePublishableSnapshotContent({ ...validContent, theme: { tokens: { radius: 8 } } }).ok,
    ).toBe(true);
    expect(validatePublishableSnapshotContent({ ...validContent, theme: { token: 'x' } }).ok).toBe(
      false,
    );

    // PostgreSQL ARE `\b` is NOT a word boundary (it is a backspace); the SQL validator must
    // use `\y`. Otherwise `tokens` would be wrongly rejected by the DB trigger while accepted
    // by the app validator (TS↔SQL divergence).
    expect(sql).toContain('token(?!s\\y)');
    expect(sql).not.toContain('token(?!s\\b)');
  });

  it('DB trigger blocks invalid snapshots at write boundary (not only app-side)', () => {
    expect(sql).toContain('create trigger trg_validate_publishable_snapshot');
    expect(sql).toContain(
      'before insert or update of content, visibility on public.profile_public_snapshots',
    );
    expect(sql).toContain("raise exception 'Snapshot content is not publishable");
  });
});
