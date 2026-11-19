import type { CSSProperties } from 'react';
import type { ShareProfileView as ShareProfileViewModel } from '../content';
import type { ShareMediaResolver } from '../media';
import { themeToCssVars } from '../theme';
import { ProfileHeader } from './ProfileHeader';
import { ProfileSection } from './ProfileSection';

interface ProfileViewProps {
  profile: ShareProfileViewModel;
  media: ShareMediaResolver;
  /** Elemento/atributo id do container de conteúdo (padrão `share-content`). */
  contentId?: string;
}

/**
 * Renderização do perfil (mesmo mecanismo no Share publicado e no preview do Studio).
 * Recebe apenas o modelo público já interpretado — nunca dados internos/draft/admin.
 */
export function ProfileView({ profile, media, contentId = 'share-content' }: ProfileViewProps) {
  // Custom properties do tema (valores já validados/sanitizados em `parseShareTheme`).
  const themeStyle = themeToCssVars(profile.theme) as unknown as CSSProperties;

  return (
    <article
      className={`share-profile share-bg--${profile.theme.backgroundStyle}${
        profile.effects.grain ? ' share-effects--grain' : ''
      }${profile.effects.glow ? ' share-effects--glow' : ''}`}
      style={themeStyle}
    >
      <a className="share-skip-link" href={`#${contentId}`}>
        Ir para o conteúdo
      </a>

      <ProfileHeader profile={profile} media={media} />

      <div id={contentId} className="share-sections">
        {profile.sections.map((section) => (
          <ProfileSection key={section.id} section={section} media={media} />
        ))}
      </div>

      <footer className="share-footer">
        <span className="share-footer__brand">Hättz</span>
        <span className="share-footer__slug">/{profile.slug}</span>
      </footer>
    </article>
  );
}
