# Hättz 2.0 — Relatório de Auditoria Corretiva Integral — 2026-11-19

> **Classificação: PREPARADO PARA A PRÓXIMA ETAPA DE INTEGRAÇÃO; NÃO PRONTO PARA LANÇAMENTO PÚBLICO.**
> Nenhum push, deploy, publicação, criação/conexão de projeto Supabase, migration remota ou
> operação destrutiva fora de bancos PostgreSQL locais novos e descartáveis foi executada.
>
> **Legenda de evidência:** **[EXECUTADO]** comando executado nesta rodada, com exit code registrado ·
> **[TESTADO]** teste automatizado executado · **[INTEGRAÇÃO]** PostgreSQL 17.12 local descartável ·
> **[PREPARADO]** contrato/limite declarado, sem ambiente alvo real.

## Linha de tempo e fonte da verdade

- **Fonte de verdade:** `C:\Users\Noir\Downloads\Hattz-2.0-CORRIGIDO-PARCIAL-2026-11-19.zip`,
  exportação do commit `63b77b1e9939b8633a4afb2b84113847ca844318`.
- **Baseline importado e commitado:** `2b78101f15bd80713525fbd6f98ba8de42341bdc` —
  `audit: import independently corrected export (media generation guard + doc language)`.
  Histórico Git preservado: **sem** reset, rebase, amend, squash ou force push.
- **Ambiente:** Node **v26.13.0**, npm **11.20.0**, Vitest **4.1.12**, Vite **7.3.8**,
  PostgreSQL **17.12** (somente em `127.0.0.1:55432`, bancos novos e descartáveis).
- Logs reais desta rodada: `C:\Users\Noir\AppData\Local\Temp\opencode\hattz-audit-logs\`
  (`final-typecheck2.log`, `final-lint2.log`, `final-format2.log`, `final-test.log`,
  `final-build.log`, `final-audit-all.log`, `final-audit-prod.log`, `final-parity-verify.log`,
  `pg-validation9.log`, `parity-sql7.log`). Após a redação final da documentação, todos os gates
  TypeScript/Node foram reexecutados sobre o estado exatamente entregue (`delivery-typecheck.log`,
  `delivery-lint.log`, `delivery-format.log`, `delivery-test.log`, `delivery-build.log`,
  `delivery-audit-all.log`, `delivery-audit-prod.log`, `delivery-parity.log`), com os mesmos
  resultados e exit codes.

## 1. Defeitos encontrados — severidade, causa e correção

A severidade é técnica e local: **Alta** = perda de integridade de dados/persistência, vazamento de
informação interna ou falha silenciosa de gate; **Média** = comportamento incorreto em concorrência,
importação/exportação ou auditoria; **Baixa** = acessibilidade, rotulagem ou consistência documental.

### 1.1 Share

| ID  | Sev.  | Causa reproduzível                                                                                                                                                                               | Correção                                                                                                                                                                                                             | Arquivos                                                                                                                           |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Alta  | `ErrorBoundary` colocava `error.message` no estado exibido; exceções de biblioteca podem conter DSNs, caminhos ou tokens.                                                                        | Estado passou a ser apenas `hasError`; mensagem pública fixa e diagnóstico completo restrito a `componentDidCatch`/console.                                                                                          | `apps/share/src/rendering/ErrorBoundary.tsx`, `apps/share/src/publicMessages.ts` (novo)                                            |
| S2  | Alta  | `LocalPublicationSource.releaseMedia()` revogava as URLs **antes** da nova leitura, embora existisse geração; uma navegação A→B→A podia exibir mídia revogada ou URLs de uma geração descartada. | Cada leitura cria um `MediaSet` isolado; o conjunto anterior só é descartado quando a leitura atual termina com sucesso; gerações superadas têm suas URLs descartadas; `dispose()` público invalida leituras em voo. | `apps/share/src/data/localPublicationSource.ts`, `apps/share/src/data/types.ts`, `tests/share/localPublicationSource.test.ts`      |
| S3  | Média | `requestKey = slug#attempt` não distinguia uma nova visita ao mesmo slug com a mesma tentativa, permitindo que um resultado antigo ("ressuscitado") substituísse o estado atual.                 | Sequencial de visita incrementado **dentro do efeito** (`slug#attempt#sequência`); nenhuma ref é lida durante render; `loading` permanece até a leitura corrente resolver.                                           | `apps/share/src/useShareProfile.ts`, `tests/share/share-profile-view.test.tsx`                                                     |
| S4  | Média | Fonte estática aceitava slug divergente do manifesto, podendo renderizar um perfil sob endereço diverso do publicado.                                                                            | Slug divergente é rejeitado explicitamente na fonte; mensagens públicas centralizadas.                                                                                                                               | `apps/share/src/data/staticShareSource.ts`, `tests/share/staticShareSource-validation.test.ts`, `apps/share/src/publicMessages.ts` |
| S5  | Baixa | Estados terminais "não encontrado"/"despublicado" não eram anunciados por leitores de tela.                                                                                                      | `role="status" aria-live="polite"` nos dois estados.                                                                                                                                                                 | `packages/profile-view/src/rendering/states.tsx`, `tests/share/share-profile-view.test.tsx`                                        |

### 1.2 Studio — persistência, concorrência e transferência

| ID  | Sev.  | Causa reproduzível                                                                                                                                                                                                   | Correção                                                                                                                                                                                                  | Arquivos                                                                                          |
| --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| T1  | Alta  | Troca de perfil A→B com autosave em voo: `selectProfile` só aguardava o save se `dirtyRef` estivesse true, e não havia token de carga — uma leitura lenta de A podia terminar depois de B e trocar o rascunho ativo. | `loadTokenRef` invalida cargas tardias; toda troca/criação/reload aguarda `waitForSave()` antes de substituir `draftRef`; `clearActiveProfile()` limpa estado órfão.                                      | `apps/studio/src/hooks/useStudioEditor.ts`, `tests/studio/studio-corrective-ui.test.tsx`          |
| T2  | Alta  | `runSave()` passou a incluir `await waitForSave()` no início, reintroduzindo janela de corrida: um `pagehide`/flush imediato podia ver `savingRef === false` e publicar com revisão obsoleta.                        | Verificação **síncrona** com `while (savingRef.current && savePromiseRef.current)` no início de `runSave`; `waitForSave()` usado apenas em troca/reload; dependência `waitForSave` removida de `runSave`. | `apps/studio/src/hooks/useStudioEditor.ts`, `tests/studio/studio-corrective-persistence.test.ts`  |
| T3  | Alta  | `handleUpload` capturava `editor.activeProfileId` no início; se o perfil mudasse durante o upload, o asset de A podia ser referenciado pelo rascunho de B (o Share rejeita posse divergente).                        | Espelho síncrono `activeProfileIdRef`; se o perfil mudou, o asset órfão é removido com `deleteMediaAsset` e o upload retorna `null`.                                                                      | `apps/studio/src/components/Studio.tsx`                                                           |
| T4  | Média | `deleteMediaAsset` transacionava apenas `mediaAssets`, `workingDrafts`, `draftSnapshots` e `publications`; uma operação em `pendingSyncOps.payload` podia continuar referenciando o asset excluído.                  | `pendingSyncOps` incluído na transição `rw` e no cálculo de referências (`fila:<operationId>`).                                                                                                           | `apps/studio/src/persistence/repository.ts`, `tests/studio/studio-corrective-persistence.test.ts` |
| T5  | Média | Restore consumia a confirmação destrutiva antes de ler/validar o arquivo (falha de leitura deixava a próxima restauração pré-autorizada) e mantinha o perfil ativo em memória quando ele não existia no backup.      | Confirmação consumida em `finally`; perfil ausente no backup chama `clearActiveProfile()` e exige nova seleção.                                                                                           | `apps/studio/src/components/DataPanel.tsx`                                                        |
| T6  | Média | Importação aceitava `publicSlugDraft` ausente/inválido/reservado e inventava `createLocalId('perfil')`; exportação podia gerar arquivo que a própria importação rejeitaria.                                          | `requireImportableSlug()` rejeita explicitamente slug ausente/inválido/reservado (não inventa, não normaliza silenciosamente); export passa pelo mesmo validador canônico de publicação.                  | `apps/studio/src/persistence/transfer.ts`, `tests/studio/studio-corrective-persistence.test.ts`   |
| T7  | Média | `atob()` era chamado antes de qualquer checagem de tamanho; um `dataUrl` gigante podia esgotar memória/cota.                                                                                                         | `MEDIA_SAFETY_LIMITS` (30 assets, 12 MiB por asset, 60 MiB total) e tamanho máximo da string Base64 validados **antes** da decodificação; limites são guardrails técnicos, **não** cotas de produto.      | `apps/studio/src/persistence/transfer.ts`, `tests/studio/studio-corrective-persistence.test.ts`   |
| T8  | Média | `exportBackup()` lia dez tabelas fora de transação, podendo misturar estado pré-save e pós-save de um autosave concorrente.                                                                                          | Leitura única em transação Dexie `r` sobre as dez tabelas.                                                                                                                                                | `apps/studio/src/persistence/transfer.ts`                                                         |
| T9  | Baixa | Restore de backup antigo restaurava `db_schema_version` desatualizado.                                                                                                                                               | Versão do schema sempre reescrita para `STUDIO_DB_VERSION` corrente.                                                                                                                                      | `apps/studio/src/persistence/transfer.ts`                                                         |
| T10 | Baixa | `useStudioMedia` revogava object URLs no cleanup mas mantinha o mapa antigo, devolvendo URLs inválidas até a próxima leitura terminar.                                                                               | `setUrls(new Map())` no mesmo instante da revogação.                                                                                                                                                      | `apps/studio/src/hooks/useStudioMedia.ts`                                                         |
| T11 | Baixa | Abas do Studio usavam `role="tab"` sem roving `tabIndex`, `aria-controls`, `tabpanel` ou navegação por teclado.                                                                                                      | Padrão ARIA tabs completo: setas/Home/End, foco, `aria-controls`/`aria-labelledby`, painel com `tabIndex=0`.                                                                                              | `apps/studio/src/components/Studio.tsx`, `tests/studio/studio-corrective-ui.test.tsx`             |
| T12 | Baixa | A fila local exibia rótulo "Sincronizando", sugerindo envio remoto inexistente.                                                                                                                                      | Rótulos explícitos ("sem envio remoto nesta fase"); texto da fila: "Registros na fila local (sem envio remoto nesta fase)".                                                                               | `apps/studio/src/components/DataPanel.tsx`, `tests/studio/studio-corrective-ui.test.tsx`          |

### 1.3 Banco, validação e infraestrutura

| ID  | Sev.  | Causa reproduzível                                                                                                                                                                                      | Correção                                                                                                                                                                                                                      | Arquivos                                                                                                                                                    |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Alta  | `Start-Process -PassThru -RedirectStandard*` não propaga exit code confiável no Windows: uma migration com erro podia ser registrada como `[OK]`. O banco `_7` revelou o problema ao falhar com exit 3. | `Run-PsqlFile` passou a usar `System.Diagnostics.Process`, leitura assíncrona de stdout/stderr antes de `WaitForExit()` e retorno de `ExitCode` real.                                                                         | `infrastructure/supabase/validation/run_validation.ps1`                                                                                                     |
| D2  | Média | Paridade TS↔SQL incompleta: `btrim` remove só U+0020, enquanto `String.prototype.trim()` remove White_Space Unicode; regex `^[0-9]+$` rejeitava `schemaVersion: 1.0`, inteiro válido em JS/JSON.        | Migration aditiva `0014` redefine a função com trim Unicode e checagem numérica (`trunc`), preservando `MAX_SAFE_INTEGER`; **nenhuma** migration antiga foi editada. Quatro casos novos elevaram a fixture de 67 para **71**. | `infrastructure/supabase/migrations/0014_validator_parity_and_slug_index_definition.sql` (novo), `build_parity.mjs`, fixture e SQL gerados                  |
| D3  | Média | Índice de "um slug atual por perfil" de `0013` era verificado apenas pelo nome; uma renomeação manual permitiria criar índice equivalente duplicado.                                                    | `0014` verifica por **definição** no catálogo (coluna, unicidade, predicado normalizado); re-aplicação é no-op. Corrigido o predicado com parênteses após falha real no banco `_7`.                                           | `0014_validator_parity_and_slug_index_definition.sql`                                                                                                       |
| D4  | Média | `71_grants_audit.sql` não inspecionava o pseudograntee `PUBLIC`. Após incluí-lo, grants padrão do catálogo do sistema (ex.: `pg_settings`) geraram falso positivo.                                      | Auditoria passou a cobrir `PUBLIC` **restrita ao schema `public`** — cobertura ampliada sem perder o escopo correto.                                                                                                          | `infrastructure/supabase/validation/sql/71_grants_audit.sql`                                                                                                |
| D5  | Baixa | Fixture e SQL de paridade eram gerados, mas nada garantia que os artefatos commitados correspondiam ao gerador.                                                                                         | `build_parity.mjs --verify` (compara bytes, exit 1 se desatualizado), teste `tests/parity/build-parity-reproducibility.test.ts` e gate no CI.                                                                                 | `build_parity.mjs`, `tests/parity/build-parity-reproducibility.test.ts` (novo), `.github/workflows/ci.yml`                                                  |
| D6  | Baixa | Documentação e harness citavam `0001`–`0013`, 67 casos e 36 etapas como estado atual.                                                                                                                   | Atualizados para `0001`–`0014`, 71 casos e 38 etapas, preservando o registro histórico das rodadas anteriores.                                                                                                                | `DEVELOPMENT_STATUS.md`, `README.md`, `infrastructure/supabase/validation/README.md`, `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md`                         |
| D7  | Baixa | Baseline importado tinha `npm run typecheck` exit 2 (`.then` em Promise do Dexie em teste) e `npm run format` exit 1 (documentação obrigatória não formatada).                                          | Corrigido no início da rodada; ambos os gates passaram a exit 0.                                                                                                                                                              | `tests/share/localPublicationSource.test.ts`, `docs/OPENCODE-PROMPT-AUDITORIA-CORRETIVA-INTEGRAL.md`, `docs/AUDITORIA-INDEPENDENTE-CORRECOES-2026-11-19.md` |

## 2. Arquivos corrigidos nesta rodada

**Share:** `src/App.tsx`, `src/useShareProfile.ts`, `src/publicMessages.ts` (novo),
`src/data/{localPublicationSource,staticShareSource,types}.ts`,
`src/rendering/ErrorBoundary.tsx`, `../profile-view/src/rendering/states.tsx`.

**Studio:** `src/components/{Studio,DataPanel}.tsx`,
`src/hooks/{useStudioEditor,useStudioMedia,useStudioPublication}.ts`,
`src/persistence/{repository,transfer}.ts`.

**Banco/validação/CI:** `infrastructure/supabase/migrations/0014_validator_parity_and_slug_index_definition.sql`
(novo), `infrastructure/supabase/validation/{run_validation.ps1,README.md}`,
`infrastructure/supabase/validation/parity/build_parity.mjs`,
`infrastructure/supabase/validation/sql/{30_validator_parity.sql,71_grants_audit.sql}`,
`tests/fixtures/publishable-snapshot-parity.json`, `.github/workflows/ci.yml`.

**Testes novos/ampliados:** `tests/share/{localPublicationSource.test.ts,share-profile-view.test.tsx,staticShareSource-validation.test.ts,errorBoundary.test.tsx}`,
`tests/studio/{studio-corrective-persistence.test.ts,studio-corrective-ui.test.tsx}`,
`tests/parity/build-parity-reproducibility.test.ts`.

**Documentação:** `README.md`, `DEVELOPMENT_STATUS.md`, os dois documentos obrigatórios lidos no início,
`infrastructure/supabase/validation/README.md` e os dois relatórios (anterior e este).

## 3. Testes executados — versões, contagens e exit codes

| Gate (comando)                                                  | Resultado                                        | Exit code | Log                       |
| --------------------------------------------------------------- | ------------------------------------------------ | --------- | ------------------------- |
| `npm ci` (baseline)                                             | 295 pacotes, 307 auditados, 0 vulnerabilidades   | 0         | `baseline-npm-ci.log`     |
| `npm run typecheck`                                             | sem erros                                        | 0         | `final-typecheck2.log`    |
| `npm run lint`                                                  | sem erros (0 warnings após ajuste de deps)       | 0         | `final-lint2.log`         |
| `npm run format`                                                | "All matched files use Prettier code style!"     | 0         | `final-format2.log`       |
| `npm run test`                                                  | **46 arquivos / 272 testes aprovados** (81,26 s) | 0         | `final-test.log`          |
| `npm run build`                                                 | Vite 7.3.8, 110 módulos, 3 apps                  | 0         | `final-build.log`         |
| `npm audit`                                                     | found 0 vulnerabilities                          | 0         | `final-audit-all.log`     |
| `npm audit --omit=dev`                                          | found 0 vulnerabilities                          | 0         | `final-audit-prod.log`    |
| `node build_parity.mjs` (geração)                               | 71 casos regenerados                             | 0         | execução direta           |
| `node build_parity.mjs --verify`                                | ambos os artefatos OK, 71 casos                  | 0         | `final-parity-verify.log` |
| `vitest run tests/share`                                        | **11 arquivos / 52 testes**                      | 0         | execução focada           |
| `vitest run tests/studio/studio-corrective-persistence.test.ts` | **8/8**                                          | 0         | execução focada           |
| `vitest run tests/studio/studio-corrective-ui.test.tsx`         | **6/6**                                          | 0         | `studio-ui-reg4.log`      |

## 4. Validação de integração — PostgreSQL 17.12 local descartável

- **Harness final:** `run_validation.ps1 -Database hattz_phase2b_validation_9_audit_20261119` —
  **exit 0, 38 etapas / 0 falhas**, incluindo reaplicação idempotente de `0012`/`0013`/`0014`.
  Log: `pg-validation9.log`.
- **Concorrência:** **27 execuções**, 0 falhas (bloqueios explícitos, estados `draft`/`public`,
  predicados e snapshots inconsistentes rejeitados).
- **Paridade SQL direta:** `sql/30_validator_parity.sql` aplicado em banco novo
  (`hattz_phase2b_validation_7_audit_20261119`) — **71/71 casos**, exit 0, log `parity-sql7.log`.
  A migration `0014` foi aplicada e re-aplicada com sucesso nesse banco antes da rodada final.
- **Auditoria de grants:** incluindo `PUBLIC` no schema `public` — exit 0, sem privilégios inesperados.
- Bancos descartáveis criados nesta rodada: `_7`, `_8`, `_9` (todos com sufixo `audit_20261119`).
  Bancos anteriores **preservados**; nenhum banco existente foi modificado ou removido.

## 5. Situação final dos oito blocos canônicos

| Bloco                          | Situação nesta rodada                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Fundação e arquitetura     | Inalterado na estrutura; gates de typecheck/lint/format/build verdes.                                                                       |
| 2 — Banco e persistência       | `0014` aditiva; paridade 71/71; harness 38/0 em PostgreSQL local; Supabase real **[PREPARADO]**.                                            |
| 3 — Share                      | Erros públicos seguros, mídia por geração com `dispose()`, visita A→B→A, slug divergente rejeitado, estados anunciados.                     |
| 4 — Studio                     | Concorrência de carga/save/publicação corrigida, mídia e transferência endurecidas, backup transacional, ARIA tabs e rótulos honestos.      |
| 5 — Colecionáveis/permissões   | Modelo e trust boundary preservados; catálogo autoritativo remoto permanece bloqueado — não inventado.                                      |
| 6 — Control                    | **Somente leitura mantido**; `assertAdminSession` fail-closed; nenhum botão/input/form de escrita; sessão administrativa real não simulada. |
| 7 — Integrações/sincronização  | Integração local Share↔Studio intacta; fila `pendingSyncOps` explicitamente local, sem drenagem remota.                                     |
| 8 — Infra/operações/lançamento | CI com gate de reprodutibilidade; nenhum deploy, domínio, HTTPS, secretos, push ou publicação.                                              |

## 6. Segurança preservada e decisões não inventadas

- `assertAdminSession`, `TrustedAdminSession` e `TrustedOwnershipAuthority` **não** foram alterados,
  enfraquecidos ou simulados; nenhum `SECURITY DEFINER`, `BYPASSRLS` ou autoridade administrativa
  local/pública foi introduzida. RLS, grants, policies, views e validações permanecem intactos — a
  única mudança SQL é a redefinição da função validadora em `0014` e a verificação do índice de `0013`.
- Nenhuma credencial, token, service-role key, senha ou `.env` real foi gravada no repositório,
  relatórios, logs ou ZIP; apenas `.env.example` comentado permanece versionado.
- **Não** foram inventadas: política de slugs históricos/`reserved`/normalização de entrada,
  cotas editoriais de mídia (os limites aplicados são guardrails técnicos), catálogo autoritativo
  remoto, regras de concessão/revogação de benefícios, contrato de sincronização remota ou
  disponibilidade de itens colecionáveis.

## 7. Bloqueios e dependências exatas

1. **Supabase real** — depende de projeto autorizado e credenciais; impede provar Auth/JWT/PostgREST/Storage.
2. **Bloco 6 (escrita administrativa)** — depende de backend confiável e sessão administrativa legitimamente autenticada; `assertAdminSession` permanece fail-closed.
3. **Bloco 5 (catálogo autoritativo)** — depende de definições e regras aprovadas pelo Owner.
4. **Bloco 7 (sincronização remota)** — depende de contrato aprovado, idempotência e confirmação server-side; a fila local não é drenada.
5. **Lançamento** — depende de autorização explícita do Owner para deploy, domínio, HTTPS, secretos e publicação.
6. **Slugs históricos/reservados e cotas editoriais de mídia** — dependem de decisão de negócio do Owner.

## 8. Entrega e rastreabilidade

- O ZIP limpo é gerado com `git archive` a partir do HEAD final que contém este relatório.
  Excluídos: `.git`, `node_modules`, `dist/`, caches, logs, temporários e `.env` real.
- O hash **SHA-256 do ZIP é calculado depois da geração** e entregue na mensagem final de entrega,
  juntamente com o HEAD exato. Isso é necessário porque um arquivo não pode conter o próprio hash;
  nenhum valor é estimado ou plausível — apenas o resultado de `Get-FileHash`.
- Relatório anterior preservado como registro histórico: `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md`.

**Classificação final da rodada anterior: preparado para a próxima etapa de integração, não pronto para lançamento público.**

---

## 9. Integração, correções adicionais e revalidação — 19/11/2026 (segunda passagem)

Esta seção **supersede os números correntes** das seções 3–4; o restante do documento permanece como
registro histórico da rodada que produziu `f1cc87a`.

### 9.1 Preservação

- Diretório: `C:\Users\Noir\Documents\Hattz-2.0`; branch `main`; HEAD inicial
  `f1cc87ac94334e675399568290bdaa20ac492690`; `git status --short` inicial **vazio** (`STATUS_COUNT=0`).
- `f1cc87a` existe. `662479d` **não** existe neste histórico nem no `reflog` (`git cat-file -t` falhou);
  comparação direta impossível, registrada como limitação.
- ZIP anterior `Hattz-2.0-CORRETIVA-INTEGRAL-2026-11-19.zip` (`SHA-256`
  `6aed6c7e30afa859df5a1fc0dd404f00b12f7cc83352e158338c7d05c62b0316`) **não** foi tratado como
  idêntico ao repositório. Nenhum commit foi descartado, reescrito ou reordenado; 0 remotes.

### 9.2 Arquivos alterados nesta passagem e motivo

| Arquivo                                                                                                                                                                           | Motivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/supabase/validation/run_validation.ps1`                                                                                                                           | Nome do banco validado antes de SQL; prefixo obrigatório `hattz_validation_disposable_`, máx. 63 caracteres; default `hattz_validation_disposable_20261119`; aborto antes de qualquer escrita se o banco existe sem `-Recreate`; `-Recreate` exige `-ConfirmDropDatabase` nominal exato + marcador `database-ownership.json` + comentário de propriedade com o mesmo `runId`; `psql`/`PGPASSFILE` configuráveis; exit codes 2/3/4/64/65/66; `psql` sem credenciais em log. |
| `infrastructure/supabase/validation/concurrency/90_concurrency.ps1`                                                                                                               | Propagação de `-PsqlPath`/`-PgPassFile` e das variáveis `HATTZ_PSQL_PATH`/`PGPASSFILE`, com validação de arquivo e sem expor senha. Lógica de concorrência preservada.                                                                                                                                                                                                                                                                                                     |
| `infrastructure/supabase/validation/README.md`                                                                                                                                    | Documentação real do contrato de ciclo de vida, resolução de parâmetros, marcador de propriedade, exit codes e 75 casos de paridade.                                                                                                                                                                                                                                                                                                                                       |
| `packages/validation/src/publishableSnapshot.ts`                                                                                                                                  | Chaves internas `technical_id`/`technicalId`, `profile_id`/`profileId`, `is_official`/`isOfficial` e `owner` passam a ser rejeitadas recursivamente no snapshot publicável.                                                                                                                                                                                                                                                                                                |
| `infrastructure/supabase/migrations/0009_...sql` e `0014_...sql`                                                                                                                  | Mesma lista proibida no validador SQL, preservando paridade TS↔SQL (002 migrations existentes ajustadas em texto, sem nova tabela/coluna/política).                                                                                                                                                                                                                                                                                                                        |
| `infrastructure/supabase/validation/parity/build_parity.mjs`, `tests/fixtures/publishable-snapshot-parity.json`, `infrastructure/supabase/validation/sql/30_validator_parity.sql` | Quatro casos novos de chave interna; artefatos regenerados pelo gerador canônico; `--verify` confere 75 casos.                                                                                                                                                                                                                                                                                                                                                             |
| `apps/studio/src/persistence/transfer.ts`                                                                                                                                         | `parseBackup()` passou a revalidar integridade: unicidade de IDs/versões, existência do perfil dono de snapshots/rascunhos/publicações/mídia/fila, slug publicado válido/não reservado/único, no máximo uma publicação ativa por perfil, enums e timestamps. Nenhum teste removido.                                                                                                                                                                                        |
| `tests/studio/studio-corrective-persistence.test.ts`                                                                                                                              | Quatro regressões novas: restauração íntegra com publicação, duplicidade de publicação ativa, slug reservado e publicação órfana.                                                                                                                                                                                                                                                                                                                                          |
| `README.md`, `DEVELOPMENT_STATUS.md`, `docs/RELATORIO-AUDITORIA-CORRETIVA-INTEGRAL-2026-11-19.md`                                                                                 | Reconciliação de números correntes (276 testes, 75 casos) e registro desta passagem.                                                                                                                                                                                                                                                                                                                                                                                       |

`apps/studio/src/hooks/useStudioEditor.ts` foi **inspecionado integralmente e não precisou de alteração**:
`createProfile`, `selectProfile` e `reloadActive` aguardam o save em voo; `loadTokenRef` descarta cargas
atrasadas; `StaleDraftError` vira `conflict`; falhas de persistência mantêm `dirtyRef` e estado `error`.
Os testes `tests/studio/studio-corrective-ui.test.tsx` foram preservados integralmente.

### 9.3 Gates reais (Node v26.13.0, npm 11.20.0, instalação limpa)

| Comando                                                                    | Resultado                                                 | Exit |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ---- |
| `npm ci`                                                                   | 295 pacotes instalados, 307 auditados, 0 vulnerabilidades | 0    |
| `npm ls --depth=0`                                                         | árvore coerente                                           | 0    |
| `npm run typecheck`                                                        | sem erros                                                 | 0    |
| `npm run lint`                                                             | sem erros                                                 | 0    |
| `npm run format`                                                           | "All matched files use Prettier code style!"              | 0    |
| `npm test`                                                                 | **46 arquivos / 276 testes aprovados**                    | 0    |
| `npm run build`                                                            | Control, Share e Studio compilados                        | 0    |
| `node infrastructure/supabase/validation/parity/build_parity.mjs --verify` | ambos os artefatos OK, **75 casos**                       | 0    |
| `npm audit --audit-level=low`                                              | 0 vulnerabilidades                                        | 0    |
| `npm audit --omit=dev --audit-level=low`                                   | 0 vulnerabilidades                                        | 0    |
| Parser oficial PowerShell (`Parser::ParseFile`)                            | 2 arquivos, `errors=0`                                    | 0    |
| `git diff --check` (avisos LF→CRLF filtrados)                              | sem erros                                                 | 0    |

Logs das execuções: `C:\Users\Noir\AppData\Local\Temp\opencode\hattz-gates-20261119\`.

### 9.4 Segurança do ciclo de vida do PostgreSQL

Banco de aborto criado **novo** e deixado intacto: `hattz_validation_disposable_abort_test_20261119`.

| Cenário                                                        | Exit          | Efeito                                                           |
| -------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| Banco existente sem `-Recreate`                                | 65            | nenhum `-LogDir` criado, comentário `<none>`, 0 tabelas públicas |
| `-Recreate` sem `-ConfirmDropDatabase`                         | 66            | nenhuma alteração                                                |
| `-ConfirmDropDatabase` com nome divergente                     | 66            | nenhuma alteração                                                |
| Banco sem marcador de propriedade                              | 66            | recusa de exclusão                                               |
| Nome com maiúscula / sem prefixo / com `;` / com 78 caracteres | 64            | recusa antes de interpolação SQL                                 |
| `-Recreate` contra banco preexistente com prova insuficiente   | não executado | **proibido por permissão do Owner**                              |

`CREATED_LOGDIRS=0` em todos os cenários de recusa; `DB_STILL_EXISTS=True` ao final.
Nenhum banco foi apagado nesta rodada.

### 9.5 Harness de integração local

- `run_validation.ps1 -Database hattz_validation_disposable_finalrun_20261119 -LogDir ... -Runs 3 -Delay 2.0`:
  **exit 0**, **38 etapas / 0 falhas** (migrations `0001`–`0014`, reaplicação idempotente, 75 casos de
  paridade SQL, matriz de transições, `anon`/`authenticated`, grants incluindo `PUBLIC`, slug, trusted
  writer e concorrência). Log: `C:\Users\Noir\AppData\Local\Temp\opencode\hattz-validation-final\harness.log`.
- Banco recém-criado, com prefixo descartável e nome exclusivo; **sem `-Recreate`**.
- Nova tentativa sem `-Recreate` contra esse banco existente: **exit 65**, 30 tabelas públicas
  preservadas — nenhuma modificação.
- PostgreSQL 17.12 local em `127.0.0.1:55432`; nenhuma conexão remota/Supabase.

### 9.6 Achados restantes e limitações

1. **Perfis oficiais `MT7QTEVMZY` e `YGZNK6TMG8`:** não há materialização, mapeamento de campo ou
   política específica para esses IDs neste repositório. `profiles.is_official` existe, sem grant
   público e sem policy que o exponha, mas não foi inventada uma regra de imutabilidade sem
   autoridade/confirmação do Owner. Requer decisão de mapeamento (`technical_id` vs. identificador
   externo) antes de qualquer implementação.
2. **`service_role`:** a migration `0012` concede apenas o necessário, mas não revoga privilégios
   amplos que um projeto Supabase real possa conceder por padrão. Risco de implantação, não defeito
   comprovado no runtime local. Revisar grants reais no projeto autorizado.
3. **`kind` de mídia:** o enum local do IndexedDB (`avatar|banner|image|audio|cover`) difere do check SQL
   (`avatar|frame|badge|background|banner|card|widget|other`). Não é autoridade administrativa nem
   RLS; alinhar durante a integração real, sem mudança arquitetural improvisada.
4. **Não executado:** Supabase Auth/JWT/PostgREST/Storage, migrations remotas, catálogo autoritativo,
   sincronização remota, escrita administrativa do Bloco 6, deploy/domínio/HTTPS/secretos, push.
   Control permanece somente leitura; Share expõe somente dados publicados/públicos/ativos;
   `localStorage`/IndexedDB e papéis públicos `OWNER`/`VIP` não são autoridade administrativa.

**Classificação final desta entrega: PREPARADO PARA A PRÓXIMA ETAPA DE INTEGRAÇÃO; NÃO PRONTO PARA
LANÇAMENTO PÚBLICO.** Gates locais verdes não provam integração real nem prontidão de produção.
