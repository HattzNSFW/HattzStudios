# Hättz 2.0 — Development Status

## Classificação formal

- **Fase 2A:** **CONCLUÍDA — PREPARAÇÃO TÉCNICA LOCAL.**
- **Data:** 2026-11-16
- **Branch:** `main`
- **Commits preservados:** `196c2a3`, `202b478`, `5aa24a0` (histórico integral preservado; sem rebase/reset/amend/squash).

**Significado desta classificação:** modelagem, implementação local, hardening, contratos, persistência inicial, documentação e testes automatizados previstos para a Fase 2A foram concluídos conforme as evidências disponíveis no repositório.

**Esta classificação NÃO significa:**
- PostgreSQL validado em runtime.
- RLS validada em execução real.
- Segurança de produção certificada.
- Banco Supabase criado ou conectado.
- Sistema pronto para publicação.

**Próxima etapa:** aguardar avaliação/aprovação do Owner para iniciar **Fase 2B** (não iniciada).

## Restrições respeitadas

- Banco modelado para **Supabase (PostgreSQL) inteiramente novo**; migrations `0001`–`0009`. **Sem criação/conexão de projeto Supabase, sem credenciais, sem execução remota de migrations, sem acesso/modificação de bancos antigos, sem deploy/publicação/push, sem implementação de autenticação administrativa, sem Fase 2B, sem operações destrutivas.**
- Sem instalação/download/criação de infraestrutura para contornar limitações de ambiente.
- Share limitado a interfaces/conteúdo publicado-público-ativo conforme modelo; sem enfraquecimento de RLS, grants ou validações.

## Concluído (evidências locais)

- Modelagem inicial do banco e migrations `0001`–`0009` (versionadas, sem execução remota).
- Separação entre dados locais (Studio/IndexedDB), públicos (Share), administrativos e de auditoria (domínios isolados).
- Políticas RLS, grants mínimos e restrições de acesso implementados (`ENABLE/FORCE RLS`, revogações, policies restritivas por linha/coluna conforme modelo).
- Views públicas com projeções explícitas (`v_share_published_profiles`, `v_share_public_media`, `security_invoker=true`, `security_barrier=true`) como interface canônica do Share.
- Validação de snapshots publicáveis no TypeScript (`@hattz/validation`) e no PostgreSQL (função/trigger), com alinhamento estrutural TS↔SQL.
- Limites explícitos e extensibilidade controlada/tipada para snapshots (`props/theme/effects` controlados, sem estruturas arbitrárias ilimitadas).
- Integridade referencial de `profile_public_snapshots.og_image_asset_id` com FK para `media_assets(id)` e `ON DELETE SET NULL` (preservação de histórico, sem cascata destrutiva).
- Persistência local inicial do Studio (IndexedDB/Dexie, migrações/versionamento, fila/metadados).
- Contratos e adapters/boundaries.
- Testes automatizados estruturais e de validação (TypeScript e inspeção estrutural de migrations/SQL).
- Hardening e revisões locais documentadas (commits `196c2a3`, `202b478`, `5aa24a0`).

## Não validado em execução real

- Execução das migrations em PostgreSQL real.
- RLS em runtime.
- Grants e privilégios reais para `anon`, `authenticated` e `service_role`.
- Isolamento real entre usuários.
- Segurança/semântica das views com `security_invoker` em execução real (incl. interação com policies+subqueries/grants no ambiente alvo).
- Policies, triggers, funções e FKs em execução real.
- Testes negativos de autorização em PostgreSQL.

**Limitação de ambiente auditado:** não havia instância PostgreSQL local isolada nem ferramentas disponíveis (`psql`, `postgres`, `docker`, `pg_config` ausentes). Nenhuma instalação, download ou criação de infraestrutura foi realizada para contornar essa limitação. Migrations não executadas remotamente. **Nenhum resultado simulado.**

## Diferenciação dos testes

1. **Testes TypeScript (executados):** validação de conteúdo/limites/extensibilidade, contratos/boundaries, persistência e falhas IndexedDB, utilitários/autorização em nível de aplicação conforme suíte atual. **Não comprovam** comportamento SQL/RLS em PostgreSQL real.
2. **Testes estruturais das migrations (executados):** inspeção estática de SQL/migrations (RLS/force, grants/revokes/policies, views, funções/triggers, projeções, limites, integridade/FK, `search_path`, alinhamento TS↔SQL). **Não comprovam** comportamento em runtime.
3. **Testes de comportamento SQL (preparados, não executados):** execução de SQL/consultas em PostgreSQL real autorizado/descartável. **Pendentes.**
4. **Testes reais de RLS em PostgreSQL (preparados, não executados):** asserções sob papéis `anon`/`authenticated`/`service_role`/owner em banco real/efêmero autorizado. **Pendentes; somente estes validam RLS/privileges em runtime.**

As categorias 1 e 2 **não** são apresentadas como comprovação das categorias 3 e 4.

## Verificações executadas (encerramento documental)

Comandos executados via `cmd /c npm ...` no ambiente auditado:

- `npm run format:write` — **PASS** (arquivos verificados; sem alterações necessárias)
- `npm run lint` — **PASS**
- `npm run typecheck` — **PASS** (workspaces + `infrastructure/adapters`)
- `npm run test` — **PASS** — Vitest v4.1.12, **7 arquivos de teste, 28 testes aprovados** (contagem efetivamente apresentada pelo Vitest nesta execução)
- `npm run build` — **PASS** — Vite v7.3.8 (`@hattz/control`, `@hattz/share`, `@hattz/studio`)
- `npm audit` — **PASS** — **found 0 vulnerabilities**

## Riscos e pendências restantes

- **Pendência crítica:** validação runtime de RLS/privileges/views/policies/triggers/FKs em PostgreSQL/Supabase real (incl. `anon/authenticated/service_role/owner`, `security_invoker` com policies+subqueries, `FORCE RLS`, casos negativos de autorização e integridade em execução).
- Exposição direta residual limitada a colunas/linhas permitidas quando necessária ao modelo `security_invoker` (sem `SECURITY DEFINER`/bypass); colunas internas/sensíveis e domínios admin/auditoria sem grant/policy pública.
- Refs de mídia em `content` JSON sem FK relacional (validadas por formato/limites no contrato de snapshot).
- Migrations não executadas remotamente; sem roles/policies de serviço/contexto administrativo do Control/autenticação administrativa implementados.
- Observações de ambiente: Node local v26.13.0 (referência 24 LTS), avisos/depreciações de tooling conforme saída de instalação/execução quando aplicável.

## Referências

- `docs/database/SCHEMA.md`
- `infrastructure/supabase/policies/RLS_POLICIES.md`
- `docs/database/RLS_RUNTIME_TEST_STRATEGY.md`
- `docs/architecture/FOUNDATION.md`
- `docs/adr/ADR-003-banco-supabase-rls-isolamento.md`
- `docs/adr/ADR-004-persistencia-local-studio-indexeddb.md`

**Aguardando avaliação e autorização explícita do Owner. Nenhuma integração externa ou Fase 2B foi iniciada.**
