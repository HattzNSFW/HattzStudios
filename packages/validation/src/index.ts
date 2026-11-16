export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export function success<T>(value: T): ValidationResult<T> {
  return { ok: true, value, issues: [] };
}

export function failure<T = never>(issues: ValidationIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}

export function validateSlug(value: string): ValidationResult<string> {
  const normalized = value.trim().toLowerCase();
  const issues: ValidationIssue[] = [];
  if (normalized.length < 3 || normalized.length > 48) {
    issues.push({
      path: 'slug',
      code: 'slug.length',
      message: 'Slug must be between 3 and 48 characters.',
    });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    issues.push({
      path: 'slug',
      code: 'slug.format',
      message: 'Slug must contain lowercase letters, numbers, and single hyphens only.',
    });
  }
  return issues.length ? failure(issues) : success(normalized);
}

export function validateHttpsUrl(value: string): ValidationResult<string> {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return failure([
        { path: 'url', code: 'url.protocol', message: 'URL must use http or https.' },
      ]);
    }
    return success(url.toString());
  } catch {
    return failure([{ path: 'url', code: 'url.invalid', message: 'URL is invalid.' }]);
  }
}
