# ADR-004 — Persistência local do Studio (IndexedDB/Dexie) e migrações

- **Status:** Aceito (Fase 2A) — revisado no hardening, auditoria, fechamento de pendências pré-2B e correções de concorrência/semântica de persistência
- **Data:** 2026-11-16 (revisão de correções: 2026-11-17)

## Contexto

O Studio deve funcionar localmente sem conta ou conexão, com rascunhos, versionamento local e preparação para sincronização/publicação futura, mantendo isolamento entre dados locais e publicados.

## Decisão

- Adotar **Dexie 4.3.0** (fixado) para acesso estruturado ao IndexedDB no Studio.
- Definir banco local `hattz_studio` com versionamento de schema e migrações incrementais (v1 base: perfis locais/rascunhos, snapshots de rascunho, fila de operações pendentes, metadados de versão/sync).
- Manter dados locais exclusivamente no dispositivo; nenhuma conexão remota nesta fase.
- Usar IDs técnicos locais permanentes e rastrear `baseVersion`/estado para suportar detecção de conflitos e publicação futura (sem sobrescrita silenciosa).
- Incluir testes de persistência/migração e falhas com `fake-indexeddb` em ambiente de testes (**dependência de desenvolvimento declarada explicitamente** em `package.json`, versão `6.2.5` — antes era importada sem declaração).
- Validar conteúdo contra contrato publicável (`@hattz/validation`) antes de qualquer transição/publicação futura (integração de fluxo reservada a fases autorizadas). O contrato de snapshot publicável foi endurecido (limites explícitos e estruturas controladas/extensíveis) mantendo compatibilidade de schema para evolução do Studio.
- **Semântica de falha explícita (sem sobrescrita silenciosa):** criação de perfil local (`createLocalDraftProfile`) e enfileiramento de operação (`enqueuePendingSyncOperation`) usam `add` (e não `put`), de modo que colisão de `technicalId`/`operationId` **falhe explicitamente** em vez de substituir silenciosamente um registro existente (preservando payload/estado/`attemptCount`/`lastError`).
- **Serialização de leitura-modificação-escrita:** `saveDraftSnapshot` lê `contentVersion` e incrementa a versão **dentro da mesma transação `rw`** do Dexie, evitando que duas gravações concorrentes leiam a mesma versão e produzam snapshots de versão duplicada / update perdido.

## Consequências

- Edição local resiliente e independente de rede/conta.
- Evolução do schema local exigirá novas versões Dexie com funções de upgrade testadas.
- Integração real de sync/publicação remota permanece para fases autorizadas posteriores.

## Auditoria/fechamento (pré-2B)

- Cenários de falha cobertos por testes automatizados: duplicidade de `operationId` (falha explícita, sem sucesso silencioso), meta de schema ausente/stale (`isReady=false`), operação com DB fechado (falha explícita).
- Limites entre Studio (local) e Share/Control (publicado/admin) preservados por contratos/boundaries; sem implementação de fluxos da Fase 2B.

## Correções (revisão 2026-11-17)

- `repository.ts`: `createLocalDraftProfile`/`enqueuePendingSyncOperation` passam a usar `add` (falha explícita em duplicidade); `saveDraftSnapshot` lê/incrementa `contentVersion` dentro de transação `rw` serializada (elimina corrida de leitura-modificação-escrita).
- Contratos: `ID_PATTERN` alinhado ao SQL (`{1,128}`, revivendo o limite `maxIdLength`); guarda de ciclo/profundidade em `pushForbiddenKeyIssues` (falha fechada); `validateHttpsUrl` restrito a `https`.
- Dependências/tooling: `dexie` fixado em `4.3.0`; `fake-indexeddb` declarado como devDependency; `tsconfig.tests.json` adicionado e incluído no `typecheck`; `vitest.config.ts` com `resolve.dedupe: ['react','react-dom']`.
- Testes: `tests/authorization/authorization.test.ts` deixou de ser tautológico (asserção real de autorização).

## Nota da rodada 6 (auditoria de aplicação)

- A auditoria read-only da rodada 6 confirmou que a biblioteca de persistência local do Studio (Dexie) está **implementada e testada**, porém **não ligada à UI** (sem publish/unpublish, sem wiring de validação, sem drenagem de sync, sem editor). Nenhuma alteração de código de app foi feita nesta rodada. O wiring dos fluxos permanece para fases autorizadas (Fase 2B, não iniciada).
