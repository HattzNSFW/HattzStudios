import { describe, expect, it } from 'vitest';
import { resolveHubRoute } from '../../hub/routing';

describe('hub routing (single origin for Share, Studio and Control)', () => {
  it('serves the hub landing at the root', () => {
    expect(resolveHubRoute('/')).toEqual({ type: 'pass' });
    expect(resolveHubRoute('/index.html')).toEqual({ type: 'pass' });
  });

  it('routes the Studio app and normalizes the trailing slash', () => {
    expect(resolveHubRoute('/studio')).toEqual({ type: 'redirect', location: '/studio/' });
    expect(resolveHubRoute('/studio?x=1')).toEqual({
      type: 'redirect',
      location: '/studio/?x=1',
    });
    expect(resolveHubRoute('/studio/')).toEqual({
      type: 'rewrite',
      url: '/apps/studio/index.html',
    });
    expect(resolveHubRoute('/studio/src/main.tsx')).toEqual({
      type: 'rewrite',
      url: '/apps/studio/src/main.tsx',
    });
  });

  it('routes the Control app and normalizes the trailing slash', () => {
    expect(resolveHubRoute('/control')).toEqual({ type: 'redirect', location: '/control/' });
    expect(resolveHubRoute('/control/')).toEqual({
      type: 'rewrite',
      url: '/apps/control/index.html',
    });
    expect(resolveHubRoute('/control/src/main.tsx')).toEqual({
      type: 'rewrite',
      url: '/apps/control/src/main.tsx',
    });
  });

  it('sends every other path to the Share app (public slug contract)', () => {
    expect(resolveHubRoute('/alice')).toEqual({
      type: 'rewrite',
      url: '/apps/share/index.html',
    });
    expect(resolveHubRoute('/alice?ref=1')).toEqual({
      type: 'rewrite',
      url: '/apps/share/index.html?ref=1',
    });
    // Sub-routes are invalid for the Share router, but they must still load the Share app so it
    // can render its own not-found state instead of a server error.
    expect(resolveHubRoute('/alice/extra')).toEqual({
      type: 'rewrite',
      url: '/apps/share/index.html',
    });
  });

  it('does not swallow ordinary Share slugs that begin with favicon', () => {
    expect(resolveHubRoute('/favicon-profile')).toEqual({
      type: 'rewrite',
      url: '/apps/share/index.html',
    });
    expect(resolveHubRoute('/favicon.ico')).toEqual({ type: 'pass' });
  });

  it('passes infrastructure requests and asset files straight through', () => {
    expect(resolveHubRoute('/apps/share/src/main.tsx')).toEqual({ type: 'pass' });
    expect(resolveHubRoute('/hub/main.tsx')).toEqual({ type: 'pass' });
    expect(resolveHubRoute('/@vite/client')).toEqual({ type: 'pass' });
    expect(resolveHubRoute('/node_modules/.vite/deps/react.js?v=1')).toEqual({ type: 'pass' });
    expect(resolveHubRoute('/favicon.ico')).toEqual({ type: 'pass' });
    expect(resolveHubRoute('/share-data/index.json')).toEqual({ type: 'pass' });
    // O robots.txt é um arquivo estático válido (não deve cair no fallback HTML do Share).
    expect(resolveHubRoute('/robots.txt')).toEqual({ type: 'pass' });
  });
});
