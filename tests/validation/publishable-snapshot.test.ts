import { describe, expect, it } from 'vitest';
import { validatePublishableSnapshotContent } from '@hattz/validation';

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
  seo: { title: 't', description: 'd' },
};

describe('publishable snapshot validation (recursive, explicit schema)', () => {
  it('accepts valid publishable content', () => {
    const res = validatePublishableSnapshotContent(validContent);
    expect(res.ok).toBe(true);
  });

  it('rejects forbidden/private/admin/credential/draft/internal keys recursively', () => {
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
    ];

    for (const sample of cases) {
      const res = validatePublishableSnapshotContent(sample);
      expect(res.ok).toBe(false);
      expect(res.issues.some((i) => i.code.startsWith('snapshot.'))).toBe(true);
    }
  });

  it('rejects unknown keys and invalid structure (explicit schema)', () => {
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
