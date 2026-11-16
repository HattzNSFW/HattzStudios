import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePublishableSnapshotContent } from '@hattz/validation';

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
      id: 'sec1',
      type: 'hero',
      visible: true,
      order: 0,
      blocks: [
        {
          id: 'blk1',
          type: 'text',
          visible: true,
          order: 0,
          props: { text: 'Olá' },
        },
      ],
    },
  ],
  theme: { color: 'x' },
  effects: { glow: true },
  seo: { title: 't', description: 'd' },
};

describe('publishable snapshot validation — TypeScript validator (automated)', () => {
  it('accepts valid publishable content', () => {
    const res = validatePublishableSnapshotContent(validContent);
    expect(res.ok).toBe(true);
  });

  it('rejects forbidden/private/admin/credential/draft/internal keys recursively (incl. underscore variants and nested arrays/props)', () => {
    const cases = [
      { ...validContent, adminNotes: 'x' },
      { ...validContent, profile: { ...validContent.profile, passwordHash: 'x' } },
      { ...validContent, sections: [{ ...validContent.sections[0], draftState: true }] },
      {
        ...validContent,
        sections: [
          {
            ...validContent.sections[0],
            blocks: [{ ...validContent.sections[0].blocks[0], props: { token: 'x' } }],
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
            ...validContent.sections[0],
            blocks: [
              {
                ...validContent.sections[0].blocks[0],
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

  it('rejects unknown keys and invalid structure/types/lengths (explicit schema)', () => {
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
            ...validContent.sections[0],
            id: 'x'.repeat(129),
            blocks: validContent.sections[0].blocks,
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('does not allow unpublished draft markers inside content', () => {
    const res = validatePublishableSnapshotContent({
      ...validContent,
      sections: [
        {
          ...validContent.sections[0],
          blocks: [{ ...validContent.sections[0].blocks[0], props: { isDraft: true } }],
        },
      ],
    });
    expect(res.ok).toBe(false);
  });
});

describe('publishable snapshot validation — TS/SQL structural equivalence (migration SQL inspection)', () => {
  it('SQL validator enforces same core constraints: recursive forbidden scan, explicit allowed keys, required structure and key length/type limits', () => {
    // Forbidden/recursive scan parity (key blocking present; some tokens underscore-tolerant)
    expect(sql).toMatch(/with recursive kv/);
    expect(sql).toMatch(/role\[_\]\?assignment/);
    expect(sql).toMatch(/permission\[_\]\?override/);
    expect(sql).toMatch(/storage_path/);
    expect(sql).toMatch(/storage_bucket/);
    expect(sql).toMatch(/manifest_ref/);
    expect(sql).toMatch(/ip_hash/);

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

    // Structural/type/length checks parity for key fields
    expect(sql).toContain("length(content->'profile'->>'displayName') > 80");
    expect(sql).toContain("length(content->'profile'->>'bio') > 2000");
    expect(sql).toContain("length(content->'seo'->>'title') > 120");
    expect(sql).toContain("length(section->>'id') > 128");
    expect(sql).toContain("jsonb_typeof(blk->'props') = 'object'");
  });

  it('DB trigger blocks invalid snapshots at write boundary (not only app-side)', () => {
    expect(sql).toContain('create trigger trg_validate_publishable_snapshot');
    expect(sql).toContain(
      'before insert or update of content, visibility on public.profile_public_snapshots',
    );
    expect(sql).toContain("raise exception 'Snapshot content is not publishable");
  });
});
