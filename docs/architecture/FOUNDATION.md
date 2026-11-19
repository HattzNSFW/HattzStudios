# Fundação e preparação técnica — Hättz 2.0 (Fases 0–1 e 2A)

## Escopo implementado

- **Fases 0–1:** Monorepo com npm workspaces (`apps/*`, `packages/*`), aplicações base **Share**, **Studio**, **Control** (React + Vite + TypeScript strict), pacotes compartilhados (**core**, **contracts**, **design-system**, **permissions**, **validation**, **shared-utils**), Design System inicial (tokens Liquid Glass), tooling de qualidade (TypeScript strict, ESLint, Prettier, Vitest) e CI (GitHub Actions).
- **Fase 2A — CONCLUÍDA — PREPARAÇÃO TÉCNICA LOCAL:** modelagem PostgreSQL/Supabase novo (migrations `0001`–`0011`, **sem execução remota**), separação local/publicado/admin-audit, RLS/grants/policies/views públicas e validação de snapshot (TS↔SQL, limites/extensibilidade controlada), integridade `og_image_asset_id` (`ON DELETE SET NULL`), integridade de identidade do snapshot (`0011`), visibilidade pública sem recursão de RLS (`0010`), persistência local inicial do Studio (IndexedDB/Dexie), contratos/adapters e testes automatizados. **As migrations e o comportamento RLS/SQL foram validados em runtime numa instância PostgreSQL 17.12 local, nova e descartável** (ver `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`); a validação no **Supabase real** permanece pendente.

## Fora de escopo / não validado

- Funcionalidades completas dos oito blocos, Fase 2B, autenticação administrativa do Control e fluxos de publicação/sync remotos.
- Criação/conexão de projetos externos, bancos/credenciais, execução remota de migrations, deploy/publicação/push.
- **Validado em runtime apenas em PostgreSQL local:** migrations, RLS/grants/isolamento/policies/triggers/funções/FKs/views `security_invoker` foram exercitados em PostgreSQL 17.12 local e descartável — **não** num projeto Supabase real.
- **Não validado em execução real (ambiente alvo):** semântica específica do **Supabase** (Auth/JWT/PostgREST/Storage) e segurança de produção.

## Observações

- Node.js de referência: **24 LTS**. Ambiente local detectado pode diferir; compatibilidade deve ser validada por execução real dos comandos.
- Supabase permanece planejado para execução autorizada futura; nenhuma conexão externa realizada. A validação RLS/SQL em runtime foi feita em PostgreSQL local (descartável); a semântica do **Supabase real** permanece pendente de ambiente autorizado.
