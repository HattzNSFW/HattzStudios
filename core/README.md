# Hättz Core

Camada compartilhada do ecossistema, carregada pelo Share, Studio e Control.

- `design-tokens.css`: tokens de cores, tipografia, espaçamento, superfícies, raios e movimento.
- `hattz-core.js`: contrato comum de API base, validação de código público e leitura/escrita dos slots locais `perfil-1` e `perfil-2`.
- `local-history.js`: desfazer/refazer em memória e rascunhos em `sessionStorage`, sem rede e sem mídia binária.

O Core não é um site separado. Não deve duplicar a lógica de domínio do Worker nem armazenar segredos. A compatibilidade do armazenamento local é requisito: não alterar os nomes das chaves nem a versão do IndexedDB sem migração compatível e backup.
