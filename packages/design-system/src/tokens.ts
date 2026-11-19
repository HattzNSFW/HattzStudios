export const colorTokens = {
  black: '#050507',
  graphite900: '#0b0c10',
  graphite800: '#12141a',
  graphite700: '#1a1d24',
  silver100: '#f2f4f7',
  silver300: '#c7ccd6',
  silver500: '#9aa3b2',
  silver700: '#6b7280',
  purpleSoft300: '#c7b8ff',
  purpleSoft500: '#a78bfa',
  purpleSoft700: '#7c5cff',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
} as const;

export const liquidGlassTokens = {
  surfaceSoft: 'rgba(18, 20, 26, 0.42)',
  surface: 'rgba(18, 20, 26, 0.55)',
  surfaceStrong: 'rgba(18, 20, 26, 0.72)',
  border: 'rgba(199, 204, 214, 0.18)',
  borderStrong: 'rgba(199, 204, 214, 0.3)',
  borderHighlight: 'rgba(242, 244, 247, 0.28)',
  highlight: 'rgba(167, 139, 250, 0.22)',
  reflection: 'rgba(242, 244, 247, 0.08)',
  shadowSoft: '0 6px 20px rgba(0, 0, 0, 0.32)',
  shadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
  shadowLifted: '0 18px 60px rgba(0, 0, 0, 0.55)',
  blur: '16px',
  saturation: '140%',
  radiusSm: '10px',
  radiusMd: '14px',
  radiusLg: '20px',
  radiusPill: '999px',
} as const;

export const typographyTokens = {
  fontSans:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  sizeXs: '0.75rem',
  sizeSm: '0.875rem',
  sizeMd: '1rem',
  sizeLg: '1.125rem',
  sizeXl: '1.5rem',
  weightRegular: 400,
  weightMedium: 500,
  weightSemibold: 600,
} as const;

export const spacingTokens = {
  xxs: '0.25rem',
  xs: '0.5rem',
  sm: '0.75rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
} as const;

export const motionTokens = {
  fast: '120ms',
  normal: '220ms',
  slow: '360ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

export type ColorTokens = typeof colorTokens;
export type LiquidGlassTokens = typeof liquidGlassTokens;
