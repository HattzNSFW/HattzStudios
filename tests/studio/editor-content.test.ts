import { describe, expect, it } from 'vitest';
import type { PublishedProfileSnapshotContract } from '@hattz/contracts';
import { parsePublishedSnapshot } from '@hattz/profile-view';
import { validatePublishableSnapshotContent } from '@hattz/validation';
import {
  addBlock,
  addSection,
  buildPreview,
  createEmptyDraft,
  draftFromContent,
  moveBlock,
  removeBlock,
  slugForPreview,
  toSnapshotContent,
  toSnapshotRecord,
  updateBlockProps,
  withBlock,
  withProfile,
  withSeo,
  withSection,
  withTheme,
  type StudioDraft,
} from '../../apps/studio/src/editor';
import type { StudioBlockType } from '../../apps/studio/src/editor/blocks';

function richDraft(): StudioDraft {
  let draft = createEmptyDraft('Alice Andrade');
  draft = withProfile(draft, { bio: 'Bio do perfil' });
  draft = withTheme(draft, {
    accent: '#a78bfa',
    backgroundStyle: 'aurora',
    headingFont: 'serif',
    bodyFont: 'sans',
    radius: 20,
    avatarFrame: 'frame-purple',
    glow: true,
  });
  draft = withSeo(draft, { title: 'Alice', description: 'Página da Alice' });

  let about = addSection(draft, 'about');
  const aboutId = about.sections[0]!.id;
  const types: StudioBlockType[] = [
    'heading',
    'text',
    'link',
    'links',
    'image',
    'badges',
    'music',
    'divider',
  ];
  for (const type of types) {
    about = addBlock(about, aboutId, type);
  }
  return about;
}

describe('Studio -> Share content bridge', () => {
  it('serializes a rich draft into content the shared validator accepts', () => {
    const content = toSnapshotContent(richDraft());
    const result = validatePublishableSnapshotContent(content);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('omits empty optional profile fields and derives order from array position', () => {
    const draft = addSection(addSection(createEmptyDraft('Alice'), 'about'), 'links');
    const content = toSnapshotContent(draft);

    expect(content.profile).toEqual({ displayName: 'Alice' });
    expect(content.profile.bio).toBeUndefined();
    expect(content.profile.avatarAssetId).toBeUndefined();
    expect(content.profile.bannerAssetId).toBeUndefined();
    expect(content.sections.map((section) => section.order)).toEqual([0, 1]);
  });

  it('derives block order from array position after a reorder', () => {
    const section = createEmptyDraft('A');
    let draft = addSection(section, 'content');
    const sectionId = draft.sections[0]!.id;
    draft = addBlock(draft, sectionId, 'text');
    draft = addBlock(draft, sectionId, 'divider');
    const [firstBlock] = draft.sections[0]!.blocks;
    draft = moveBlock(draft, sectionId, firstBlock!.id, 1);

    const content = toSnapshotContent(draft);
    const blocks = content.sections[0]!.blocks;
    expect(blocks.map((block) => block.order)).toEqual([0, 1]);
    expect(blocks[0]!.type).toBe('divider');
  });

  it('produces a Record<string, unknown> record for persistence', () => {
    const record = toSnapshotRecord(richDraft());
    expect(record).toBeTypeOf('object');
    expect(record.schemaVersion).toBe(1);
    expect(Array.isArray(record.sections)).toBe(true);
  });

  it('round-trips a draft through the stored content format (order preserved)', () => {
    const original = richDraft();
    const restored = draftFromContent(toSnapshotContent(original));

    expect(restored.profile).toEqual(original.profile);
    expect(restored.theme).toEqual(original.theme);
    expect(restored.seo).toEqual(original.seo);
    expect(restored.sections.map((s) => s.type)).toEqual(original.sections.map((s) => s.type));
    expect(restored.sections[0]!.blocks.map((b) => b.type)).toEqual(
      original.sections[0]!.blocks.map((b) => b.type),
    );
    // Re-serializing the restored draft yields identical content (the stored format is stable;
    // empty optional props were omitted on the first pass and stay omitted).
    expect(toSnapshotContent(restored)).toEqual(toSnapshotContent(original));

    const byType = (type: StudioBlockType) =>
      restored.sections[0]!.blocks.find((block) => block.type === type)?.props;
    expect(byType('heading')).toEqual({ text: 'Novo título', level: 2 });
    expect(byType('text')).toEqual({ text: 'Escreva algo…' });
    expect(byType('link')).toEqual({ label: 'Meu link', url: 'https://' });
    expect(byType('badges')).toEqual({
      title: 'Conquistas',
      items: [{ name: 'Novo selo', rarity: 'comum' }],
    });
    expect(byType('music')).toEqual({ title: 'Nova faixa' });
    expect(byType('divider')).toEqual({});
  });

  it('is tolerant of missing/incomplete stored content', () => {
    const restored = draftFromContent({});
    expect(restored.schemaVersion).toBe(1);
    expect(restored.profile.displayName).toBe('');
    expect(restored.sections).toEqual([]);
  });
});

describe('Studio preview reuses the Share pipeline', () => {
  it('builds a renderable preview with no validation issues for a valid draft', () => {
    const preview = buildPreview(richDraft());
    expect(preview.issues).toEqual([]);
    expect(preview.profile).not.toBeNull();
    expect(preview.profile?.displayName).toBe('Alice Andrade');
  });

  it('matches what the Share renderer would parse from the same content', () => {
    const draft = richDraft();
    const content = toSnapshotContent(draft);
    const snapshot: PublishedProfileSnapshotContract = {
      slug: 'alice-andrade',
      profileVersion: 1,
      content: content as unknown as Record<string, unknown>,
    };
    const viaShare = parsePublishedSnapshot(snapshot);
    const viaPreview = buildPreview(draft).profile;
    expect(viaPreview).toEqual(viaShare);
  });

  it('substitutes a placeholder display name only in the preview', () => {
    const draft = createEmptyDraft('');
    const preview = buildPreview(draft);
    expect(preview.profile?.displayName).toBe('Seu perfil');
    // The stored content keeps the real (empty) value.
    expect(toSnapshotContent(draft).profile.displayName).toBe('');
  });

  it('hides invisible sections and blocks from the preview, like the Share', () => {
    let draft = addSection(createEmptyDraft('Alice'), 'content');
    const sectionId = draft.sections[0]!.id;
    draft = addBlock(draft, sectionId, 'text');
    draft = addBlock(draft, sectionId, 'divider');
    const [first, second] = draft.sections[0]!.blocks;
    draft = withBlock(draft, sectionId, first!.id, { visible: false });
    draft = withSection(draft, sectionId, { visible: false });

    const preview = buildPreview(draft);
    expect(preview.profile?.sections).toEqual([]);

    // A visible section still hides its invisible blocks.
    const visibleSection = withSection(draft, sectionId, { visible: true });
    const preview2 = buildPreview(visibleSection);
    expect(preview2.profile?.sections[0]!.blocks.map((block) => block.id)).toEqual([second!.id]);
  });

  it('surfaces validation issues instead of rendering when the draft is not publishable', () => {
    const draft = withProfile(createEmptyDraft('x'.repeat(120)), {});
    const preview = buildPreview(draft);
    expect(preview.profile).toBeNull();
    expect(preview.issues.length).toBeGreaterThan(0);
  });

  it('slugifies the display name for the preview snapshot', () => {
    expect(slugForPreview('Alice Andrade')).toBe('alice-andrade');
    expect(slugForPreview('  ')).toBe('preview');
  });

  it('never derives a slug shorter than the contract minimum', () => {
    // A short name must still produce a publishable address (contract: 3–48 chars).
    expect(slugForPreview('Jo')).toBe('jo0');
    expect(slugForPreview('A')).toBe('a00');
    expect(slugForPreview('Jo').length).toBeGreaterThanOrEqual(3);
  });

  it('drops unsafe theme colors instead of leaking them into the snapshot', () => {
    const draft = withTheme(createEmptyDraft('A'), { accent: 'javascript:alert(1)' });
    const content = toSnapshotContent(draft);
    expect(content.theme?.accent).toBeUndefined();
    expect(validatePublishableSnapshotContent(content).ok).toBe(true);
  });

  it('removing a block keeps the rest of the section intact', () => {
    let draft = addSection(createEmptyDraft('A'), 'content');
    const sectionId = draft.sections[0]!.id;
    draft = addBlock(draft, sectionId, 'text');
    draft = addBlock(draft, sectionId, 'divider');
    const [first] = draft.sections[0]!.blocks;
    draft = updateBlockProps(draft, sectionId, first!.id, { text: 'Olá' });
    draft = removeBlock(draft, sectionId, first!.id);

    const content = toSnapshotContent(draft);
    expect(content.sections[0]!.blocks.map((block) => block.type)).toEqual(['divider']);
  });
});
