# Estratégia de testes de RLS em PostgreSQL real (sem conexão externa nesta etapa)

> **Status:** preparada (Fase 2A hardening/auditoria). **RLS não validada em runtime** nesta etapa.

## Categorias de teste (distinguir explicitamente)

1. **Testes automatizados TypeScript (executados localmente):** validação de conteúdo publicável (`@hattz/validation`), contratos/boundaries, persistência IndexedDB e cenários de falha. **Não** comprovam RLS/privileges/views em PostgreSQL.
2. **Testes estruturais das migrations (executados localmente):** inspeção estática de SQL (RLS/force, grants/revokes, policies, views, funções/triggers, projeções, `search_path`). **Não** comprovam comportamento em runtime.
3. **Testes de comportamento SQL (preparados, não executados):** execução de SQL/consultas contra PostgreSQL real autorizado para observar permissões, linhas retornadas e erros.
4. **Testes reais de RLS em PostgreSQL (preparados, não executados):** asserções como papéis `anon`/`authenticated` (e cenários de serviço quando aplicável) em banco real/efêmero autorizado. **Somente estes** validam RLS/privileges em runtime.

## Objetivo (runtime, quando autorizado)

Validar em PostgreSQL (Supabase/Postgres novo de dev/staging autorizado) que:

- `anon` e `authenticated` **não** leem/escrevem tabelas base sensíveis ou colunas internas sem grant (`public.*` restritas, `hattz_admin.*`, `hattz_audit.*`).
- Views `v_share_published_profiles` e `v_share_public_media` (`security_invoker=true`) funcionam para `anon/authenticated` com base nos **grants mínimos de coluna + policies restritivas** e retornam apenas linhas publicadas/públicas/ativas e colunas projetadas.
- Acesso direto às tabelas base por `anon/authenticated` (se tentado) não expõe colunas sem grant nem linhas não permitidas por RLS/policy.
- Perfis/snapshots não publicados/privados e mídia privada/inativa não aparecem.
- Trigger/função rejeita snapshots inválidos (campos proibidos/aninhados, chaves desconhecidas, estrutura/tipos/tamanhos inválidos).

## Pré-requisitos

- Instância PostgreSQL **nova** e autorizada (nunca bancos antigos/prod). Sem credenciais no repositório.
- Aplicar migrations `0001`→`0009` em banco limpo e registrar evidências.

## Casos mínimos (runtime)

- `SELECT` em tabelas restritas/admin/audit como anon/authenticated → negado.
- `SELECT` em `v_share_published_profiles`/`v_share_public_media` como anon/authenticated → sucesso apenas para dados publicados/públicos/ativos e colunas esperadas.
- Tentativas de `SELECT` de colunas internas (ex.: `storage_path`, `checksum_sha256`, `metadata`, `failure_reason`, `technical_id` onde sem grant) como anon/authenticated → negado/erro.
- Perfil não publicado/privado e mídia privada/inativa → não retornados.
- `INSERT/UPDATE` em `profile_public_snapshots` com conteúdo proibido/aninhado/inválido → falha por trigger.
- Ausência de acesso administrativo indireto para papéis públicos.

## Limitação atual

- **Não executado:** comportamento SQL real, RLS runtime, semântica/execução de views `security_invoker` com policies+grants no ambiente alvo (incl. Supabase), e casos de borda de papéis (`service_role`, owner). Apenas categorias 1 e 2 foram executadas nesta etapa.
