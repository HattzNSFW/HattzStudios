// Tema público do perfil.
// O contrato de snapshot permite `theme`/`effects` como objetos extensíveis (`Record<string, unknown>`).
// Aqui interpretamos APENAS chaves conhecidas e valores seguros; qualquer coisa fora do esperado é
// descartada (fail-closed) para nunca injetar CSS arbitrário a partir do conteúdo publicado.

export type ShareFontChoice = 'sans' | 'serif' | 'mono';
export type ShareBackgroundStyle = 'solid' | 'gradient' | 'aurora';

export interface ShareTheme {
  accent: string | null;
  background: string | null;
  surface: string | null;
  text: string | null;
  headingFont: ShareFontChoice;
  bodyFont: ShareFontChoice;
  radius: number | null;
  backgroundStyle: ShareBackgroundStyle;
  /**
   * Chave de moldura de avatar (interino).
   * A fonte autoritativa de molduras é o domínio de colecionáveis (`frames_catalog`, por role);
   * a estratégia de exposição pública ainda é pendente. Até lá, reconhecemos `theme.avatarFrame`
   * como canal extensível do snapshot e aplicamos o estilo correspondente.
   */
  avatarFrame: string | null;
}

export interface ShareEffects {
  grain: boolean;
  glow: boolean;
}

export const DEFAULT_SHARE_THEME: ShareTheme = {
  accent: null,
  background: null,
  surface: null,
  text: null,
  headingFont: 'sans',
  bodyFont: 'sans',
  radius: null,
  backgroundStyle: 'gradient',
  avatarFrame: null,
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FRAME_KEY = /^[a-zA-Z0-9_-]{1,64}$/;
const FONT_CHOICES: readonly ShareFontChoice[] = ['sans', 'serif', 'mono'];
const BACKGROUND_STYLES: readonly ShareBackgroundStyle[] = ['solid', 'gradient', 'aurora'];

const FONT_STACKS: Record<ShareFontChoice, string> = {
  sans: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', ui-serif, serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readColor(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}

function readFont(source: Record<string, unknown>, key: string): ShareFontChoice {
  const value = source[key];
  return typeof value === 'string' && (FONT_CHOICES as readonly string[]).includes(value)
    ? (value as ShareFontChoice)
    : 'sans';
}

function readFrame(source: Record<string, unknown>): string | null {
  const value = source.avatarFrame;
  return typeof value === 'string' && FRAME_KEY.test(value) ? value : null;
}

export function parseShareTheme(input: unknown): ShareTheme {
  const source = asRecord(input);
  if (!source) return { ...DEFAULT_SHARE_THEME };

  const radiusValue = source.radius;
  const radius =
    typeof radiusValue === 'number' && Number.isFinite(radiusValue) && radiusValue >= 0
      ? Math.min(radiusValue, 40)
      : null;

  const styleValue = source.backgroundStyle;
  const backgroundStyle =
    typeof styleValue === 'string' && (BACKGROUND_STYLES as readonly string[]).includes(styleValue)
      ? (styleValue as ShareBackgroundStyle)
      : DEFAULT_SHARE_THEME.backgroundStyle;

  return {
    accent: readColor(source, 'accent'),
    background: readColor(source, 'background'),
    surface: readColor(source, 'surface'),
    text: readColor(source, 'text'),
    headingFont: readFont(source, 'headingFont'),
    bodyFont: readFont(source, 'bodyFont'),
    radius,
    backgroundStyle,
    avatarFrame: readFrame(source),
  };
}

export function parseShareEffects(input: unknown): ShareEffects {
  const source = asRecord(input);
  return {
    grain: source?.grain === true,
    glow: source?.glow === true,
  };
}

export function fontStack(choice: ShareFontChoice): string {
  return FONT_STACKS[choice];
}

/** Converte o tema interpretado em custom properties CSS seguras. */
export function themeToCssVars(theme: ShareTheme): Record<string, string> {
  const vars: Record<string, string> = {
    '--share-font-heading': fontStack(theme.headingFont),
    '--share-font-body': fontStack(theme.bodyFont),
    '--share-background-style': theme.backgroundStyle,
  };
  if (theme.accent) vars['--share-accent'] = theme.accent;
  if (theme.background) vars['--share-background'] = theme.background;
  if (theme.surface) vars['--share-surface'] = theme.surface;
  if (theme.text) vars['--share-text'] = theme.text;
  if (theme.radius !== null) vars['--share-radius'] = `${theme.radius}px`;
  return vars;
}
