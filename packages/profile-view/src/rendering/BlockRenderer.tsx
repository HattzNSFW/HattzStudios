import type { ShareBlockView } from '../content';
import type { ShareMediaResolver } from '../media';
import { BadgeChip } from './BadgeChip';
import { MediaImage } from './MediaImage';
import { MusicPlayer, type MusicTrack } from './MusicPlayer';
import { readRecordArray, readSafeUrl, readString } from '../props';

interface BlockRendererProps {
  block: ShareBlockView;
  media: ShareMediaResolver;
  /**
   * Faixas de música visíveis na seção (playlist). Quando há mais de uma, o primeiro bloco de
   * música renderiza um único player com avançar/retroceder e os demais não renderizam um segundo
   * player. Sem playlist, cada bloco continua sendo um player de faixa única.
   */
  musicPlaylist?: MusicTrack[];
  musicAnchorId?: string | null;
}

const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer nofollow',
} as const;

function HeadingBlock({ block }: { block: ShareBlockView }) {
  const text = readString(block.props, 'text');
  if (!text) return null;
  const level = block.props.level === 3 ? 3 : 2;
  const Tag = level === 3 ? 'h3' : 'h2';
  return <Tag className="share-heading">{text}</Tag>;
}

function TextBlock({ block }: { block: ShareBlockView }) {
  const text = readString(block.props, 'text');
  if (!text) return null;
  return <p className="share-text">{text}</p>;
}

function LinkItem({
  label,
  url,
  description,
}: {
  label: string;
  url: string;
  description: string | null;
}) {
  return (
    <a className="share-link" href={url} {...EXTERNAL_LINK_PROPS}>
      <span className="share-link__label">{label}</span>
      {description ? <span className="share-link__desc">{description}</span> : null}
    </a>
  );
}

function LinkBlock({ block }: { block: ShareBlockView }) {
  const label = readString(block.props, 'label');
  const url = readSafeUrl(block.props.url);
  if (!label || !url) return null;
  return (
    <div className="share-links">
      <LinkItem label={label} url={url} description={readString(block.props, 'description')} />
    </div>
  );
}

function LinksBlock({ block }: { block: ShareBlockView }) {
  const items = readRecordArray(block.props, 'items')
    .map((item) => {
      const label = typeof item.label === 'string' ? item.label : null;
      const url = readSafeUrl(item.url);
      if (!label || !url) return null;
      return {
        key: url,
        label,
        url,
        description: typeof item.description === 'string' ? item.description : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) return null;

  return (
    <ul className="share-links">
      {items.map((item) => (
        <li key={item.key}>
          <LinkItem label={item.label} url={item.url} description={item.description} />
        </li>
      ))}
    </ul>
  );
}

function ImageBlock({ block, media }: BlockRendererProps) {
  const assetId = readString(block.props, 'assetId');
  const url = assetId ? media.resolveMediaUrl(assetId) : null;
  if (!url) return null;
  const alt = readString(block.props, 'alt') ?? '';
  const caption = readString(block.props, 'caption');
  return (
    <figure className="share-figure">
      <MediaImage
        assetId={assetId}
        media={media}
        alt={alt}
        className="share-figure__image"
        loading="lazy"
        decoding="async"
      />
      {caption ? <figcaption className="share-figure__caption">{caption}</figcaption> : null}
    </figure>
  );
}

function BadgesBlock({ block }: { block: ShareBlockView }) {
  const title = readString(block.props, 'title');
  const items = readRecordArray(block.props, 'items')
    .map((item) => {
      const name = typeof item.name === 'string' && item.name.trim() !== '' ? item.name : null;
      if (!name) return null;
      return {
        key: name,
        name,
        rarity: typeof item.rarity === 'string' ? item.rarity : null,
        description: typeof item.description === 'string' ? item.description : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) return null;

  return (
    <div className="share-collection">
      {title ? <h3 className="share-collection__title">{title}</h3> : null}
      <ul className="share-badges">
        {items.map((item) => (
          <BadgeChip
            key={item.key}
            name={item.name}
            rarity={item.rarity}
            description={item.description}
          />
        ))}
      </ul>
    </div>
  );
}

function MusicBlock({ block, media }: BlockRendererProps) {
  const title = readString(block.props, 'title');
  const audioAssetId = readString(block.props, 'assetId');
  if (!title || !audioAssetId) return null;
  return (
    <MusicPlayer
      media={media}
      tracks={[
        {
          id: block.id,
          title,
          artist: readString(block.props, 'artist'),
          audioAssetId,
          coverAssetId: readString(block.props, 'coverAssetId'),
        },
      ]}
    />
  );
}

/** Renderiza um bloco público conhecido. Tipos desconhecidos são ignorados (sem HTML arbitrário). */
export function BlockRenderer({ block, media, musicPlaylist, musicAnchorId }: BlockRendererProps) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} />;
    case 'text':
      return <TextBlock block={block} />;
    case 'link':
      return <LinkBlock block={block} />;
    case 'links':
      return <LinksBlock block={block} />;
    case 'image':
      return <ImageBlock block={block} media={media} />;
    case 'badges':
      return <BadgesBlock block={block} />;
    case 'music':
      if (musicPlaylist && musicPlaylist.length > 1) {
        // Uma playlist na seção: só o bloco âncora desenha o player (os outros fazem parte dela).
        if (block.id !== musicAnchorId) return null;
        return <MusicPlayer tracks={musicPlaylist} media={media} />;
      }
      return <MusicBlock block={block} media={media} />;
    case 'divider':
      return <hr className="share-divider" />;
    default:
      return null;
  }
}
