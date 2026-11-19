/**
 * Auditoria estática da fronteira somente leitura do Control (B4.2).
 *
 * Complementa os testes de UI: aqui verificamos que o código do app não contém caminhos de escrita
 * administrativa, não depende de repositórios mutáveis e não cria sessões administrativas locais.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AdminAuthorizationError,
  assertAdminSession,
  canAssignRole,
  canGrantBenefit,
  hasAdminSession,
  resolveContextBenefits,
  type AuthorizationContext,
} from '@hattz/permissions';

const ROOT = process.cwd();

function controlSources(): readonly string[] {
  const dir = resolve(ROOT, 'apps/control/src');
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name)))
    .map((entry) => readFileSync(resolve(dir, entry.name), 'utf8'));
}

describe('Control somente leitura — auditoria de fronteira', () => {
  it('não contém chamadas de mutação, credenciais ou sessões administrativas', () => {
    const sources = controlSources();
    expect(sources.length).toBeGreaterThan(0);

    const forbidden = [
      'grantBadge',
      'grantFrame',
      'revokeBadge',
      'revokeFrame',
      'equipBadge',
      'equipFrame',
      'recordCollectionProgress',
      'getStudioDb',
      'Dexie',
      'indexedDB',
      'userBadges',
      'userFrames',
      'userCollectionProgress',
      'adminAccounts',
      'adminSession',
      'assertAdminSession',
      'createTrustedOwnershipAuthority',
      'ownershipProof',
      'seedDemoCollectibles',
      'publishWorkingDraft',
      'unpublishProfile',
    ];

    for (const source of sources) {
      for (const token of forbidden) {
        expect(source).not.toContain(token);
      }
      expect(source).not.toMatch(/from ['"]@hattz\/local-store/);
      expect(source).not.toMatch(/from ['"]dexie['"]/);
    }
  });

  it('não declara dependência de repositórios locais mutáveis', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'apps/control/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@hattz/local-store');
  });

  it('preserva o schema local sem tabelas administrativas e a API pública sem admin session', () => {
    const db = readFileSync(resolve(ROOT, 'packages/local-store/src/db.ts'), 'utf8');
    expect(db).toContain('STUDIO_DB_VERSION = 4');
    expect(db).not.toContain('adminAccounts');
    expect(db).not.toContain('adminSession');

    const publicIndex = readFileSync(resolve(ROOT, 'packages/local-store/src/index.ts'), 'utf8');
    expect(publicIndex).not.toMatch(/admin/i);
  });

  it('mantém assertAdminSession fail-closed', () => {
    const authorization = readFileSync(
      resolve(ROOT, 'packages/permissions/src/authorization.ts'),
      'utf8',
    );
    expect(authorization).toContain('throw new AdminAuthorizationError()');
  });

  it('não concede autoridade administrativa ao cargo público Owner', () => {
    const ctx: AuthorizationContext = {
      role: 'owner',
      profileTechnicalId: 'prof_owner',
      adminSession: null,
    };

    expect(hasAdminSession(ctx)).toBe(false);
    expect(() => assertAdminSession(ctx)).toThrow(AdminAuthorizationError);
    expect(canGrantBenefit(ctx, 'admin.control_access').allowed).toBe(false);
    expect(canAssignRole(ctx, 'owner').allowed).toBe(false);
    expect(resolveContextBenefits(ctx)).not.toContain('admin.control_access');
  });
});
