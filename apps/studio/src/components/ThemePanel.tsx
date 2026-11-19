import { withTheme, type StudioDraft } from '../editor';
import { ColorInput, SelectInput, Toggle } from './fields';

interface ThemePanelProps {
  draft: StudioDraft;
  disabled: boolean;
  onUpdate: (updater: (draft: StudioDraft) => StudioDraft) => void;
}

const FONT_OPTIONS = [
  { value: 'sans', label: 'Sem serifa' },
  { value: 'serif', label: 'Com serifa' },
  { value: 'mono', label: 'Monoespaçada' },
] as const;

const BACKGROUND_OPTIONS = [
  { value: 'gradient', label: 'Gradiente' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'solid', label: 'Sólido' },
] as const;

const RADIUS_OPTIONS = [
  { value: '', label: 'Padrão' },
  { value: '0', label: 'Quadrado (0)' },
  { value: '8', label: 'Suave (8)' },
  { value: '14', label: 'Médio (14)' },
  { value: '20', label: 'Arredondado (20)' },
  { value: '28', label: 'Muito arredondado (28)' },
  { value: '40', label: 'Cápsula (40)' },
] as const;

const FRAME_OPTIONS = [
  { value: '', label: 'Nenhuma' },
  { value: 'frame-silver', label: 'Prata' },
  { value: 'frame-purple', label: 'Roxo' },
  { value: 'frame-gold', label: 'Dourado' },
  { value: 'frame-emerald', label: 'Esmeralda' },
] as const;

export function ThemePanel({ draft, disabled, onUpdate }: ThemePanelProps) {
  const theme = draft.theme;
  return (
    <div className="studio-panel">
      <h2 className="studio-panel__title">Tema</h2>

      <div className="studio-grid-2">
        <ColorInput
          id="studio-accent"
          label="Cor de destaque"
          value={theme.accent}
          disabled={disabled}
          onChange={(value) => onUpdate((current) => withTheme(current, { accent: value }))}
        />
        <ColorInput
          id="studio-background"
          label="Fundo"
          value={theme.background}
          disabled={disabled}
          onChange={(value) => onUpdate((current) => withTheme(current, { background: value }))}
        />
        <ColorInput
          id="studio-surface"
          label="Superfície"
          value={theme.surface}
          disabled={disabled}
          onChange={(value) => onUpdate((current) => withTheme(current, { surface: value }))}
        />
        <ColorInput
          id="studio-text-color"
          label="Texto"
          value={theme.text}
          disabled={disabled}
          onChange={(value) => onUpdate((current) => withTheme(current, { text: value }))}
        />
      </div>

      <div className="studio-grid-2">
        <SelectInput
          id="studio-heading-font"
          label="Fonte dos títulos"
          value={theme.headingFont}
          options={FONT_OPTIONS}
          disabled={disabled}
          onChange={(value) =>
            onUpdate((current) =>
              withTheme(current, { headingFont: value as StudioDraft['theme']['headingFont'] }),
            )
          }
        />
        <SelectInput
          id="studio-body-font"
          label="Fonte do corpo"
          value={theme.bodyFont}
          options={FONT_OPTIONS}
          disabled={disabled}
          onChange={(value) =>
            onUpdate((current) =>
              withTheme(current, { bodyFont: value as StudioDraft['theme']['bodyFont'] }),
            )
          }
        />
        <SelectInput
          id="studio-background-style"
          label="Estilo do fundo"
          value={theme.backgroundStyle}
          options={BACKGROUND_OPTIONS}
          disabled={disabled}
          onChange={(value) =>
            onUpdate((current) =>
              withTheme(current, {
                backgroundStyle: value as StudioDraft['theme']['backgroundStyle'],
              }),
            )
          }
        />
        <SelectInput
          id="studio-radius"
          label="Cantos"
          value={theme.radius === null ? '' : String(theme.radius)}
          options={RADIUS_OPTIONS}
          disabled={disabled}
          onChange={(value) =>
            onUpdate((current) =>
              withTheme(current, { radius: value === '' ? null : Number(value) }),
            )
          }
        />
        <SelectInput
          id="studio-avatar-frame"
          label="Moldura do avatar"
          value={theme.avatarFrame ?? ''}
          options={FRAME_OPTIONS}
          disabled={disabled}
          onChange={(value) =>
            onUpdate((current) => withTheme(current, { avatarFrame: value === '' ? null : value }))
          }
        />
      </div>

      <div className="studio-toggles">
        <Toggle
          label="Efeito de grão"
          checked={theme.grain}
          disabled={disabled}
          onChange={(checked) => onUpdate((current) => withTheme(current, { grain: checked }))}
        />
        <Toggle
          label="Efeito de brilho"
          checked={theme.glow}
          disabled={disabled}
          onChange={(checked) => onUpdate((current) => withTheme(current, { glow: checked }))}
        />
      </div>
    </div>
  );
}
