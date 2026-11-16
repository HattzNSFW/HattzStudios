import { SYSTEM_VERSION } from '@hattz/shared-utils';
import { designSystemMeta } from '@hattz/design-system';

export function App() {
  return (
    <main className="app-shell">
      <section className="panel hattz-liquid-glass" aria-labelledby="studio-title">
        <p className="eyebrow">Hättz 2.0</p>
        <h1 id="studio-title">Studio</h1>
        <p className="subtitle">
          Editor local-first de personalização de perfis (fundação inicial).
        </p>
        <ul className="status-list">
          <li>
            <strong>Status:</strong> estrutura base configurada (Fases 0–1)
          </li>
          <li>
            <strong>Versão do sistema:</strong> {SYSTEM_VERSION}
          </li>
          <li>
            <strong>Design System:</strong> {designSystemMeta.theme}
          </li>
        </ul>
      </section>
    </main>
  );
}
