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
