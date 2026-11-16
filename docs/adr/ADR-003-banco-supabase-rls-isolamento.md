# ADR-003 — Modelagem PostgreSQL/Supabase, RLS e isolamento de domínios

- **Status:** Aceito (Fase 2A, modelagem local) — atualizado no hardening pré-2B
- **Data:** 2026-11-16

## Contexto

A Fase 2A exige modelar banco PostgreSQL para um projeto Supabase **novo**, com RLS de menor privilégio e isolamento entre dados locais, publicados e administrativos. O hardening complementar exige impedir exposição de colunas internas/admin por tabelas públicas, validar snapshots publicáveis e restringir privilégios/grants.

## Decisão

- Criar migrations SQL versionadas (`0001`–`0009`) cobrindo fundação, domínios funcionais, auditoria/admin isolados, configurações/sync/monitoramento, RLS/revogações e hardening de leitura pública.
- Usar **identidade técnica permanente** (`profiles.technical_id`) independente de `display_name` e slugs públicos versionáveis (`profile_slugs`).
- Separar conteúdo público em `profile_public_snapshots` vinculado a `profile_publications` (`state='published'`), com **validação recursiva** de conteúdo publicável (aplicação + função/trigger no banco) bloqueando campos privados/admin/credenciais/rascunhos/config interna.
- **Não expor tabelas base publicamente:** `0008` habilita/força RLS e revoga privilégios diretos de `anon/authenticated` em tabelas/schemas sensíveis; nenhuma policy pública direta em tabelas base.
- **Leitura pública apenas por views seguras com campos explicitamente permitidos** (`0009`): `v_share_published_profiles` e `v_share_public_media`, filtradas para conteúdo efetivamente publicado/visível e mídia pública ativa, com grants mínimos de SELECT.
- Modelar estruturas administrativas em schemas isolados sem implementar autenticação própria; documentar fronteira futura do Control (Owner público ≠ acesso administrativo).
- Harden de funções (`set_updated_at`, validação/enforcement) com `search_path` fixo e `REVOKE/GRANT EXECUTE` mínimos.
- Não criar/executar conexões ou migrations remotas.

## Consequências

- Base preparada para revisão e aplicação futura em Supabase novo autorizado, com redução de superfície de exposição pública.
- Policies/roles/funções de serviço e contexto administrativo isolado exigirão decisão arquitetural e revisão de segurança antes de implementação/concessão.
- **Validação de RLS em runtime contra banco real não executada nesta etapa** (estratégia preparada em `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`); mitigação atual por revisão estática de SQL, contratos/validação e testes automatizados locais.
- Execução real das migrations em ambiente autorizado pode exigir ajustes finos (ex.: ownership/execução de views definer vs invoker no contexto Supabase), a validar em runtime autorizado.
