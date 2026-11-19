import { buildControlSnapshot, type ControlSnapshot } from './controlModel';

/**
 * Fonte de dados do Control — somente leitura.
 *
 * Hoje os dados são os catálogos declarativos locais (`@hattz/core` + `@hattz/permissions`).
 * A interface assíncrona existe para que loading/erro sejam estados reais e para receber uma fonte
 * confiável futura sem alterar a UI. Nenhuma implementação local cria sessão administrativa,
 * acessa credenciais ou escreve em repositórios.
 */
export interface ControlDataSource {
  loadSnapshot(): Promise<ControlSnapshot>;
}

export class LocalControlDataSource implements ControlDataSource {
  async loadSnapshot(): Promise<ControlSnapshot> {
    return buildControlSnapshot();
  }
}
