import { useEffect, useState } from 'react';
import { SYSTEM_VERSION } from '@hattz/shared-utils';
import { ControlContent } from './ControlSections';
import { LocalControlDataSource, type ControlDataSource } from './controlSource';
import type { ControlSnapshot } from './controlModel';

type ControlState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: ControlSnapshot }
  | { status: 'error'; message: string };

const DEFAULT_SOURCE = new LocalControlDataSource();

const SECTIONS = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'badges', label: 'Badges' },
  { id: 'molduras', label: 'Molduras' },
  { id: 'cargos', label: 'Cargos' },
  { id: 'beneficios', label: 'Benefícios' },
  { id: 'colecoes', label: 'Coleções' },
] as const;

export function Control({ source }: { source?: ControlDataSource }) {
  const [state, setState] = useState<ControlState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // A fonte é resolvida uma única vez: um objeto inline recriado pelo chamador não deve
  // disparar recarregamentos sucessivos desta visão somente leitura.
  const [activeSource] = useState<ControlDataSource>(() => source ?? DEFAULT_SOURCE);

  useEffect(() => {
    let cancelled = false;
    void activeSource.loadSnapshot().then(
      (snapshot) => {
        if (!cancelled) setState({ status: 'ready', snapshot });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Não foi possível carregar os catálogos e contratos locais.',
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeSource, attempt]);

  return (
    <main className="control-app">
      <header className="control-header hattz-liquid-glass">
        <p className="control-eyebrow">Hättz 2.0 · Consulta</p>
        <h1>Control</h1>
        <p className="control-lede">
          Consulta de catálogos, cargos, benefícios e coleções. Somente leitura: nenhuma operação
          administrativa é oferecida nesta interface.
        </p>
        <p className="control-version">Versão do sistema: {SYSTEM_VERSION}</p>
      </header>

      <nav className="control-nav hattz-liquid-glass" aria-label="Seções do Control">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>

      {state.status === 'loading' ? (
        <div className="control-state hattz-liquid-glass" role="status" aria-live="polite">
          <span className="control-spinner" aria-hidden="true" />
          <p>Carregando catálogos e contratos…</p>
        </div>
      ) : state.status === 'error' ? (
        <div className="control-state control-state--error hattz-liquid-glass" role="alert">
          <p className="control-state__title">Não foi possível carregar o Control</p>
          <p className="control-state__text">{state.message}</p>
          <button
            type="button"
            className="control-retry"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Tentar carregar novamente
          </button>
        </div>
      ) : (
        <ControlContent snapshot={state.snapshot} />
      )}

      <footer className="control-footer">
        Hättz 2.0 — Control somente leitura · autoridade administrativa depende de backend e RLS
        futuros.
      </footer>
    </main>
  );
}
