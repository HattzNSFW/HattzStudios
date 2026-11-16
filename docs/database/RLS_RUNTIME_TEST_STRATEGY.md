# Estratégia de testes de RLS em PostgreSQL real (sem conexão externa nesta etapa)

> **Status:** preparada (Fase 2A hardening). **RLS não validada em runtime** nesta etapa, pois não há conexão/execução contra banco real autorizado.

## Objetivo

Validar em PostgreSQL real (Supabase/Postgres de desenvolvimento ou staging **autorizado**) que:

- `anon` e `authenticated` **não** leem/escrevem tabelas base sensíveis (`public.*` restritas, `hattz_admin.*`, `hattz_audit.*`).
- Leitura pública ocorre **somente** por views seguras explícitas (`v_share_published_profiles`, `v_share_public_media`).
- `v_share_published_profiles` retorna apenas linhas efetivamente publicadas (`visibility='public'` e `publication.state='published'`) e apenas colunas permitidas.
- `v_share_public_media` retorna apenas mídia pública ativa sem paths/buckets/checksums/metadata interna.
- Trigger/função de validação rejeita snapshots com campos proibidos/estrutura inválida no insert/update.

## Pré-requisitos (somente quando autorizado)

- Projeto/instância PostgreSQL **nova** de desenvolvimento/staging (nunca bancos antigos/prod).
- Credenciais geridas fora do repositório; execução controlada e auditável.
- Aplicar migrations em ordem `0001`→`0009` em banco limpo.

## Abordagem recomendada

1. **Banco efêmero local por container (preferencial para CI futuro autorizado):**
   - Subir Postgres (imagem oficial compatível) em runner/ambiente autorizado.
   - Aplicar migrations com ferramenta padrão (`psql`/migrator) e capturar logs.
2. **Supabase local CLI/dev (quando autorizado):**
   - Usar stack local de desenvolvimento (não cloud) para testes de integração de RLS/views.
3. **Papéis e sessões:**
   - Executar asserções como `anon` e `authenticated` (e, se aplicável no contexto Supabase, claims/JWT de teste) para confirmar negação em tabelas base e sucesso apenas nas views.
   - Executar asserções como papel de serviço/admin controlado **apenas** nos cenários explicitamente previstos (não nesta etapa).

## Casos de teste mínimos (runtime)

- `SELECT` em `public.profile_public_snapshots`, `public.profiles`, `public.sync_operations`, `hattz_admin.admin_accounts`, `hattz_audit.audit_logs` como anon/authenticated → negado (sem privilégios/policy).
- `SELECT` em `v_share_published_profiles` → apenas perfis publicados públicos; colunas esperadas presentes; colunas internas ausentes por definição da view.
- `SELECT` em `v_share_public_media` → apenas ativos públicos; sem `storage_path`, `storage_bucket`, `checksum_sha256`, `metadata`, `profile_id`.
- `INSERT/UPDATE` em `profile_public_snapshots` com chave proibida (`password`, `token`, `admin`, `draft`, `storage_path`, etc.) → falha por trigger/função.
- `INSERT/UPDATE` com estrutura inválida/chave desconhecida → falha.
- Tentativa de acesso a snapshot `unpublished` ou publicação não `published` via view → sem linhas.

## Integração futura (autorizada)

- Adicionar suíte de integração (ex.: Vitest + conexão configurada por env, ou testes SQL) executada apenas em job autorizado com banco efêmero.
- Nunca hardcode credenciais; não apontar para bancos existentes.
- Registrar resultados e evidências no `DEVELOPMENT_STATUS.md` quando executado.

## Limitação atual

- Nesta etapa foram realizadas **revisões estáticas de SQL**, **testes automatizados de estrutura/contratos/validação local** e documentação. Isso **não** substitui validação de runtime de RLS no PostgreSQL real.
