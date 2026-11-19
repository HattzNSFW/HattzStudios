# Hättz 2.0

Monorepo do ecossistema **Share**, **Studio** e **Control**. Fase 2A classificada como **CONCLUÍDA — PREPARAÇÃO TÉCNICA LOCAL**: as migrations `0001`–`0013` e o comportamento RLS/SQL foram validados em runtime numa instância **PostgreSQL 17.12 local e descartável**; a validação no **Supabase real** (Auth/JWT/PostgREST/Storage) permanece pendente de ambiente autorizado. Nenhuma Fase 2B foi iniciada.

**Produto em desenvolvimento por entregas funcionais.**

- **Entrega 1 — Share funcional** (2026-11-18): o Share carrega e renderiza perfis **publicados** por rota `/<slug>` (seções, blocos, badges, molduras, tema, links, player de música) com estados de carregamento/erro/não encontrado/despublicado, responsivo e acessível. A fonte de dados desta entrega é um **manifesto estático local** com o **mesmo formato da view pública** — **não é o Supabase e não são dados reais**. Ver `docs/RELATORIO-ENTREGA-1-SHARE-2026-11-18.md`.
- **Entrega 2 — Studio funcional** (2026-11-18): o Studio permite **criar, editar e salvar perfis locais** (nome, bio, avatar/banner, tema/cores/fontes, seções e os oito blocos aprovados, visibilidade e ordem) com **prévia ao vivo** que reutiliza o **mesmo renderizador e pipeline de validação do Share** (`@hattz/profile-view`) e **autosave local** em IndexedDB (Dexie v2) com concorrência otimista (sem sobrescrita silenciosa) e rascunhos que **sobrevivem a reload**. **Não publica automaticamente** e **não usa Supabase**. Ver `docs/RELATORIO-ENTREGA-2-STUDIO-2026-11-18.md`.
- **Entrega 3 — Publicação local** (2026-11-18): o Studio ganha um fluxo **explícito** de **publicar/despublicar** que cria **snapshots imutáveis e versionados** (`v1`, `v2`, …) em IndexedDB (Dexie v3, tabela `publications`), com **histórico de versões**, **versão publicada atual**, **validação antes de persistir** e uma **prévia "publicada"** que lê **exclusivamente** o snapshot. **Publicação local ≠ publicação pública**: nada é enviado à internet e o perfil **não** fica publicamente acessível (a UI deixa isso explícito). **Não usa Supabase/Storage** e **não publica automaticamente**. Ver `docs/RELATORIO-ENTREGA-3-PUBLICACAO-LOCAL-2026-11-18.md`.
- **Entrega 4 — Integração local (Share ↔ Studio ↔ Control)** (2026-11-18): um **hub de desenvolvimento** na raiz (`npm run dev:hub`, `http://localhost:5180/`) serve as **três apps na mesma origem**, tornando o IndexedDB compartilhado possível **sem Supabase/backend**. O **Share lê os snapshots que o Studio publicou** (`packages/local-store` + `LocalPublicationSource`): encontra perfis publicados por slug, resolve mídias locais e renderiza o snapshot publicado — **nunca** lê rascunhos, **nunca** expõe campos internos e **nunca** usa dados de demonstração em runtime. O hub lista os **perfis realmente publicados** e injeta uma navegação Hättz (Hub/Studio/Control). Fluxo completo verificado em navegador, inclusive persistência após reload e **reinício do servidor**. Ver `docs/RELATORIO-ENTREGA-4-INTEGRACAO-LOCAL-2026-11-18.md`.
- **Revisão conjunta** (2026-11-18): incorporadas **todas** as correções da cópia revisada do Owner (slug reservado/duplicado/inválido na publicação, guarda de propriedade de mídia, roteamento de favicon do hub — com testes de regressão), além de uma **adaptação** para slugs curtos na prévia. Consolidada a identidade **Liquid Glass** (tokens únicos de vidro escuro semitransparente, `backdrop-filter: blur()` real, bordas finas, reflexos roxo-sutil/prata, fallback opaco legível e reduced-motion) em Share, Studio, Control, hub e navegação. Reescrito o **player de música** (formato **expandido** e **mini flutuante**): waveform integrada ao progresso real, seek acessível, play/pause reais, anterior/próxima em playlists, volume/mudo, estados de carregando/erro/fim, **sem autoplay** e **sem favorito** (o modelo não tem o campo). Ver `docs/RELATORIO-REVISAO-CONJUNTA-2026-11-18.md`.
- **Validação final e fechamento** (2026-11-19): ressalvas da B4.2 corrigidas (Control permanece **somente leitura**), lacunas dos oito blocos implementadas, hardening do Share, aba **Dados** no Studio (export/import/backup/restore, histórico, conectividade, `pendingSyncOps`) e **slug publicado** passando a usar o endereço rascunho (com teste de regressão). `robots.txt` válido no hub e no build do Share (Lighthouse **1/1/1**). **249 testes**, typecheck/lint/Prettier/builds/**0 vulnerabilidades** aprovados; validação SQL/RLS em PostgreSQL local com **36 etapas / 0 falhas** e inspeção em navegador com **0 erros de console**. Ver `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md`.

## Requisitos

- Node.js **24 LTS** (referência para desenvolvimento/CI)
- npm **>= 11**

## Estrutura

- `apps/share` — visualização pública de perfis (Share funcional: rota por slug, dados publicados, tema, mídia, estados); na integração local, lê os snapshots **publicados no Studio** pela base local compartilhada
- `apps/studio` — editor local-first **funcional**: criar/editar/salvar perfis (nome, bio, mídia, tema, seções, blocos), prévia ao vivo e autosave em IndexedDB (Dexie v3); **publicação local** (snapshots imutáveis versionados, histórico, despublicar e prévia publicada); sem publicação pública
- `apps/control` — painel administrativo privado (base)
- `hub/` — landing e navegação do ambiente local integrado (mesma origem)
- `vite.hub.config.ts` — servidor de desenvolvimento do hub (`http://localhost:5180/`) que serve as três apps na mesma origem
- `packages/*` — core, contracts, design-system, permissions, validation, shared-utils, **profile-view** (renderizador compartilhado Share/Studio), **local-store** (schema IndexedDB compartilhado + leituras públicas)
- `docs/adr` — decisões arquiteturais
- `docs/architecture` — documentação técnica de fundação

## Scripts (raiz)

- `npm run dev:hub` — ambiente local integrado (Share + Studio + Control na mesma origem, `http://localhost:5180/`)
- `npm run dev:share` / `dev:studio` / `dev:control` — dev servers standalone (origens separadas; sem base compartilhada)
- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `npm run test`
- `npm run build`

## Status

**Preparado para lançamento, não lançado.** A classificação formal, os números executados, as limitações e as pendências estão em `DEVELOPMENT_STATUS.md`; o relatório final com os exatos 22 itens, os hashes dos commits locais e a localização do ZIP está em `docs/RELATORIO-FINAL-22-ITENS-2026-11-19.md`. Nenhum push, deploy ou publicação remota foi realizado.
