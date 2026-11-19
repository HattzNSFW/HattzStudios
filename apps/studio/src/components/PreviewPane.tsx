import { useMemo, useState } from 'react';
import { ProfileView } from '@hattz/profile-view';
import { buildPreview, type StudioDraft } from '../editor';
import { buildPublishedPreview } from '../publishing';
import type { LocalPublicationRecord } from '../persistence';
import type { StudioMediaState } from '../hooks/useStudioMedia';

type PreviewMode = 'draft' | 'published';

interface PreviewPaneProps {
  draft: StudioDraft;
  media: StudioMediaState;
  published: LocalPublicationRecord | null;
  differsFromPublished: boolean;
}

export function PreviewPane({ draft, media, published, differsFromPublished }: PreviewPaneProps) {
  const [mode, setMode] = useState<PreviewMode>('draft');

  // Prévia de edição: pipeline do rascunho (serializa → valida → interpreta → renderiza).
  const draftPreview = useMemo(() => buildPreview(draft), [draft]);
  // Prévia publicada: lê EXCLUSIVAMENTE o snapshot persistido, nunca o rascunho.
  const publishedPreview = useMemo(() => buildPublishedPreview(published), [published]);

  const active = mode === 'draft' ? draftPreview : publishedPreview;

  return (
    <section className="studio-preview" aria-label="Prévia do perfil">
      <div className="studio-preview__head">
        <h2 className="studio-panel__title">Prévia</h2>
        <div className="studio-preview__toggle" role="group" aria-label="Modo de prévia">
          <button
            type="button"
            className={`studio-preview__toggle-button${mode === 'draft' ? ' is-active' : ''}`}
            aria-pressed={mode === 'draft'}
            onClick={() => setMode('draft')}
          >
            Rascunho
          </button>
          <button
            type="button"
            className={`studio-preview__toggle-button${mode === 'published' ? ' is-active' : ''}`}
            aria-pressed={mode === 'published'}
            onClick={() => setMode('published')}
          >
            Publicado
          </button>
        </div>
      </div>

      <p className="studio-preview__mode" aria-live="polite">
        {mode === 'draft' ? (
          <>
            Mostrando o <strong>rascunho atual</strong> (não publicado)
            {published && differsFromPublished ? ' — difere da versão publicada.' : '.'}
          </>
        ) : published ? (
          <>
            Mostrando a <strong>versão publicada v{published.version}</strong> (snapshot imutável).
          </>
        ) : (
          <>Sem versão publicada.</>
        )}
      </p>

      <div className="studio-preview__frame">
        {mode === 'published' && !published ? (
          <div className="studio-preview__empty" aria-live="polite">
            <p className="studio-preview__empty-title">Nenhuma versão publicada</p>
            <p className="studio-preview__empty-text">
              Use a aba Publicação para publicar o rascunho atual. A prévia publicada lê apenas o
              snapshot publicado.
            </p>
          </div>
        ) : active.profile ? (
          <ProfileView
            profile={active.profile}
            media={media.resolver}
            contentId="studio-preview-content"
          />
        ) : (
          <div className="studio-preview__issues" role="alert">
            <p className="studio-preview__issues-title">Prévia indisponível</p>
            <ul>
              {active.issues.map((issue) => (
                <li key={`${issue.path}:${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
