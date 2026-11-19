import { describe, expect, it } from 'vitest';
import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import { ShareContentError, parsePublishedSnapshot } from '@hattz/profile-view';

function snapshotWith(content: unknown): PublishedProfileSnapshotContract {
  return {
    slug: 'alice',
    profileVersion: 2,
    publishedAt: '2026-11-10T18:24:00.000Z',
    seoTitle: 'Top-level SEO',
    seoDescription: 'Top-level description',
    content: content as Record<string, unknown>,
  };
}

const validContent = {
  schemaVersion: 1,
  profile: { displayName: 'Alice Andrade', bio: 'Bio', avatarAssetId: 'avatar_alice' },
  theme: { accent: '#a78bfa', avatarFrame: 'frame-purple' },
  effects: { glow: true },
  sections: [
    {
      id: 'sec_b',
      type: 'links',
      visible: true,
      order: 2,
      blocks: [
        {
          id: 'b2',
          type: 'link',
          visible: true,
          order: 1,
          props: { label: 'X', url: 'https://x.test' },
        },
      ],
    },
    {
      id: 'sec_a',
      type: 'about',
      visible: true,
      order: 1,
      blocks: [
        { id: 'b_hidden', type: 'text', visible: false, order: 2, props: { text: 'oculto' } },
        { id: 'b1', type: 'text', visible: true, order: 1, props: { text: 'Olá' } },
      ],
    },
    { id: 'sec_hidden', type: 'content', visible: false, order: 3, blocks: [] },
  ],
};

describe('Share published snapshot parsing', () => {
  it('maps a valid snapshot into the render model, filtering invisible items and sorting by order', () => {
    const view = parsePublishedSnapshot(snapshotWith(validContent));

    expect(view.displayName).toBe('Alice Andrade');
    expect(view.bio).toBe('Bio');
    expect(view.avatarAssetId).toBe('avatar_alice');
    expect(view.bannerAssetId).toBeNull();
    expect(view.theme.accent).toBe('#a78bfa');
    expect(view.theme.avatarFrame).toBe('frame-purple');
    expect(view.effects.glow).toBe(true);

    // Invisible section removed; visible sections sorted by order.
    expect(view.sections.map((s) => s.id)).toEqual(['sec_a', 'sec_b']);

    // Invisible block removed; visible blocks sorted by order.
    const about = view.sections[0];
    expect(about?.blocks.map((b) => b.id)).toEqual(['b1']);
  });

  it('falls back to top-level SEO fields and prefers content SEO when present', () => {
    const fallback = parsePublishedSnapshot(snapshotWith(validContent));
    expect(fallback.seo.title).toBe('Top-level SEO');
    expect(fallback.seo.description).toBe('Top-level description');

    const preferred = parsePublishedSnapshot(
      snapshotWith({ ...validContent, seo: { title: 'Content SEO', description: 'From content' } }),
    );
    expect(preferred.seo.title).toBe('Content SEO');
    expect(preferred.seo.description).toBe('From content');
  });

  it('rejects content that does not match the public contract', () => {
    expect(() => parsePublishedSnapshot(snapshotWith({ schemaVersion: 1 }))).toThrow(
      ShareContentError,
    );
    expect(() =>
      parsePublishedSnapshot(snapshotWith({ ...validContent, draftNote: 'leak' })),
    ).toThrow(ShareContentError);
  });
});
