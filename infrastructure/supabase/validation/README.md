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
  parity/check_media_parity.mjs # verificador 0017 <-> MEDIA_ASSET_KINDS (--verify; exit 1 na divergência)
  provenance/manifest.ps1       # funções de manifesto/verificação (nada executa no dot-source)
  provenance/verify_manifest.ps1# CLI de verificação posterior de tamanhos e SHA-256
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
| Fase corretiva — mídia             | `sql/35_corrective_guards.sql`: 11 valores canônicos aceitos e valor desconhecido rejeitado pelo CHECK; `packages/contracts` centraliza `MEDIA_ASSET_KINDS`; `parity/check_media_parity.mjs` compara a fonte canônica com o CHECK de `0017` e falha com exit 1; testes negativos em `tests/integrity/media-parity.test.ts`. Studio/Share validam `kind` em runtime e backup rejeita valores desconhecidos e campos de oficialidade.                                    |

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

## Paridade do contrato de mídia (`0017`)

`packages/contracts/src/domains.ts` (`MEDIA_ASSET_KINDS`) é a **única fonte canônica**. O verificador
lê essa declaração e o CHECK de `ck_media_assets_kind_canonical` em
`infrastructure/supabase/migrations/0017_media_kind_canonical.sql` como texto — não executa SQL,
**não gera e nunca reescreve migrations**.

```powershell
npm run media:parity                 # relatório completo
npm run media:parity -- --verify     # gate de CI (equivalente ao --verify do build_parity)
```

O verificador detecta: valores **ausentes**, **extras**, **duplicados** em qualquer uma das fontes,
**divergência de ordem**, CHECK ausente/renomeado, expressões não literais e arquivos ilegíveis.
Qualquer divergência imprime `MEDIA PARITY FAIL` e termina com **exit 1**; a divergência zero termina
com **exit 0**. Os testes negativos em `tests/integrity/media-parity.test.ts` injetam cada uma dessas
divergências em arquivos temporários (com `--contracts`/`--sql`) e provam o exit 1 sem modificar
`0017`. A fixture duplicada `CANONICAL_MEDIA` foi removida dos testes do Studio, que agora importam
a constante canônica.

Se os 11 valores precisarem mudar no futuro, o gate falhará até que o Owner autorize uma **nova
migration aditiva** (número definido no ato da aprovação). `0017` permanece imutável; nenhuma `0020`
foi criada.

## Proveniência das execuções

Ambos os orquestradores gravam, ao final de **todo** desfecho posterior à criação do `LogDir`:

- `run-manifest.json` — `schema_version`, `run_id`, `started_at`/`finished_at`, `commit_sha`,
  estado da árvore (`porcelain` + exit codes de `git diff`), comandos e exit codes de cada etapa,
  resumo com o exit code final do harness, versões de `node`/`npm`/`psql`/PowerShell/PostgreSQL
  (servidor, quando disponível), sistema operacional, diretório de trabalho, parâmetros informados,
  nomes (não valores) de variáveis de ambiente consultadas, e caminho/tamanho/**SHA-256** de cada
  artefato (`results.csv`, `*.out.log`, `*.err.log`, `*.sql`, artefatos de concorrência).
- `run-manifest.sha256` — `<sha256>  run-manifest.json` em arquivo **externo** ao JSON.

O manifesto **não contém o seu próprio hash** (`integrity.self_hash_included = false`): isso evita
autorreferência. O hash é calculado sobre os bytes exatos do JSON gravado em UTF-8 sem BOM.

```powershell
powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/provenance/verify_manifest.ps1 `
  -LogDir "$env:LOCALAPPDATA\Hattz-2.0-postgres\logs\validation_disposable_20261119"
```

Exit `0` = manifesto íntegro e todos os artefatos conferem; `1` = divergência de hash/tamanho ou
artefato ausente; `2` = `-LogDir` inválido. Abortos de configuração/segurança que ocorrem **antes**
da criação do `LogDir` (ex.: banco existente sem `-Recreate`, exit 65) não geram manifesto — nenhum
artefato foi produzido nesses casos.

> **Integridade ≠ atestação.** O hash externo prova apenas que os bytes não mudaram desde que o
> manifesto foi gravado. Um operador local pode forjar manifesto, logs e hash ao mesmo tempo. Não
> existe assinatura criptográfica, timestamp confiável, registro em log transparente nem testemunha
> externa: esta evidência é **auto-relatada pelo runner local** e não deve ser apresentada como
> autenticidade ou atestação independente da execução. Versões de ferramentas também são
> auto-relatadas.

A leitura da versão do servidor usa a mesma função `Qv` já existente no harness, em uma única
consulta `select version()` somente-leitura, no mesmo banco descartável. Nenhuma credencial, token
ou valor de variável de ambiente é gravado; `PGPASSFILE` continua sendo lido apenas pelo `psql`.

## Fase corretiva — decisões e limites de segurança (2026-11-20)

### Alternativa A — `service_role` sem GRANT adicional

Decisão do Owner mantida: **nenhum GRANT adicional** ao `service_role`; nenhuma `0018` criada.

- `0016_official_identity_protection.sql:32-37` cria apenas a _policy_ `for select to
postgres, service_role` no registry. Policy não concede privilégio de esquema/tabela.
- `0008_rls_policies.sql:123` revoga `USAGE` em `hattz_admin` de papéis públicos e não o concede ao
  `service_role`. `0012_trusted_writer_grants.sql:41,45-61` cobre somente `public` e duas tabelas de
  publicação. Não existe `GRANT` de `USAGE`/`SELECT` em `hattz_admin.official_code_registry` no
  repositório.
- Consequência: as funções de trigger da `0016` são `SECURITY INVOKER` e leem o registry ao validar
  `official_code`/`id`. Em um escritor server-side de `public.profiles`, `INSERT`/`UPDATE` dessas
  colunas falhariam por falta de privilégio **antes** de qualquer decisão de oficialidade
  (fail-closed). Isso é uma quebra funcional latente, não uma proteção ativa.
- Teste futuro (não executado aqui): harness descartável com `SET ROLE service_role` e asserções de
  `has_schema_privilege`/`has_table_privilege`, `INSERT` comum negado enquanto A vigora, e negações
  de oficialidade sempre com o código `0016:%`. O harness atual `80_trusted_writer_privileges.sql`
  cobre apenas publicações/snapshots.
- Antes de qualquer liberação, reavaliar: `USAGE ON SCHEMA hattz_admin`, `SELECT` nas colunas do
  registry, `INSERT` em `hattz_audit.audit_logs`, `EXECUTE` nas funções de trigger da `0016` e —
  sobretudo — os grants que o Supabase real concede fora do repositório (`BYPASSRLS`, `rolsuper`,
  defaults). Nada disso foi concedido nesta etapa.

### RLS, FORCE RLS, triggers, TRUNCATE e superuser — limites reais

| Camada                                   | O que o banco faz                                                          | O que **não** faz                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Usuários comuns (`anon`/`authenticated`) | RLS + revogações + policies + triggers da `0016` bloqueiam DML ordinário   | —                                                                                                                                 |
| Papel de aplicação (`service_role`)      | Sem grant em `hattz_admin`, leitura do registry falha (Alternativa A)      | Não impede grants externos do Supabase não visíveis no repositório                                                                |
| Dono da tabela                           | Controle operacional: owner sem login, papel de migração separado, runbook | `ALTER TABLE ... DISABLE/DROP TRIGGER`, `OWNER TO`, `FORCE/NO FORCE RLS`, `GRANT`, `TRUNCATE` — o owner pode fazer tudo isso      |
| Superuser / admin de infraestrutura      | **Nada no PostgreSQL impede a ação**                                       | FORCE RLS, REVOKE, triggers comuns, event triggers e pgAudit **não protegem** contra superuser; somente detecção/resposta externa |

Observações específicas:

- `FORCE ROW LEVEL SECURITY` obrigaria o **dono** a respeitar policies de linha, mas não bloqueia
  DDL, `TRUNCATE`, `DISABLE TRIGGER` nem superuser/BYPASSRLS. O registry criado na `0016` tem apenas
  `ENABLE ROW LEVEL SECURITY`; alterar isso exigiria nova migration autorizada.
- Não existe trigger `BEFORE/AFTER TRUNCATE` no repositório. `50_seed.sql:16-17` demonstra que
  `TRUNCATE ... CASCADE` em `profiles` trunca o registry por causa da FK da `0016`. PostgreSQL
  permite trigger de statement `BEFORE TRUNCATE`, mas ela não existe hoje e também é desativável
  por superuser.
- `session_replication_role = replica` é um `SET` de GUC, **não** é DDL. As triggers da `0016`
  foram criadas sem `ENABLE REPLICA`/`ENABLE ALWAYS`, portanto sob `replica` elas não disparam.
- **Nenhuma afirmação de que o banco protege contra superuser malicioso é válida.** A proteção
  nesse nível é operacional/detecção, não prevenção.

### Event triggers × pgAudit

| Operação                                                                                                 | Event trigger                               | Trigger comum                                    | pgAudit / log externo               |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| `INSERT/UPDATE/DELETE` em tabelas                                                                        | Não                                         | Sim (já existentes)                              | Para ator final e conteúdo completo |
| `TRUNCATE` / `TRUNCATE ... CASCADE`                                                                      | Não                                         | Somente com `BEFORE TRUNCATE` (não implementada) | Sim                                 |
| `ALTER TABLE ... DISABLE/ENABLE TRIGGER`, `OWNER TO`, `FORCE RLS`, `GRANT/REVOKE`, `CREATE/DROP TRIGGER` | Sim (`ddl_command_start`/`ddl_command_end`) | Não                                              | Redundância recomendada             |
| `SET session_replication_role = replica`                                                                 | Não                                         | Não                                              | **Sim**                             |
| `COPY`, `pg_restore --disable-triggers`                                                                  | Parcial (DDL de disable)                    | Linha a linha, quando ligadas                    | Sim                                 |
| Acesso a arquivos/WAL/data dir                                                                           | Não                                         | Não                                              | Somente host/IDS                    |

Ambos são **best-effort**: um superuser pode desativar event triggers e apagar logs locais.
Pela documentação do PostgreSQL 17 (`event-trigger-definition`), `ddl_command_start`/
`ddl_command_end` cobrem `CREATE`, `ALTER`, `DROP`, `COMMENT`, `GRANT` e `REVOKE` — **exceto**
comandos que visam objetos compartilhados (`databases`, `roles`, `tablespaces`) e os próprios event
triggers. Portanto `GRANT`/`REVOKE` em tabelas/schemas são detectáveis por event trigger, mas
`CREATE/ALTER/DROP ROLE` e `GRANT` de role não são; esses casos exigem pgAudit (categorias `ROLE`/
`DDL`, conforme versão e configuração) ou log externo. `TRUNCATE`, DML e `SET` de GUC também ficam
fora do evento DDL. Nenhum event trigger ou pgAudit foi instalado nesta etapa (nenhuma migration
foi criada).

### Auditoria durável — por que `WARNING`, sequência e `NOTIFY` não bastam

Na `0016`, o trigger grava em `audit_logs`, avança `official_identity_denial_seq`, emite
`RAISE WARNING` e depois lança `RAISE EXCEPTION`. A exceção desfaz o `INSERT` e qualquer `NOTIFY`
(que é transacional). Sobrevivem apenas o `nextval()` (não transacional) e a mensagem de WARNING,
que vai para o log do servidor fora da transação. Logo:

- **Sequência** = contador de reconciliação, não registro de evento; não tem ator, alvo nem
  correlação confiável.
- **WARNING** = mensagem sem retenção garantida, formatada pelo próprio trigger; não é store
  durável.
- **NOTIFY** = transacional; seria revertido junto com a negação.

Para que o evento sobreviva, ele precisa ser materializado por ator **fora da transação abortada**.
Arquiteturas possíveis, **nenhuma implementada nesta etapa**:

| Alternativa                 | Origem                               | Entrega                                                              | Ator confiável                                              | Correlação                              | Falha                                               | Retenção                           | Integridade                             |
| --------------------------- | ------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- | ---------------------------------- | --------------------------------------- |
| Backend em conexão separada | Erro `0016:%` capturado pelo backend | Backend grava em `hattz_audit.audit_logs` em outra transação/conexão | Sessão/JWT autenticada, nunca `current_user`                | ID gerado pelo backend antes da chamada | Perda se o processo morrer; exige retry idempotente | Política do store, idealmente WORM | Hash encadeado                          |
| Fila + worker               | Backend publica o erro               | Fila durável → worker → store append-only                            | Backend autenticado; worker com credencial própria          | Mesmo correlation ID no payload         | Redelivery, idempotência, dead-letter               | Store append-only imutável         | Hash encadeado + assinatura do produtor |
| Log do servidor + shipper   | pgAudit, não o trigger               | Shipper para store externo                                           | Papel de conexão + `application_name` definido pelo backend | `application_name`/campo de sessão      | Buffer/lag; perda se o shipper falhar               | WORM/object lock                   | Log assinado/timestampado no destino    |

Nenhuma tabela, função, serviço, fila, worker ou store externo foi criado. A exceção administrativa
permanece **fechada**.

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
  O teste C11 verifica o **contador**; a linha relacional não sobrevive. Ver a seção "Auditoria
  durável" acima: contador e WARNING **não** são auditoria completa.
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

Nesta etapa corretiva limitada não foram criadas migrations (`0009`, `0014` e `0017` preservados),
não foi concedido nenhum privilégio ao `service_role` (Alternativa A), não foi implementado
backend/fila/worker/store de auditoria, não foi iniciada a Fase 2B e não houve acesso remoto,
deploy ou push. A **proveniência gerada localmente não é atestação independente** (ver acima).
