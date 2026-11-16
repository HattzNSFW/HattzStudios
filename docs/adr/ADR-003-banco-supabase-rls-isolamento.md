# ADR-003 — Modelagem PostgreSQL/Supabase, RLS e isolamento de domínios

- **Status:** Aceito (Fase 2A, modelagem local)
- **Data:** 2026-11-16

## Contexto

A Fase 2A exige modelar banco PostgreSQL para um projeto Supabase **novo**, com RLS de menor privilégio e isolamento entre dados locais, publicados e administrativos, além de domínios de perfis/publicações/mídia/cargos/permissões/benefícios/colecionáveis/administração/auditoria.

## Decisão

- Criar migrations SQL versionadas (`0001`–`0008`) cobrindo fundação, domínios funcionais, auditoria/admin isolados, configurações/sync/monitoramento e RLS.
- Usar **identidade técnica permanente** (`profiles.technical_id`) independente de `display_name` e slugs públicos versionáveis (`profile_slugs`).
- Separar conteúdo público em `profile_public_snapshots` vinculado a `profile_publications` (`state='published'`), impedindo exposição de rascunhos/dados privados ao Share.
- Habilitar RLS em todas as tabelas modeladas; conceder SELECT público mínimo apenas para snapshots publicados públicos e metadados/mídia pública necessária; negar acesso público a domínios restritos e a `hattz_admin`/`hattz_audit`.
- Modelar estruturas administrativas em schemas isolados sem implementar autenticação própria nesta fase.
- Não criar/executar conexões ou migrations remotas.

## Consequências

- Base pronta para revisão e aplicação futura em Supabase novo autorizado.
- Policies administrativas/serviço adicionais exigirão decisão arquitetural e revisão de segurança antes de implementação/concessão.
- Validação de RLS em runtime contra banco real fica pendente de ambiente autorizado (Fase 2B+), mitigada nesta fase por documentação, revisão de SQL e testes de estrutura/autorização lógica.
