# ADR-004 — Persistência local do Studio (IndexedDB/Dexie) e migrações

- **Status:** Aceito (Fase 2A)
- **Data:** 2026-11-16

## Contexto

O Studio deve funcionar localmente sem conta ou conexão, com rascunhos, versionamento local e preparação para sincronização/publicação futura, mantendo isolamento entre dados locais e publicados.

## Decisão

- Adotar **Dexie 4.3.0** (fixado) para acesso estruturado ao IndexedDB no Studio.
- Definir banco local `hattz_studio` com versionamento de schema e migrações incrementais (v1 base: perfis locais/rascunhos, seções/blocos, presets locais, fila de operações pendentes, metadados de versão/sync).
- Manter dados locais exclusivamente no dispositivo; nenhuma conexão remota nesta fase.
- Usar IDs técnicos locais permanentes e rastrear `baseVersion`/estado para suportar detecção de conflitos e publicação futura (sem sobrescrita silenciosa).
- Incluir testes de persistência/migração com `fake-indexeddb` em ambiente de testes.

## Consequências

- Edição local resiliente e independente de rede/conta.
- Evolução do schema local exigirá novas versões Dexie com funções de upgrade testadas.
- Integração real de sync/publicação remota permanece para fases autorizadas posteriores.
