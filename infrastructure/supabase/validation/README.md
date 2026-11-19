# Validação local de runtime (PostgreSQL descartável)

Harness reproduzível que aplica as migrations `0001`–`0013` a um banco **novo e descartável** e
exercita RLS, grants, views, triggers, integridade, validador, transições e concorrência sob papéis
reais (`anon`, `authenticated`, `service_role`) — **sem** `SECURITY DEFINER`, **sem** bypass de RLS e
**sem** qualquer conexão ao Supabase.

> **Escopo e limites.** Isto roda em **PostgreSQL 17.12 local**. Os papéis `anon`/`authenticated`/
> `service_role` são **stand-ins locais** e **não** são equivalentes ao Supabase Auth/JWT/PostgREST/
> Storage. O harness **prova** o modelo SQL/RLS/privileges em runtime local; **não** prova o
> comportamento do Supabase real. Nada aqui toca bancos existentes, deploy, push ou credenciais.

## Pré-requisitos (ambiente do Owner)

- PostgreSQL 17.x local, com um superusuário/owner (aqui `hattz_pg_admin`).
- `psql`/`pg_ctl` acessíveis (caminhos usados por padrão neste repositório, ajustáveis por parâmetro):
  - `C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\pgsql\pgsql\bin\psql.exe`
- `PGPASSFILE` apontando para um `pgpass.conf` com a senha do owner
  (`C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\run\pgpass.conf`).
- Windows PowerShell 5.1.

## Uso

```powershell
# Cria/reinicia o banco descartável _6, aplica 0001..0013 e roda TODOS os passos.
powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/run_validation.ps1 -Recreate
```

Parâmetros principais: `-Database` (padrão `hattz_phase2b_validation_6`), `-PgHost`, `-Port`, `-User`,
`-LogDir`, `-Runs` (padrão 3), `-Delay` (padrão `2.0`), `-Recreate`.

- **Exit code `0`** = todas as migrations aplicadas e **todos** os passos do harness passaram.
- **Exit code não-zero** = parada no primeiro resultado inesperado; evidências preservadas em `-LogDir`
  (`results.csv`, `*.out.log`/`*.err.log` por passo, e artefatos `90_conc_*`).
- Os bancos `hattz_phase2b_validation`, `_2`, `_3`, `_4` e `_5` **nunca** são tocados.

## Estrutura

```
validation/
  run_validation.ps1            # orquestrador: lifecycle do DB + migrations + todos os passos
  concurrency/90_concurrency.ps1# driver de concorrência (9 cenários x N execuções, ordem alternada)
  workers/81..85_*.sql          # workers transacionais que emitem traço (begin/end) por app
  parity/build_parity.mjs       # gerador da fixture única de paridade SQL<->TS (67 casos)
  sql/00_preflight.sql          # pré-condições do ambiente
  sql/20_verify_0011.sql        # §3 estrutura + NOT NULL + FK composta + rejeições (hard-fail)
  sql/21_0011_precheck_setup.sql / 22_..._after_failure.sql  # banco legado divergente
  sql/23_0011_idempotency.sql   # idempotência por DEFINIÇÃO (não por nome)
  sql/30_validator_parity.sql   # paridade SQL do validador (gerado)
  sql/40_verify_0010_triggers.sql
  sql/50_seed.sql               # seed mínimo (Alice publicada; Bob/Dave etc. nao publicos)
  sql/60_matrix_transitions.sql # T0..T12 (publicar/despublicar, snapshot, mover, delete)
  sql/70_access_matrix.sql      # §6 matriz efetiva como anon/authenticated (toda negacao e hard-fail)
  sql/71_grants_audit.sql       # §6 auditoria de grants (tabela/coluna/schema/funcao/view)
  sql/72_slug_integrity.sql     # §7 integridade de slug (regra 1 HARD; historico/reserved PENDING)
  sql/80_trusted_writer_privileges.sql  # §4 modelo de privilegios do escritor confiavel (temporario)
  sql/82_trusted_writer_grants.sql      # §4 grants APLICADOS pela 0012 (positivos/negativos)
  sql/95_final_state.sql        # invariante final do flag derivado + slug (0013) + grants (0012)
```

## Cobertura por item da revisão

| Item                               | Onde é provado                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 concorrência sem falso-positivo | `concurrency/90_concurrency.ps1`: checa **cada** exit code, stdout/stderr separados, overlap comprovado (traço + `pg_stat_activity`), estado final de `profile_publications.state` **e** `profile_public_snapshots.visibility` comparado aos alvos, flag comparado a alvo **e** ao predicado recomputado; 9 cenários (6 originais + INSERT/DELETE/mudança de `publication_id`), ordens alternadas.                                                                     |
| §3 `0011`                          | `sql/20_verify_0011.sql` (NOT NULL, FK composta `(publication_id, profile_id, version)` → `(id, profile_id, version)`, só `foreign_key_violation` conta como rejeição esperada), `sql/21/22` (pré-checagem em banco legado divergente), `sql/23` (idempotência por definição).                                                                                                                                                                                         |
| §4 triggers `0010`                 | `sql/80_trusted_writer_privileges.sql`: privilégios mínimos + controles negativos provam que BEFORE precisa de `SELECT` em snapshots (só quando `state → 'published'`) e AFTER precisa de `SELECT+UPDATE` em publicações; nenhum bypass silencioso. `sql/82_trusted_writer_grants.sql`: prova os grants **aplicados** pela `0012` (mínimo presente, sem over-grant, todos os caminhos de escrita, cada grant necessário, papéis públicos sem escrita, ACL preservada). |
| §5 validador `0009`                | `parity/build_parity.mjs` → `tests/fixtures/publishable-snapshot-parity.json` + `sql/30_validator_parity.sql`; mesmo conjunto de 67 casos exercita TS e SQL.                                                                                                                                                                                                                                                                                                           |
| §6 grants/RLS/views                | `sql/70_access_matrix.sql` (executa como `anon` e `authenticated` de verdade) + `sql/71_grants_audit.sql` (catálogo: tabela/coluna/schema/função/view, `security_invoker`/`security_barrier`, projeções).                                                                                                                                                                                                                                                              |
| §7 slug                            | `sql/72_slug_integrity.sql` (regra 1 — um slug atual por perfil — HARD, índice `0013`; unicidade global HARD; histórico/`reserved`/normalização como decisão do Owner).                                                                                                                                                                                                                                                                                                |
| §9 migrations/PG                   | `run_validation.ps1` aplica `0001`→`0013` em ordem com `ON_ERROR_STOP=1` (incl. reaplicação idempotente de `0012`/`0013`) e falha duro em qualquer erro.                                                                                                                                                                                                                                                                                                               |

## Reprodutibilidade da fixture de paridade

`tests/fixtures/publishable-snapshot-parity.json` e `sql/30_validator_parity.sql` são **gerados**:

```powershell
node infrastructure/supabase/validation/parity/build_parity.mjs
```

O gerador formata o JSON com o Prettier do projeto, então `npm run format` permanece verde após
regerar. Não edite os artefatos gerados à mão.

## Observações de implementação (armadilhas já tratadas)

- PowerShell 5.1 corrompe argumentos `-c` inline que contenham aspas duplas (JSON): por isso o SQL é
  escrito em arquivo temporário e passado por `-f`.
- `Start-Process -PassThru` com redirecionamento **não** expõe `ExitCode` de forma confiável; o driver
  de concorrência usa a API .NET `System.Diagnostics.Process`.
- Em PostgreSQL, `\b` é _backspace_, não fronteira de palavra — o validador usa `\y`.
