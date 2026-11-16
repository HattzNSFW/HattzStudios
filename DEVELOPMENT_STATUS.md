# Hättz 2.0 — Development Status

## Estado atual
- **Fases concluídas (nesta entrega):** 0, 1 e **2A — preparação local da infraestrutura e dos dados** (conforme aprovação)
- **Data:** 2026-11-16
- **Branch:** `main`
- **Próxima etapa:** aguardar avaliação/aprovação para iniciar **Fase 2B** (não iniciada)

## Decisões e restrições respeitadas (Fase 2A)
- Banco modelado para **projeto Supabase (PostgreSQL) inteiramente novo**; migrations SQL versionadas em `infrastructure/supabase/migrations/`.
- **Sem criação/conexão de projeto Supabase**, sem execução de migrations em bancos remotos, sem credenciais externas, sem deploy/publicação/serviços externos, sem acesso a bancos/projetos antigos.
- **Cargo público Owner não concede acesso automático ao Hättz Control** (domínios/admin isolados; sem implementação de autenticação administrativa própria).
- **Isolamento:** dados locais (Studio/IndexedDB) ≠ publicados (Share/snapshots) ≠ administrativos/auditoria (`hattz_admin`, `hattz_audit`).
- **Share nunca poderá consultar rascunhos ou dados privados** (RLS/policies restringem leitura pública a snapshots/publicações publicados e mídia pública ativa).
- **Studio funciona localmente sem conta ou conexão** (base Dexie/IndexedDB).
- **IDs técnicos permanentes e independentes** de nomes/slugs públicos (`profiles.technical_id`, chaves técnicas locais).
- Sem dados fictícios apresentados como dados reais; sem tabelas/permissões sem finalidade documentada; sem policies RLS permissivas para facilitar testes.

## Entregas da Fase 2A

### 1) Esquema do banco (PostgreSQL/Supabase novo)
Documentação: `docs/database/SCHEMA.md`, `infrastructure/supabase/policies/RLS_POLICIES.md`, ADRs `ADR-003`, `ADR-004`.

**Domínios modelados:**
- **Fundação:** extensões (`pgcrypto`), schemas `hattz_admin`/`hattz_audit`, enums (`publication_state`, `sync_state`, `profile_visibility`, `collectible_rarity`, `benefit_validity_type`, `grant_source_type`), trigger `set_updated_at()`.
- **Perfis e publicações:** `profiles` (identidade técnica permanente), `profile_slugs` (unicidade de slug atual), `profile_publications` (versionamento/estado), `profile_public_snapshots` (conteúdo público versionado/validado; separado de rascunhos locais).
- **Mídia e armazenamento:** `media_assets`, `media_variants`, `profile_storage_usage` (metadados, visibilidade pública controlada, agregados).
- **Cargos, permissões e benefícios:** `roles`, `permissions` (IDs permanentes), `role_permissions`, `user_role_assignments`, `user_permission_overrides`, `benefits_catalog`, `role_benefits`, `user_benefits`.
- **Colecionáveis e coleções:** `badges_catalog`, `frames_catalog`, `collections`, `collection_items`, `user_badges` (unicidade de posse ativa), `user_frames`, `user_collection_progress`.
- **Administração e auditoria (isolados):** `hattz_admin.admin_accounts`, `admin_credentials`, `admin_recovery_keys`, `admin_sessions`, `admin_access_logs`, `hattz_audit.audit_logs` (estruturas planejadas; sem auth própria implementada).
- **Configurações, sync e monitoramento:** `global_settings`, `settings_history`, `feature_flags`, `notifications`, `sync_operations`, `service_status_snapshots`.

### 2) Migrations SQL versionadas
Local: `infrastructure/supabase/migrations/`
- `0001_foundation_extensions.sql` — extensões, schemas isolados, enums, função de timestamp.
- `0002_profiles_and_publications.sql` — perfis, slugs, publicações, snapshots públicos.
- `0003_media_storage.sql` — assets, variantes e uso de armazenamento por perfil.
- `0004_roles_permissions_benefits.sql` — RBAC, overrides, benefícios e atribuições.
- `0005_collectibles_collections.sql` — catálogos, coleções, posse/progresso vinculados ao perfil.
- `0006_admin_audit_isolation.sql` — domínio administrativo/auditoria isolado (estruturas, sem implementação de auth).
- `0007_settings_sync_monitoring.sql` — configurações, flags, notificações, sync e status de serviços.
- `0008_rls_policies.sql` — habilitação de RLS e policies de menor privilégio.

### 3) Políticas RLS (menor privilégio)
- RLS habilitado em tabelas dos domínios modelados (incluindo `hattz_admin.*` e `hattz_audit.*`).
- **Leitura pública (anon/authenticated) permitida apenas quando aplicável a conteúdo publicado:** snapshots públicos publicados, perfis/slugs/publicações vinculados a publicação pública, mídia pública ativa e variantes correspondentes.
- **Sem policies públicas** para domínios restritos (cargos/permissões/atribuições/benefícios, colecionáveis/posses/progresso, configurações/histórico/flags/notificações/sync/monitoramento, uso de armazenamento) e **sem acesso público** a `hattz_admin`/`hattz_audit`.
- **Sem policies de escrita pública**. Acesso administrativo/serviço futuro exigirá contexto dedicado e revisão de segurança.

### 4) Estrutura do IndexedDB (Studio, Dexie)
Implementação: `apps/studio/src/persistence/{db.ts,migrations.ts,repository.ts,index.ts}` (Dexie **4.3.0**, fixado).
- **Banco:** `hattz_studio` (versão de schema **v1**), metadado `studioMeta.db_schema_version`.
- **Stores v1:**
  - `localProfiles` (`technicalId` PK, `publicSlugDraft`, `updatedAt`, `isDeleted`) — identidade técnica permanente, visibilidade local, `contentVersion`, `lastPublishedVersion`.
  - `draftSnapshots` (`id` PK, `profileTechnicalId`, `version`, `createdAt`, `source`) — snapshots versionados (manual/autosave/migration), conteúdo local.
  - `pendingSyncOps` (`operationId` PK, `profileTechnicalId`, `state`, `type`, `updatedAt`) — fila preparada para sync idempotente/conflitos futuros.
  - `studioMeta` (`key` PK, `updatedAt`) — metadados locais e controle de versão/migração.
- **Migrações locais:** versionamento Dexie com suporte a upgrades futuros (`.version(n+1).upgrade(...)`); `ensureStudioDbReady`/`getLocalMigrationStatus` para garantir/inspecionar versão.
- **Repositório base:** criação de perfil local, salvamento de snapshot com incremento de versão, enfileiramento de operações pendentes, listagem (sem conexão/conta).

### 5) Contratos e adapters de infraestrutura (preparação)
- `packages/contracts`: extensão com `domains.ts`, `adapters.ts`, contrato `hattz.persistence` (interfaces para leitura pública publicada, publicação, sync, storage metadata, auditoria; tipos de isolamento/identidade/snapshot/operação).
- `infrastructure/adapters`: `README.md`, `local-studio-adapter.ts`, `supabase-adapter-boundary.ts`, `tsconfig.json` (boundary Supabase planejado **lança erro** quando não configurado; sem conexão externa).

### 6) Documentação e ADRs (Fase 2A)
- `docs/database/SCHEMA.md`
- `infrastructure/supabase/policies/RLS_POLICIES.md`
- `docs/adr/ADR-003-banco-supabase-rls-isolamento.md`
- `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md`

## Dependências adicionadas (Fase 2A, fixadas) e auditoria
- `apps/studio` dependency: `dexie@4.3.0` (persistência local IndexedDB)
- root devDependency: `fake-indexeddb@6.2.5` (testes de persistência)
- `package-lock.json` atualizado.
- **Auditoria executada:** `cmd /c "npm audit"` → **`found 0 vulnerabilities`**.
- Avisos npm (não vulnerabilidades): depreciação `eslint@9.39.4`, install scripts não cobertos por allowScripts (`esbuild`, `fake-indexeddb`).

## Testes executados e resultados (Fase 2A)

| Verificação | Comando | Resultado |
|---|---|---|
| Formatação (write/fix) | `cmd /c "npm run format:write"` / `lint:fix` | **Executado** (arquivos normalizados; lint corrigido via regra `no-unused-vars` com ignore para `_`) |
| Auditoria | `cmd /c "npm audit"` | **APROVADO** — 0 vulnerabilidades |
| Typecheck (workspaces + adapters) | `cmd /c "npm run typecheck"` | **APROVADO** (`tsc` workspaces + `tsc -p infrastructure/adapters/tsconfig.json --noEmit`) |
| Lint | `cmd /c "npm run lint"` | **APROVADO** |
| Testes | `cmd /c "npm run test"` | **APROVADO** — Vitest v4.1.12: **5 arquivos**, **14 testes aprovados** |
| Build | `cmd /c "npm run build"` | **APROVADO** — Vite v7.3.8: builds de `@hattz/control`, `@hattz/share`, `@hattz/studio` |

**Suítes de teste (executadas):**
- `packages/shared-utils/src/shared-utils.test.ts` (4) — fundação/utilitários.
- `tests/integrity/schema.integrity.test.ts` (2) — integridade estrutural das migrations (domínios/tabelas/enums/IDs técnicos).
- `tests/isolation/data-isolation.test.ts` (3) — isolamento RLS (políticas públicas mínimas de publicado/mídia pública; ausência de policies públicas em admin/audit/restritos) e boundary de adapter não conectado.
- `tests/authorization/authorization.test.ts` (2) — fundamentos de autorização e separação Owner público ≠ acesso Control; modelagem admin isolada documentada.
- `tests/persistence/studio-idb.persistence.test.ts` (3) — persistência local Dexie/IndexedDB (versionamento/migração de schema, rascunhos versionados com ID técnico permanente, fila de operações pendentes).

## Problemas encontrados e correções (Fase 2A)
1. **Lint `no-unused-vars` em adapter boundary planejado** (`_config`, `_slug`): ajustada regra ESLint para ignorar identificadores prefixados com `_` (mantendo placeholders explícitos de não-conexão).
2. **Falhas iniciais nos novos testes:** import incorreto de `ensureStudioDbReady/getLocalMigrationStatus` (de `db` em vez de `migrations`) e resolução de caminhos via `import.meta.url` incompatível no contexto de execução; corrigidos para imports corretos e `process.cwd()` (raiz do repositório).
3. **Asserção de autorização desalinhada com localização do schema:** `create schema hattz_admin/hattz_audit` está em `0001`; teste ajustado para validar `0001` + `0006` (tabela admin e comentário de isolamento Owner público ≠ Control).

## Limitações e riscos encontrados
- **RLS não validada em runtime contra banco Supabase/Postgres real:** sem projeto/conexão remota autorizada nesta fase; validação atual cobre SQL/policies por revisão estrutural automatizada e documentação (risco residual de ajuste fino ao aplicar em ambiente real).
- **Migrations não executadas** em ambiente de banco (por restrição); possíveis ajustes de compatibilidade/performance podem surgir na aplicação futura em Supabase novo.
- **Sem políticas/roles de serviço e sem contexto de sessão administrativa isolada implementados:** acesso não público (admin/serviço/publicação/sync) permanece a ser desenhado com decisão arquitetural e revisão de segurança em fases autorizadas.
- **Persistência local é base (v1):** suporta rascunhos/snapshots/fila/meta; fluxos completos de conflito/sync/publicação, UI de editor, mídia binária local otimizada e recuperação avançada ficam para fases futuras.
- **Adapters são boundaries/contratos preparados:** `PlannedSupabasePublicProfileReadAdapter` falha explicitamente sem configuração (comportamento intencional); nenhuma integração externa ativa.
- **Ambiente local em Node v26.13.0** (referência 24 LTS); `eslint@9.39.4` com aviso de depreciação e avisos de install scripts (`esbuild`, `fake-indexeddb`) sem vulnerabilidade auditada.

## Histórico (Fases 0-1)
- Fundação concluída anteriormente: monorepo npm workspaces, apps Share/Studio/Control (shells), pacotes compartilhados, design system (preto/prata/roxo suave/Liquid Glass), tooling (TS strict/ESLint/Prettier/Vitest), CI, docs/ADRs, commits `0fc9df2`, `1316604`, `77936af`. (Detalhes preservados no histórico git e na entrega anterior.)

## Restrições ativas para próxima etapa
- **Não avançar para Fase 2B sem autorização.**
- Manter proibições de criação/conexão externa, execução remota de migrations, deploy, acesso a recursos antigos e implementação de auth própria sem decisão/revisão.
