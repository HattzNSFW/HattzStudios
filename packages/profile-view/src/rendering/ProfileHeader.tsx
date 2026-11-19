import type { ShareProfileView } from '../content';
import type { ShareMediaResolver } from '../media';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

function formatPublishedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

interface ProfileHeaderProps {
  profile: ShareProfileView;
  media: ShareMediaResolver;
}

export function ProfileHeader({ profile, media }: ProfileHeaderProps) {
  const bannerUrl = profile.bannerAssetId ? media.resolveMediaUrl(profile.bannerAssetId) : null;
  const avatarUrl = profile.avatarAssetId ? media.resolveMediaUrl(profile.avatarAssetId) : null;
  const publishedLabel = formatPublishedAt(profile.publishedAt);
  const frame = profile.theme.avatarFrame;

  return (
    <header className="share-header">
      <div className={`share-banner${bannerUrl ? '' : ' share-banner--empty'}`}>
        {bannerUrl ? (
          <img
            className="share-banner__image"
            src={bannerUrl}
            alt=""
            aria-hidden="true"
            decoding="async"
          />
        ) : null}
      </div>

      <div className="share-identity">
        <div className={`share-avatar${frame ? ` share-frame--${frame}` : ''}`}>
          {avatarUrl ? (
            <img
              className="share-avatar__image"
              src={avatarUrl}
              alt={`Avatar de ${profile.displayName}`}
              decoding="async"
            />
          ) : (
            <span className="share-avatar__initials" aria-hidden="true">
              {initialsOf(profile.displayName)}
            </span>
          )}
        </div>

        <div className="share-identity__text">
          <h1 className="share-name">{profile.displayName}</h1>
          {profile.bio ? <p className="share-bio">{profile.bio}</p> : null}
          <p className="share-meta">
            <span className="share-meta__version">Perfil v{profile.profileVersion}</span>
            {publishedLabel ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>Publicado em {publishedLabel}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </header>
  );
}
