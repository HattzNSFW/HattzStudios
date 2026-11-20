# Validação local de runtime (PostgreSQL descartável)

Harness reproduzível que aplica as migrations `0001`–`0017` a um banco **novo e descartável** e
exercita RLS, grants, views, triggers, integridade, validador, transições, concorrência, identidade
externa oficial e contrato canônico de mídia sob papéis reais (`anon`, `authenticated`,
`service_role`) — **sem** `SECURITY DEFINER`, **sem** bypass de RLS e **sem** qualquer conexão ao
Supabase.

Um segundo orquestrador (`run_upgrade_validation.ps1`) prova o **upgrade real** em um banco
descartável **distinto**: aplica as migrations originais `0001`–`0014`, captura o comportamento do
validador e os dados existentes, aplica `0015`–`0017` e compara antes/depois. Não se simula upgrade
com um banco recém-criado.

> **Escopo e limites.** Isto roda em **PostgreSQL 17.12 local**. Os papéis `anon`/`authenticated`/
> `service_role` são **stand-ins locais** e **não** são equivalentes ao Supabase Auth/JWT/PostgREST/
> Storage. O harness **prova** o modelo SQL/RLS/privileges em runtime local; **não** prova o
> comportamento do Supabase real. Nenhum banco preexistente é modificado sem `-Recreate`, confirmação
> nominal e marcador de propriedade; bancos legados/de desenvolvimento nunca são alvo. Nada aqui faz
> deploy, push ou grava credenciais.

## Pré-requisitos (ambiente do Owner)

- PostgreSQL 17.x local, com um superusuário/owner (aqui `hattz_pg_admin`).
- `psql` acessível. Resolução, em ordem: parâmetro `-PsqlPath` → variável `HATTZ_PSQL_PATH` →
  `C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\pgsql\pgsql\bin\psql.exe`.
- `pgpass.conf` com a senha do owner. Resolução, em ordem: parâmetro `-PgPassFile` → variável
  `PGPASSFILE` → `C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\run\pgpass.conf`. O conteúdo nunca é
  lido pelo script nem gravado em logs; o caminho é passado aos processos filho por `PGPASSFILE`.
- Windows PowerShell 5.1.

## Uso

```powershell
# Cria o banco descartável padrão, aplica 0001..0017 e roda TODOS os passos.
powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/run_validation.ps1

# Nome exclusivo (recomendado para execuções paralelas):
powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/run_validation.ps1 `
  -Database hattz_validation_disposable_minha_rodada_20261120

# Upgrade REAL em OUTRO banco descartável: 0001..0014 originais -> 0015..0017.
powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/run_upgrade_validation.ps1 `
  -Database hattz_validation_disposable_upgrade_minha_rodada_20261120
```

Parâmetros principais: `-Database` (padrão `hattz_validation_disposable_20261119`), `-PgHost`,
`-Port`, `-User`, `-LogDir` (padrão `%LOCALAPPDATA%\Hattz-2.0-postgres\logs\validation_disposable_20261119`),
`-Runs` (padrão 3), `-Delay` (padrão `2.0`), `-PsqlPath`, `-PgPassFile`, `-Recreate` e
`-ConfirmDropDatabase`.

### Contrato de segurança do ciclo de vida do banco

1. **Nome aceito:** somente identificadores PostgreSQL simples, minúsculos, com o prefixo obrigatório
   `hattz_validation_disposable_` e no máximo **63 caracteres**. A validação ocorre **antes** de
   qualquer interpolação em SQL ou envio de comando. Qualquer outro nome — inclusive bancos legados
   `hattz_phase2b_validation*` — é recusado com **exit 64**.
2. **Banco existente sem `-Recreate`:** aborta com **exit 65** **antes** de criar diretório de logs,
   arquivos temporários ou enviar DDL/DML. Nada é modificado.
3. **`-Recreate`:** exige, cumulativamente, prefixo válido, `-ConfirmDropDatabase` com o nome **exato**
   do banco, arquivo `database-ownership.json` no `-LogDir` e comentário `HATTZ_VALIDATION_DISPOSABLE|<runId>|...`
   no banco, com o mesmo `runId`. Qualquer divergência aborta com **exit 66** sem apagar nada.
4. **Propriedade:** cada criação grava o marcador `database-ownership.json` (nome, `runId`, prefixo,
   timestamp, host/porta/usuário — **sem senha**) e o comentário correspondente no banco. Um banco
   criado fora desse fluxo, ou em outro `-LogDir`, **não** pode ser apagado pelo script.
5. **Nunca** reutiliza automaticamente bancos antigos ou de desenvolvimento. O padrão é sempre criar
   um banco novo; `-Recreate` é a única via de exclusão e exige prova de propriedade.
6. **Logs:** ficam em `-LogDir` (`results.csv`, `*.out.log`/`*.err.log`, artefatos `90_conc_*`). A
   senha nunca aparece: o `psql` recebe apenas o caminho do `PGPASSFILE` por ambiente.

> **Nota operacional:** `-Recreate` não autoriza apagar bancos que não tenham sido criados
> especificamente por este fluxo validado. Para uma execução nova, use outro `-Database` com o
> prefixo obrigatório; não apague bancos anteriores para "testar" o script.

- **Exit code `0`** = todas as migrations aplicadas e **todos** os passos do harness passaram.
- **Exit codes `2`/`3`** = falha de configuração/harness; **`4`** = `psql`/`PGPASSFILE` ausente;
  **`64`/`65`/`66`** = recusa de segurança do ciclo de vida do banco.
- Evidências de qualquer falha permanecem em `-LogDir` (quando a falha ocorre depois da criação do
  diretório). Abortos de segurança não criam `-LogDir`.

## Estrutura

```
validation/
  run_validation.ps1            # orquestrador: lifecycle do DB + 0001..0017 + todos os passos
  run_upgrade_validation.ps1    # orquestrador de upgrade: 0001..0014 -> 0015..0017 (DB distinto)
  concurrency/90_concurrency.ps1# driver de concorrência (9 cenários x N execuções, ordem alternada)
  workers/81..85_*.sql          # workers transacionais que emitem traço (begin/end) por app
  parity/build_parity.mjs       # gerador da fixture única de paridade SQL<->TS (75 casos, --verify)
  sql/00_preflight.sql          # pré-condições do ambiente
  sql/20_verify_0011.sql        # §3 estrutura + NOT NULL + FK composta + rejeições (hard-fail)
  sql/21_0011_precheck_setup.sql / 22_..._after_failure.sql  # banco legado divergente
  sql/23_0011_idempotency.sql   # idempotência por DEFINIÇÃO (não por nome)
  sql/30_validator_parity.sql   # paridade SQL do validador (gerado)
  sql/31_upgrade_before.sql     # captura do estado do validador/dados antes do upgrade
  sql/35_corrective_guards.sql  # 0015/0016/0017: chaves proibidas, oficialidade, mídia, negações
  sql/36_upgrade_after.sql      # comparação antes/depois + dados preexistentes intactos
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
| §5 validador `0009`/`0014`         | `parity/build_parity.mjs` → `tests/fixtures/publishable-snapshot-parity.json` + `sql/30_validator_parity.sql`; mesmo conjunto de 75 casos exercita TS e SQL (inclui trim Unicode, `schemaVersion: 1.0` e rejeição de chaves internas de identidade/propriedade).                                                                                                                                                                                                       |
| §6 grants/RLS/views                | `sql/70_access_matrix.sql` (executa como `anon` e `authenticated` de verdade) + `sql/71_grants_audit.sql` (catálogo: tabela/coluna/schema/função/view, `security_invoker`/`security_barrier`, projeções).                                                                                                                                                                                                                                                              |
| §7 slug                            | `sql/72_slug_integrity.sql` (regra 1 — um slug atual por perfil — HARD, índice `0013`; unicidade global HARD; histórico/`reserved`/normalização como decisão do Owner).                                                                                                                                                                                                                                                                                                |
| §9 migrations/PG                   | `run_validation.ps1` aplica `0001`→`0017` em ordem com `ON_ERROR_STOP=1` (incl. reaplicação idempotente de `0012`–`0017`) e falha duro em qualquer erro. `run_upgrade_validation.ps1` aplica `0001`–`0014` originais em DB distinto, captura o "antes", aplica `0015`–`0017`, compara o "depois" e confirma dados preexistentes intactos.                                                                                                                              |
| Fase corretiva — oficialidade      | `sql/35_corrective_guards.sql`: códigos externos pendentes sem UUID inventado; exclusão, alteração de `official_code`, transferência, desvinculação e reatribuição negadas, com evidência durável (sequência não transacional + `RAISE WARNING` no log). Código duplicado e formato inválido rejeitados. Sem autoridade administrativa fictícia: a exceção permanece fechada.                                                                                          |
| Fase corretiva — mídia             | `sql/35_corrective_guards.sql`: 11 valores canônicos aceitos e valor desconhecido rejeitado pelo CHECK; `packages/contracts` centraliza `MEDIA_ASSET_KINDS`; Studio/Share validam `kind` em runtime e backup rejeita valores desconhecidos e campos de oficialidade.                                                                                                                                                                                                   |

## Reprodutibilidade da fixture de paridade

`tests/fixtures/publishable-snapshot-parity.json` e `sql/30_validator_parity.sql` são **gerados**:

```powershell
node infrastructure/supabase/validation/parity/build_parity.mjs
```

Para apenas conferir que os artefatos commitados correspondem ao gerador (usado no CI e em
`npm test`):

```powershell
node infrastructure/supabase/validation/parity/build_parity.mjs --verify
```

O gerador formata o JSON com o Prettier do projeto, então `npm run format` permanece verde após
regerar. Não edite os artefatos gerados à mão.

## Observações de implementação (armadilhas já tratadas)

- PowerShell 5.1 corrompe argumentos `-c` inline que contenham aspas duplas (JSON): por isso o SQL é
  escrito em arquivo temporário e passado por `-f`.
- `Start-Process -PassThru` com redirecionamento **não** expõe `ExitCode` de forma confiável; tanto o
  orquestrador quanto o driver de concorrência usam a API .NET `System.Diagnostics.Process`, com
  leitura assíncrona de stdout/stderr antes de `WaitForExit()`.
- Em PostgreSQL, `\b` é _backspace_, não fronteira de palavra — o validador usa `\y`.
- `RAISE EXCEPTION` aborta a transação e desfaz o `INSERT` em `hattz_audit.audit_logs` feito pelo
  trigger de proteção. Por isso a `0016` também emite `RAISE WARNING` (log do servidor, fora da
  transação) e avança `hattz_audit.official_identity_denial_seq` (sequências são não transacionais).
  O teste C11 verifica o contador durável; a linha relacional permanece como intenção de auditoria.
- `50_seed.sql` desliga temporariamente apenas `trg_official_identity_protection` para semear a
  flag legada `is_official` de Alice em banco descartável; todas as tentativas posteriores Rodam com
  as triggers ligadas. `35_corrective_guards.sql` reidempotiza os códigos pendentes no registry porque
  o `TRUNCATE ... CASCADE` do seed também o trunca por causa da FK.

## Fase corretiva — pendência do Owner

`MT7QTEVMZY` e `YGZNK6TMG8` são **identificadores externos** (`hattz_admin.official_code_registry` +
`public.profiles.official_code`), não `technical_id`, UUID, slug, role ou conteúdo. Não há evidência
no repositório de perfis existentes correspondentes, então a `0016` registra ambos como `pending`,
**sem associar UUIDs e sem inventar registros**. A associação inicial permanece como **pendência de
provisionamento do Owner**.

Não existe autoridade administrativa confiável no projeto atual: a exceção de identidade oficial
está **fechada por decisão** (toda tentativa é negada). Nenhum `SECURITY DEFINER`, papel público
`OWNER`/`VIP`, parâmetro de cliente, `localStorage`/IndexedDB ou variável de ambiente é aceito como
autoridade. O Owner deverá definir o procedimento administrativo real antes de qualquer exceção.
