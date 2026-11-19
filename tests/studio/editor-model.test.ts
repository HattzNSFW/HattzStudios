import { describe, expect, it } from 'vitest';
import {
  addBlock,
  addSection,
  createEmptyDraft,
  createSection,
  moveBlock,
  moveSection,
  removeBlock,
  removeSection,
  updateBlockProps,
  withBlock,
  withProfile,
  withSection,
  withSeo,
  withTheme,
} from '../../apps/studio/src/editor/model';
import {
  BLOCK_TYPES,
  blockDefaultProps,
  type StudioBlockType,
} from '../../apps/studio/src/editor/blocks';

const BLOCK_TYPE_LIST: StudioBlockType[] = [
  'heading',
  'text',
  'link',
  'links',
  'image',
  'badges',
  'music',
  'divider',
];

describe('Studio editor model (pure, immutable operations)', () => {
  it('creates an empty draft with a stable, serializable shape', () => {
    const draft = createEmptyDraft('Alice');
    expect(draft.schemaVersion).toBe(1);
    expect(draft.profile).toEqual({
      displayName: 'Alice',
      bio: '',
      avatarAssetId: null,
      bannerAssetId: null,
    });
    expect(draft.sections).toEqual([]);
    expect(draft.seo).toEqual({ title: '', description: '' });
  });

  it('exposes exactly the eight approved block types, each with default props', () => {
    expect(BLOCK_TYPES.map((entry) => entry.type).sort()).toEqual([...BLOCK_TYPE_LIST].sort());
    for (const type of BLOCK_TYPE_LIST) {
      const props = blockDefaultProps(type);
      expect(props).toBeTypeOf('object');
      // Defaults must be cloned, not shared, so edits never mutate the catalog.
      expect(blockDefaultProps(type)).not.toBe(props);
    }
  });

  it('adds, reorders and removes sections without mutating the source draft', () => {
    const base = createEmptyDraft('Alice');
    const withOne = addSection(base, 'about');
    const withTwo = addSection(withOne, 'links');

    expect(base.sections).toHaveLength(0);
    expect(withTwo.sections.map((section) => section.type)).toEqual(['about', 'links']);

    const firstId = withTwo.sections[0]!.id;
    const moved = moveSection(withTwo, firstId, 1);
    expect(moved.sections.map((section) => section.type)).toEqual(['links', 'about']);

    const removed = removeSection(moved, firstId);
    expect(removed.sections.map((section) => section.type)).toEqual(['links']);
  });

  it('keeps the original section order when a move would fall off the edges', () => {
    const draft = addSection(addSection(createEmptyDraft('A'), 'about'), 'links');
    const firstId = draft.sections[0]!.id;
    const lastId = draft.sections[1]!.id;

    expect(moveSection(draft, firstId, -1).sections.map((s) => s.id)).toEqual(
      draft.sections.map((s) => s.id),
    );
    expect(moveSection(draft, lastId, 1).sections.map((s) => s.id)).toEqual(
      draft.sections.map((s) => s.id),
    );
  });

  it('adds every block type to a section and reorders/removes blocks', () => {
    const section = createSection('content');
    let draft = { ...createEmptyDraft('Alice'), sections: [section] };
    for (const type of BLOCK_TYPE_LIST) {
      draft = addBlock(draft, section.id, type);
    }
    const blocks = draft.sections[0]!.blocks;
    expect(blocks.map((block) => block.type)).toEqual(BLOCK_TYPE_LIST);

    const secondId = blocks[1]!.id;
    const moved = moveBlock(draft, section.id, secondId, -1);
    expect(moved.sections[0]!.blocks[0]!.id).toBe(secondId);

    const removed = removeBlock(moved, section.id, secondId);
    expect(removed.sections[0]!.blocks.some((block) => block.id === secondId)).toBe(false);
  });

  it('updates block visibility and merges props without dropping existing keys', () => {
    const section = createSection('content');
    const draft = addBlock({ ...createEmptyDraft('A'), sections: [section] }, section.id, 'link');
    const blockId = draft.sections[0]!.blocks[0]!.id;

    const hidden = withBlock(draft, section.id, blockId, { visible: false });
    expect(hidden.sections[0]!.blocks[0]!.visible).toBe(false);

    const patched = updateBlockProps(draft, section.id, blockId, { label: 'Site' });
    const props = patched.sections[0]!.blocks[0]!.props;
    expect(props.label).toBe('Site');
    expect(props.url).toBe('https://');
    // Original untouched.
    expect(draft.sections[0]!.blocks[0]!.props.label).toBe('Meu link');
  });

  it('updates section visibility and profile/theme/seo fields immutably', () => {
    const section = createSection('about');
    const draft = { ...createEmptyDraft('A'), sections: [section] };

    const hidden = withSection(draft, section.id, { visible: false });
    expect(hidden.sections[0]!.visible).toBe(false);
    expect(draft.sections[0]!.visible).toBe(true);

    const profile = withProfile(draft, { bio: 'Olá' });
    expect(profile.profile.bio).toBe('Olá');
    expect(draft.profile.bio).toBe('');

    const theme = withTheme(draft, { accent: '#a78bfa', glow: true });
    expect(theme.theme.accent).toBe('#a78bfa');
    expect(theme.theme.glow).toBe(true);
    expect(draft.theme.accent).toBeNull();

    const seo = withSeo(draft, { title: 'Título' });
    expect(seo.seo.title).toBe('Título');
    expect(draft.seo.title).toBe('');
  });

  it('generates unique ids for sections and blocks', () => {
    const draft = addSection(addSection(createEmptyDraft('A'), 'about'), 'links');
    expect(draft.sections[0]!.id).not.toBe(draft.sections[1]!.id);
    const blockDraft = addBlock(draft, draft.sections[0]!.id, 'text');
    const blocks = blockDraft.sections[0]!.blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
