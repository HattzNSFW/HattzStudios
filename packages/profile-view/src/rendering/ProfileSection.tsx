import type { ShareSectionView, ShareBlockView } from '../content';
import type { ShareMediaResolver } from '../media';
import type { MusicTrack } from './MusicPlayer';
import { BlockRenderer } from './BlockRenderer';
import { readString } from '../props';

const SECTION_LABELS: Record<string, string> = {
  links: 'Links',
  about: 'Sobre',
  content: 'Conteúdo',
  badges: 'Conquistas',
  music: 'Música',
  gallery: 'Galeria',
};

function toMusicTrack(block: ShareBlockView): MusicTrack | null {
  const title = readString(block.props, 'title');
  const audioAssetId = readString(block.props, 'assetId');
  if (!title || !audioAssetId) return null;
  return {
    id: block.id,
    title,
    artist: readString(block.props, 'artist'),
    audioAssetId,
    coverAssetId: readString(block.props, 'coverAssetId'),
  };
}

interface ProfileSectionProps {
  section: ShareSectionView;
  media: ShareMediaResolver;
}

export function ProfileSection({ section, media }: ProfileSectionProps) {
  const label = SECTION_LABELS[section.type];

  // Blocos de música visíveis na seção formam a playlist (quando há mais de um).
  const musicPlaylist = section.blocks
    .filter((block) => block.type === 'music')
    .map(toMusicTrack)
    .filter((track): track is MusicTrack => track !== null);
  const musicAnchorId = musicPlaylist.length > 1 ? (musicPlaylist[0]?.id ?? null) : null;

  return (
    <section
      className={`share-section share-section--${section.type}`}
      {...(label ? { 'aria-label': label } : {})}
    >
      {section.blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          media={media}
          musicPlaylist={musicPlaylist}
          musicAnchorId={musicAnchorId}
        />
      ))}
    </section>
  );
}
