import { SYSTEM_VERSION } from '@hattz/shared-utils';
import { designSystemMeta } from '@hattz/design-system';

export function App() {
  return (
    <main className="app-shell">
      <section className="panel hattz-liquid-glass" aria-labelledby="control-title">
        <p className="eyebrow">Hättz 2.0</p>
        <h1 id="control-title">Control</h1>
        <p className="subtitle">
          Painel administrativo privado (fundação inicial). Acesso administrativo será isolado do
          cargo público Owner em fases futuras.
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
