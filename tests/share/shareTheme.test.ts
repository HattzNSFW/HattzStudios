import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_THEME,
  fontStack,
  parseShareEffects,
  parseShareTheme,
  themeToCssVars,
} from '@hattz/profile-view';

describe('Share theme parsing (safe subset of the extensible snapshot theme)', () => {
  it('returns defaults for missing/invalid input', () => {
    expect(parseShareTheme(undefined)).toEqual(DEFAULT_SHARE_THEME);
    expect(parseShareTheme('nope')).toEqual(DEFAULT_SHARE_THEME);
  });

  it('accepts only safe hex colors and drops unsafe values', () => {
    const theme = parseShareTheme({
      accent: '#a78bfa',
      background: 'red',
      surface: 'javascript:alert(1)',
      text: '#F2F4F7',
    });
    expect(theme.accent).toBe('#a78bfa');
    expect(theme.background).toBeNull();
    expect(theme.surface).toBeNull();
    expect(theme.text).toBe('#F2F4F7');
  });

  it('validates font choices, background style, radius and avatar frame', () => {
    const theme = parseShareTheme({
      headingFont: 'serif',
      bodyFont: 'comic',
      backgroundStyle: 'aurora',
      radius: 999,
      avatarFrame: 'frame-purple',
    });
    expect(theme.headingFont).toBe('serif');
    expect(theme.bodyFont).toBe('sans');
    expect(theme.backgroundStyle).toBe('aurora');
    expect(theme.radius).toBe(40);

    expect(parseShareTheme({ avatarFrame: 'bad frame!' }).avatarFrame).toBeNull();
    expect(parseShareTheme({ radius: -5 }).radius).toBeNull();
  });

  it('parses effects strictly as booleans', () => {
    expect(parseShareEffects({ grain: true, glow: 'yes' })).toEqual({ grain: true, glow: false });
    expect(parseShareEffects(null)).toEqual({ grain: false, glow: false });
  });

  it('exposes font stacks and CSS variables', () => {
    expect(fontStack('mono')).toContain('monospace');
    const vars = themeToCssVars(parseShareTheme({ accent: '#a78bfa', radius: 12 }));
    expect(vars['--share-accent']).toBe('#a78bfa');
    expect(vars['--share-radius']).toBe('12px');
    expect(vars['--share-font-heading']).toBeDefined();
  });
});
