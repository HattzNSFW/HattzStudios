import type { ChangeEvent, ReactNode } from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="studio-field">
      <label className="studio-field__label" {...(htmlFor ? { htmlFor } : {})}>
        {label}
      </label>
      {children}
      {hint ? <p className="studio-field__hint">{hint}</p> : null}
    </div>
  );
}

interface TextInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  hint?: string;
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
  hint,
}: TextInputProps) {
  return (
    <Field label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <input
        id={id}
        className="studio-input"
        type="text"
        value={value}
        placeholder={placeholder ?? ''}
        {...(maxLength ? { maxLength } : {})}
        {...(disabled ? { disabled } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

interface TextAreaProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
  disabled,
  hint,
}: TextAreaProps) {
  return (
    <Field label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <textarea
        id={id}
        className="studio-input studio-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder ?? ''}
        {...(maxLength ? { maxLength } : {})}
        {...(disabled ? { disabled } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

interface ColorInputProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function ColorInput({ id, label, value, onChange, disabled }: ColorInputProps) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="studio-color">
        <input
          id={id}
          className="studio-color__picker"
          type="color"
          value={value ?? '#a78bfa'}
          {...(disabled ? { disabled } : {})}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="studio-color__value">{value ?? 'Padrão'}</span>
        {value ? (
          <button
            type="button"
            className="studio-mini-button"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            Limpar
          </button>
        ) : null}
      </div>
    </Field>
  );
}

interface SelectInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}

export function SelectInput({ id, label, value, onChange, options, disabled }: SelectInputProps) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className="studio-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="studio-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

interface FileButtonProps {
  label: string;
  accept?: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function FileButton({ label, accept, onFile, disabled }: FileButtonProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = '';
  };
  return (
    <label className={`studio-file-button${disabled ? ' is-disabled' : ''}`}>
      <span>{label}</span>
      <input type="file" accept={accept ?? 'image/*'} disabled={disabled} onChange={handleChange} />
    </label>
  );
}
