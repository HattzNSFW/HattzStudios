/**
 * Fronteira de injeção da autoridade de posse — INTERNA.
 *
 * Este módulo NÃO é reexportado por `./index`. Consumidores que importam `@hattz/local-store` (a
 * interface pública de produção) NÃO alcançam a fábrica e, portanto, NÃO conseguem criar uma
 * `TrustedOwnershipAuthority`. A injeção fica isolada: apenas código confiável (a futura
 * sincronização) e o harness de testes acessam este módulo, via o subcaminho de teste
 * `@hattz/local-store/testing` (declarado somente na configuração de testes, ausente do
 * `exports` do pacote).
 *
 * Defesa em profundidade: além da marca opaca (compile-time), as autoridades criadas aqui são
 * registradas em um `WeakSet`. `isTrustedOwnershipAuthority` recusa qualquer objeto que não tenha
 * sido produzido por `createTrustedOwnershipAuthority` — inclusive um objeto forjado com `as`.
 * Isso NÃO protege contra a manipulação do próprio JavaScript em execução (fora do alcance de
 * qualquer app cliente); protege a API pública contra substituição indevida do verificador.
 */

import type { OwnershipAuthorityVerifier, TrustedOwnershipAuthority } from '@hattz/core';

/** Registro de autoridades legítimas (identidade de objeto). */
const registeredAuthorities = new WeakSet<object>();

/**
 * Cria uma `TrustedOwnershipAuthority` a partir de um verificador confiável.
 *
 * Uso restrito a código confiável e aos testes. NÃO faz parte da API pública de produção.
 */
export function createTrustedOwnershipAuthority(
  verify: OwnershipAuthorityVerifier,
): TrustedOwnershipAuthority {
  // A marca é apenas de tipo (o símbolo não é exportado); a fábrica usa um cast interno.
  const authority = { verify } as TrustedOwnershipAuthority;
  registeredAuthorities.add(authority);
  return authority;
}

/** Só autoridades criadas pela fábrica interna são reconhecidas (fail-closed). */
export function isTrustedOwnershipAuthority(value: unknown): value is TrustedOwnershipAuthority {
  return typeof value === 'object' && value !== null && registeredAuthorities.has(value);
}
