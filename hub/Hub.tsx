import { useEffect, useState } from 'react';
import { listPublishedProfiles, type PublishedProfileSummary } from '@hattz/local-store';

/**
 * Landing do hub local: ponto único de navegação para os três aplicativos.
 *
 * A lista de perfis é lida da base local compartilhada (`@hattz/local-store`) e contém APENAS
 * publicações reais (`state === 'published'`) — nunca rascunhos e nunca dados de demonstração.
 */

type HubState =
  | { status: 'loading' }
  | { status: 'ready'; profiles: PublishedProfileSummary[] }
  | { status: 'error'; message: string };

function formatDate(value: number): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

export function Hub() {
  const [state, setState] = useState<HubState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profiles = await listPublishedProfiles();
        if (!cancelled) setState({ status: 'ready', profiles });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Não foi possível acessar o armazenamento local.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="hub">
      <header className="hub__header">
        <p className="hub__eyebrow">Hättz 2.0</p>
        <h1 className="hub__title">Ambiente local integrado</h1>
        <p className="hub__subtitle">
          Share, Studio e Control rodando na mesma origem. O que você publica no Studio aparece no
          Share; tudo é salvo no seu navegador (IndexedDB) e funciona sem internet.
        </p>
      </header>

      <nav className="hub__apps" aria-label="Aplicativos Hättz">
        <a className="hub-card hattz-liquid-glass" href="#publicados">
          <span className="hub-card__eyebrow">Público</span>
          <span className="hub-card__title">Share</span>
          <span className="hub-card__text">
            Visualização pública dos perfis publicados. Use os links da lista abaixo para abrir um
            perfil.
          </span>
        </a>

        <a className="hub-card hattz-liquid-glass" href="/studio/">
          <span className="hub-card__eyebrow">Edição</span>
          <span className="hub-card__title">Studio</span>
          <span className="hub-card__text">
            Crie e edite o perfil, salve o rascunho e publique versões. As mídias ficam no
            navegador.
          </span>
        </a>

        <a className="hub-card hattz-liquid-glass" href="/control/">
          <span className="hub-card__eyebrow">Administração</span>
          <span className="hub-card__title">Control</span>
          <span className="hub-card__text">
            Área administrativa privada. A fundação atual permanece para o Bloco 5.
          </span>
        </a>
      </nav>

      <section id="publicados" className="hub__published" aria-labelledby="hub-published-title">
        <h2 id="hub-published-title" className="hub__section-title">
          Perfis publicados
        </h2>

        {state.status === 'loading' ? (
          <div className="hub__status hattz-liquid-glass" role="status" aria-live="polite">
            <span className="hub__spinner" aria-hidden="true" />
            <p>Carregando publicações locais…</p>
          </div>
        ) : state.status === 'error' ? (
          <div className="hub__status hub__status--error hattz-liquid-glass" role="alert">
            <p className="hub__status-title">Não foi possível carregar as publicações</p>
            <p className="hub__status-text">{state.message}</p>
          </div>
        ) : state.profiles.length === 0 ? (
          <div className="hub__status hattz-liquid-glass">
            <p className="hub__status-title">Nenhum perfil publicado ainda</p>
            <p className="hub__status-text">
              Abra o <a href="/studio/">Studio</a>, crie um perfil e publique uma versão. Ele
              aparecerá aqui e no Share.
            </p>
          </div>
        ) : (
          <ul className="hub__list">
            {state.profiles.map((profile) => (
              <li
                key={`${profile.slug}:${profile.version}`}
                className="hub__item hattz-liquid-glass"
              >
                <div className="hub__item-info">
                  <span className="hub__item-name">
                    {profile.displayName.trim() || `/${profile.slug}`}
                  </span>
                  <span className="hub__item-meta">
                    /{profile.slug} · v{profile.version} · {formatDate(profile.publishedAt)}
                  </span>
                </div>
                <a className="hub__item-link" href={`/${profile.slug}`}>
                  Abrir no Share
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="hub__footer">
        <span>Hättz 2.0 — integração local</span>
      </footer>
    </main>
  );
}
