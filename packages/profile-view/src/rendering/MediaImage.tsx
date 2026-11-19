import type { ShareMediaResolver } from '../media';

interface MediaImageProps {
  assetId: string | null;
  media: ShareMediaResolver;
  alt: string;
  className: string;
  loading: 'lazy' | 'eager';
  decoding: 'async' | 'sync';
}

/** Imagem pública resolvida via boundary de mídia; não renderiza nada se não resolver. */
export function MediaImage({ assetId, media, alt, className, loading, decoding }: MediaImageProps) {
  const url = assetId ? media.resolveMediaUrl(assetId) : null;
  if (!url) return null;
  return <img className={className} src={url} alt={alt} loading={loading} decoding={decoding} />;
}
