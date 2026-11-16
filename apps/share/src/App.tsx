import { SYSTEM_VERSION } from '@hattz/shared-utils';
import { designSystemMeta } from '@hattz/design-system';

export function App() {
  return (
    <main className="app-shell">
      <section className="panel hattz-liquid-glass" aria-labelledby="share-title">
        <p className="eyebrow">Hättz 2.0</p>
        <h1 id="share-title">Share</h1>
        <p className="subtitle">Aplicação pública de visualização de perfis (fundação inicial).</p>
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
