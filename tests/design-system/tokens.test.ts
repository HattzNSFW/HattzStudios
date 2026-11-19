import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liquidGlassTokens } from '@hattz/design-system';

/**
 * Guarda contra divergência dos tokens de Liquid Glass.
 *
 * A identidade visual depende de UMA fonte de verdade para transparências, bordas, reflexos,
 * sombras, blur e raios. Este teste garante que o CSS compartilhado declara todos os tokens e que
 * os valores expostos em TypeScript continuam idênticos aos do CSS (nenhuma cópia divergente).
 */
const tokensCss = readFileSync(
  resolve(process.cwd(), 'packages/design-system/src/tokens.css'),
  'utf8',
);

describe('Liquid Glass tokens (single source of truth)', () => {
  it('declares every consolidated glass token', () => {
    const expectedVars = [
      '--hattz-glass-surface-soft',
      '--hattz-glass-surface',
      '--hattz-glass-surface-strong',
      '--hattz-glass-border',
      '--hattz-glass-border-strong',
      '--hattz-glass-border-highlight',
      '--hattz-glass-highlight',
      '--hattz-glass-reflection',
      '--hattz-glass-shadow-soft',
      '--hattz-glass-shadow',
      '--hattz-glass-shadow-lifted',
      '--hattz-glass-blur',
      '--hattz-glass-saturate',
      '--hattz-glass-background',
      '--hattz-glass-shadow-stack',
      '--hattz-radius-sm',
      '--hattz-radius-md',
      '--hattz-radius-lg',
      '--hattz-radius-pill',
    ];
    for (const name of expectedVars) {
      expect(tokensCss, `missing token ${name}`).toContain(`${name}:`);
    }
  });

  it('keeps the TypeScript tokens identical to the CSS values', () => {
    for (const [key, value] of Object.entries(liquidGlassTokens)) {
      expect(tokensCss, `token ${key} (${value}) diverged from tokens.css`).toContain(value);
    }
  });

  it('provides a legible opaque fallback when backdrop-filter is unsupported', () => {
    expect(tokensCss).toContain('@supports not ((backdrop-filter');
    // O fallback precisa ESCURECER o vidro (mais opaco), não clarear.
    expect(tokensCss).toMatch(/--hattz-glass-surface:\s*rgba\(15, 17, 22, 0\.9\)/);
  });

  it('uses a real backdrop-filter blur in the reusable glass surface', () => {
    expect(tokensCss).toContain('backdrop-filter: blur(var(--hattz-glass-blur))');
    expect(tokensCss).toContain('-webkit-backdrop-filter: blur(var(--hattz-glass-blur))');
  });
});
