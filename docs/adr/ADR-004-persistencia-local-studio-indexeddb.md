# ADR-004 — Persistência local do Studio (IndexedDB/Dexie) e migrações

- **Status:** Aceito (Fase 2A) — revisado no hardening/auditoria pré-2B
- **Data:** 2026-11-16

## Contexto

O Studio deve funcionar localmente sem conta ou conexão, com rascunhos, versionamento local e preparação para sincronização/publicação futura, mantendo isolamento entre dados locais e publicados.

## Decisão

- Adotar **Dexie 4.3.0** (fixado) para acesso estruturado ao IndexedDB no Studio.
- Definir banco local `hattz_studio` com versionamento de schema e migrações incrementais (v1 base: perfis locais/rascunhos, snapshots de rascunho, fila de operações pendentes, metadados de versão/sync).
- Manter dados locais exclusivamente no dispositivo; nenhuma conexão remota nesta fase.
- Usar IDs técnicos locais permanentes e rastrear `baseVersion`/estado para suportar detecção de conflitos e publicação futura (sem sobrescrita silenciosa).
- Incluir testes de persistência/migração e falhas com `fake-indexeddb` em ambiente de testes.
- Validar conteúdo contra contrato publicável (`@hattz/validation`) antes de qualquer transição/publicação futura (integração de fluxo reservada a fases autorizadas).

## Consequências

- Edição local resiliente e independente de rede/conta.
- Evolução do schema local exigirá novas versões Dexie com funções de upgrade testadas.
- Integração real de sync/publicação remota permanece para fases autorizadas posteriores.

## Auditoria (pré-2B)

- Cenários de falha cobertos por testes automatizados: duplicidade de `operationId` (falha explícita, sem sucesso silencioso), meta de schema ausente/stale (`isReady=false`), operação com DB fechado (falha explícita).
- Limites entre Studio (local) e Share/Control (publicado/admin) preservados por contratos/boundaries; sem implementação de fluxos da Fase 2B.
