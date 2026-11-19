/**
 * Reexporta o schema local-first compartilhado (`@hattz/local-store`).
 *
 * O schema foi extraído para o pacote compartilhado para que o Studio (escritor) e o Share
 * (leitor) usem exatamente a mesma base IndexedDB quando rodam na mesma origem (o hub local).
 * Este módulo mantém o caminho histórico `apps/studio/src/persistence/db` funcionando para todo
 * o código e os testes existentes.
 */
export * from '@hattz/local-store';
