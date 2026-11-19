export type HattzAppId = 'share' | 'studio' | 'control';

export const HATTZ_APPS: readonly HattzAppId[] = ['share', 'studio', 'control'] as const;

export const SYSTEM_VERSION = '0.1.0-foundation' as const;

export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${String(value)}`);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createLocalId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'id';
  return `${safePrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Slugs que colidem com rotas internas do hub local (`hub/routing.ts`): um perfil publicado com
 * um destes endereços seria inalcançável porque o caminho é consumido pelo próprio hub.
 *
 * Não substitui a futura política completa de slugs reservados do Owner; protege apenas os
 * caminhos já ocupados pelo aplicativo (`/studio`, `/control`, `/hub`, `/apps`, `/share-data`,
 * `/favicon`).
 */
export const RESERVED_PUBLIC_SLUGS = [
  'studio',
  'control',
  'hub',
  'apps',
  'share-data',
  'favicon',
] as const;

const RESERVED_PUBLIC_SLUG_SET: ReadonlySet<string> = new Set(RESERVED_PUBLIC_SLUGS);

export function isReservedPublicSlug(slug: string): boolean {
  return RESERVED_PUBLIC_SLUG_SET.has(slug.trim().toLowerCase());
}
