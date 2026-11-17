# Fundação e preparação técnica — Hättz 2.0 (Fases 0–1 e 2A)

## Escopo implementado

- **Fases 0–1:** Monorepo com npm workspaces (`apps/*`, `packages/*`), aplicações base **Share**, **Studio**, **Control** (React + Vite + TypeScript strict), pacotes compartilhados (**core**, **contracts**, **design-system**, **permissions**, **validation**, **shared-utils**), Design System inicial (tokens Liquid Glass), tooling de qualidade (TypeScript strict, ESLint, Prettier, Vitest) e CI (GitHub Actions).
- **Fase 2A — CONCLUÍDA — PREPARAÇÃO TÉCNICA LOCAL:** modelagem PostgreSQL/Supabase novo (migrations `0001`–`0009`, sem execução remota), separação local/publicado/admin-audit, RLS/grants/policies/views públicas e validação de snapshot (TS↔SQL, limites/extensibilidade controlada) definidos localmente, integridade `og_image_asset_id` (`ON DELETE SET NULL`), persistência local inicial do Studio (IndexedDB/Dexie), contratos/adapters e testes automatizados estruturais/TS documentados.

## Fora de escopo / não validado

- Funcionalidades completas dos oito blocos, Fase 2B, autenticação administrativa do Control e fluxos de publicação/sync remotos.
- Criação/conexão de projetos externos, bancos/credenciais, execução remota de migrations, deploy/publicação/push.
- **Não validado em execução real:** migrations em PostgreSQL real, RLS/grants/isolamento/policies/triggers/funções/FKs/views `security_invoker` em runtime, e segurança de produção.

## Observações

- Node.js de referência: **24 LTS**. Ambiente local detectado pode diferir; compatibilidade deve ser validada por execução real dos comandos.
- Supabase permanece planejado para execução autorizada futura; nenhuma conexão externa realizada. RLS/SQL em runtime permanecem pendentes de ambiente PostgreSQL novo, isolado e descartável.
