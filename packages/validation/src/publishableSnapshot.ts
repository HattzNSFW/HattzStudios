import { failure, success, type ValidationIssue, type ValidationResult } from './index';

export interface PublishableSnapshotContent {
  schemaVersion: number;
  profile: {
    displayName: string;
    bio?: string;
    avatarAssetId?: string;
    bannerAssetId?: string;
  };
  sections: PublishableSection[];
  theme?: Record<string, unknown>;
  effects?: Record<string, unknown>;
  seo?: {
    title?: string;
    description?: string;
  };
}

export interface PublishableSection {
  id: string;
  type: string;
  visible: boolean;
  order: number;
  blocks: PublishableBlock[];
}

export interface PublishableBlock {
  id: string;
  type: string;
  visible: boolean;
  order: number;
  props: Record<string, unknown>;
}

// Explicit limits (kept consistent with DB validation in 0009)
export const SNAPSHOT_LIMITS = {
  maxTotalBytes: 262_144, // UTF-8 JSON payload bound
  maxDepth: 12,
  maxSections: 50,
  maxBlocksPerSection: 50,
  maxArrayElements: 100,
  maxObjectKeys: 50,
  maxStringLength: 2_000,
  maxDisplayNameLength: 80,
  maxBioLength: 2_000,
  maxAssetIdLength: 128,
  maxSeoTitleLength: 120,
  maxSeoDescriptionLength: 300,
  maxIdLength: 128,
  maxTypeLength: 64,
} as const;

const FORBIDDEN_KEY_PATTERNS = [
  /password/i,
  /credential/i,
  /secret/i,
  /token(?!s\b)/i,
  /session/i,
  /cookie/i,
  /recovery/i,
  /private/i,
  /draft/i,
  /admin/i,
  /internal/i,
  /audit/i,
  /role[_]?assignment/i,
  /permission[_]?override/i,
  /sync[_]?operation/i,
  /setting[_]?history/i,
  /feature[_]?flag/i,
  /notification/i,
  /storage[_]?usage/i,
  /assigned_by/i,
  /revoked_by/i,
  /failure_reason/i,
  /manifest_ref/i,
  /storage_path/i,
  /storage_bucket/i,
  /checksum/i,
  /ip_hash/i,
  /user_agent_hash/i,
];

const ALLOWED_ROOT_KEYS = new Set([
  'schemaVersion',
  'profile',
  'sections',
  'theme',
  'effects',
  'seo',
]);
const ALLOWED_PROFILE_KEYS = new Set(['displayName', 'bio', 'avatarAssetId', 'bannerAssetId']);
const ALLOWED_SECTION_KEYS = new Set(['id', 'type', 'visible', 'order', 'blocks']);
const ALLOWED_BLOCK_KEYS = new Set(['id', 'type', 'visible', 'order', 'props']);
const ALLOWED_SEO_KEYS = new Set(['title', 'description']);

const EXTENSIBLE_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
// Section/block ids are bounded by maxIdLength (128), matching the DB validator in 0009.
// Reusing the 64-char extensible-key pattern here made maxIdLength dead and diverged from SQL.
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const ASSET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEY_PATTERNS.some((re) => re.test(key));
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return Buffer.byteLength(value, 'utf8');
}

// PostgreSQL `length(text)` counts Unicode characters (code points); JS `.length` counts
// UTF-16 code units. Using `.length` would make astral characters (e.g. emoji) count as 2 in
// TS but 1 in SQL, diverging on the string-length limits. Count code points to stay aligned.
function charLength(value: string): number {
  return [...value].length;
}

function pushForbiddenKeyIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  depth = 0,
  stack = new WeakSet<object>(),
): void {
  // Public boundary: fail closed instead of overflowing the stack on circular or
  // extremely deep input. `stack` tracks the current path so only true cycles stop.
  if (depth > SNAPSHOT_LIMITS.maxDepth) return;
  if (Array.isArray(value)) {
    if (stack.has(value)) return;
    stack.add(value);
    value.forEach((item, i) =>
      pushForbiddenKeyIssues(item, `${path}[${i}]`, issues, depth + 1, stack),
    );
    stack.delete(value);
    return;
  }
  if (!isPlainObject(value)) return;
  if (stack.has(value)) return;
  stack.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isForbiddenKey(key)) {
      issues.push({
        path: childPath,
        code: 'snapshot.forbidden_key',
        message: `Forbidden key "${key}" is not allowed in publishable snapshot content.`,
      });
    }
    pushForbiddenKeyIssues(child, childPath, issues, depth + 1, stack);
  }
  stack.delete(value);
}

function validateAllowedKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      issues.push({
        path: path ? `${path}.${key}` : key,
        code: 'snapshot.unknown_key',
        message: `Key "${key}" is not allowed in publishable snapshot schema.`,
      });
    }
  }
}

function validateString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  max: number = SNAPSHOT_LIMITS.maxStringLength,
): void {
  if (typeof value !== 'string') {
    issues.push({ path, code: 'snapshot.type', message: 'Expected string.' });
    return;
  }
  if (charLength(value) > max) {
    issues.push({
      path,
      code: 'snapshot.length',
      message: `String exceeds maximum length (${max}).`,
    });
  }
}

function validateAssetRef(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== 'string') {
    issues.push({ path, code: 'snapshot.type', message: 'Expected asset reference string.' });
    return;
  }
  if (charLength(value) > SNAPSHOT_LIMITS.maxAssetIdLength || !ASSET_ID_PATTERN.test(value)) {
    issues.push({
      path,
      code: 'snapshot.media_ref',
      message: 'Invalid media asset reference format.',
    });
  }
}

// Controlled, typed-extensible values for props/theme/effects:
// primitives (null/boolean/finite number/bounded string), arrays, and plain objects
// with bounded keys/counts/depth. No arbitrary/unsafe structures.
function validateExtensibleValue(
  value: unknown,
  path: string,
  depth: number,
  issues: ValidationIssue[],
): void {
  if (depth > SNAPSHOT_LIMITS.maxDepth) {
    issues.push({
      path,
      code: 'snapshot.depth',
      message: `Maximum nesting depth (${SNAPSHOT_LIMITS.maxDepth}) exceeded.`,
    });
    return;
  }
  if (value === null) return;
  const t = typeof value;
  if (t === 'string') {
    if (charLength(value as string) > SNAPSHOT_LIMITS.maxStringLength) {
      issues.push({
        path,
        code: 'snapshot.length',
        message: `String exceeds maximum length (${SNAPSHOT_LIMITS.maxStringLength}).`,
      });
    }
    return;
  }
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      issues.push({ path, code: 'snapshot.type', message: 'Number must be finite.' });
    }
    return;
  }
  if (t === 'boolean') return;
  if (Array.isArray(value)) {
    if (value.length > SNAPSHOT_LIMITS.maxArrayElements) {
      issues.push({
        path,
        code: 'snapshot.limit',
        message: `Array exceeds maximum elements (${SNAPSHOT_LIMITS.maxArrayElements}).`,
      });
      return;
    }
    value.forEach((item, i) => validateExtensibleValue(item, `${path}[${i}]`, depth + 1, issues));
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > SNAPSHOT_LIMITS.maxObjectKeys) {
      issues.push({
        path,
        code: 'snapshot.limit',
        message: `Object exceeds maximum keys (${SNAPSHOT_LIMITS.maxObjectKeys}).`,
      });
      return;
    }
    for (const key of keys) {
      if (isForbiddenKey(key)) {
        issues.push({
          path: `${path}.${key}`,
          code: 'snapshot.forbidden_key',
          message: `Forbidden key "${key}" is not allowed in publishable snapshot content.`,
        });
      }
      if (!EXTENSIBLE_KEY_PATTERN.test(key)) {
        issues.push({
          path: `${path}.${key}`,
          code: 'snapshot.key',
          message: 'Extensible keys must match [a-zA-Z0-9_-]{1,64}.',
        });
      }
      validateExtensibleValue(value[key], `${path}.${key}`, depth + 1, issues);
    }
    return;
  }
  issues.push({ path, code: 'snapshot.type', message: 'Unsupported value type.' });
}

export function validatePublishableSnapshotContent(
  input: unknown,
): ValidationResult<PublishableSnapshotContent> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(input)) {
    return failure([
      { path: 'content', code: 'snapshot.type', message: 'Snapshot content must be an object.' },
    ]);
  }

  // Total payload size bound (defense in depth)
  try {
    const size = utf8ByteLength(JSON.stringify(input));
    if (size > SNAPSHOT_LIMITS.maxTotalBytes) {
      issues.push({
        path: 'content',
        code: 'snapshot.size',
        message: `Snapshot exceeds maximum size (${SNAPSHOT_LIMITS.maxTotalBytes} bytes).`,
      });
    }
  } catch {
    issues.push({
      path: 'content',
      code: 'snapshot.type',
      message: 'Snapshot content is not serializable JSON.',
    });
  }

  // Recursive forbidden key scan (defense in depth)
  pushForbiddenKeyIssues(input, 'content', issues);

  validateAllowedKeys(input, ALLOWED_ROOT_KEYS, 'content', issues);

  if (
    typeof input.schemaVersion !== 'number' ||
    !Number.isSafeInteger(input.schemaVersion) ||
    input.schemaVersion < 1
  ) {
    issues.push({
      path: 'content.schemaVersion',
      code: 'snapshot.schemaVersion',
      message: 'schemaVersion must be a positive safe integer.',
    });
  }

  if (!isPlainObject(input.profile)) {
    issues.push({
      path: 'content.profile',
      code: 'snapshot.type',
      message: 'profile must be an object.',
    });
  } else {
    validateAllowedKeys(input.profile, ALLOWED_PROFILE_KEYS, 'content.profile', issues);
    if (
      typeof input.profile.displayName !== 'string' ||
      input.profile.displayName.trim().length === 0
    ) {
      issues.push({
        path: 'content.profile.displayName',
        code: 'snapshot.required',
        message: 'profile.displayName is required.',
      });
    } else if (charLength(input.profile.displayName) > SNAPSHOT_LIMITS.maxDisplayNameLength) {
      issues.push({
        path: 'content.profile.displayName',
        code: 'snapshot.length',
        message: `profile.displayName exceeds ${SNAPSHOT_LIMITS.maxDisplayNameLength} characters.`,
      });
    }
    if (input.profile.bio !== undefined)
      validateString(
        input.profile.bio,
        'content.profile.bio',
        issues,
        SNAPSHOT_LIMITS.maxBioLength,
      );
    if (input.profile.avatarAssetId !== undefined)
      validateAssetRef(input.profile.avatarAssetId, 'content.profile.avatarAssetId', issues);
    if (input.profile.bannerAssetId !== undefined)
      validateAssetRef(input.profile.bannerAssetId, 'content.profile.bannerAssetId', issues);
  }

  if (!Array.isArray(input.sections)) {
    issues.push({
      path: 'content.sections',
      code: 'snapshot.type',
      message: 'sections must be an array.',
    });
  } else {
    if (input.sections.length > SNAPSHOT_LIMITS.maxSections) {
      issues.push({
        path: 'content.sections',
        code: 'snapshot.limit',
        message: `sections exceeds maximum (${SNAPSHOT_LIMITS.maxSections}).`,
      });
    }
    input.sections.forEach((section, i) => {
      const sp = `content.sections[${i}]`;
      if (!isPlainObject(section)) {
        issues.push({ path: sp, code: 'snapshot.type', message: 'section must be an object.' });
        return;
      }
      validateAllowedKeys(section, ALLOWED_SECTION_KEYS, sp, issues);
      if (typeof section.id !== 'string' || !section.id)
        issues.push({
          path: `${sp}.id`,
          code: 'snapshot.required',
          message: 'section.id is required.',
        });
      else if (section.id.length > SNAPSHOT_LIMITS.maxIdLength || !ID_PATTERN.test(section.id))
        issues.push({
          path: `${sp}.id`,
          code: 'snapshot.format',
          message: 'section.id has invalid format/length.',
        });
      if (typeof section.type !== 'string' || !section.type)
        issues.push({
          path: `${sp}.type`,
          code: 'snapshot.required',
          message: 'section.type is required.',
        });
      else if (
        section.type.length > SNAPSHOT_LIMITS.maxTypeLength ||
        !EXTENSIBLE_KEY_PATTERN.test(section.type)
      )
        issues.push({
          path: `${sp}.type`,
          code: 'snapshot.format',
          message: 'section.type has invalid format/length.',
        });
      if (typeof section.visible !== 'boolean')
        issues.push({
          path: `${sp}.visible`,
          code: 'snapshot.type',
          message: 'section.visible must be boolean.',
        });
      if (typeof section.order !== 'number' || !Number.isFinite(section.order))
        issues.push({
          path: `${sp}.order`,
          code: 'snapshot.type',
          message: 'section.order must be a finite number.',
        });
      if (!Array.isArray(section.blocks)) {
        issues.push({
          path: `${sp}.blocks`,
          code: 'snapshot.type',
          message: 'section.blocks must be an array.',
        });
      } else {
        if (section.blocks.length > SNAPSHOT_LIMITS.maxBlocksPerSection) {
          issues.push({
            path: `${sp}.blocks`,
            code: 'snapshot.limit',
            message: `blocks exceeds maximum (${SNAPSHOT_LIMITS.maxBlocksPerSection}).`,
          });
        }
        section.blocks.forEach((block, j) => {
          const bp = `${sp}.blocks[${j}]`;
          if (!isPlainObject(block)) {
            issues.push({ path: bp, code: 'snapshot.type', message: 'block must be an object.' });
            return;
          }
          validateAllowedKeys(block, ALLOWED_BLOCK_KEYS, bp, issues);
          if (typeof block.id !== 'string' || !block.id)
            issues.push({
              path: `${bp}.id`,
              code: 'snapshot.required',
              message: 'block.id is required.',
            });
          else if (block.id.length > SNAPSHOT_LIMITS.maxIdLength || !ID_PATTERN.test(block.id))
            issues.push({
              path: `${bp}.id`,
              code: 'snapshot.format',
              message: 'block.id has invalid format/length.',
            });
          if (typeof block.type !== 'string' || !block.type)
            issues.push({
              path: `${bp}.type`,
              code: 'snapshot.required',
              message: 'block.type is required.',
            });
          else if (
            block.type.length > SNAPSHOT_LIMITS.maxTypeLength ||
            !EXTENSIBLE_KEY_PATTERN.test(block.type)
          )
            issues.push({
              path: `${bp}.type`,
              code: 'snapshot.format',
              message: 'block.type has invalid format/length.',
            });
          if (typeof block.visible !== 'boolean')
            issues.push({
              path: `${bp}.visible`,
              code: 'snapshot.type',
              message: 'block.visible must be boolean.',
            });
          if (typeof block.order !== 'number' || !Number.isFinite(block.order))
            issues.push({
              path: `${bp}.order`,
              code: 'snapshot.type',
              message: 'block.order must be a finite number.',
            });
          if (!isPlainObject(block.props)) {
            issues.push({
              path: `${bp}.props`,
              code: 'snapshot.type',
              message: 'block.props must be an object.',
            });
          } else {
            // props is extensible but controlled/typed/bounded.
            // Depth origin must match the SQL validator's recursive walk: `block.props`
            // sits at absolute content depth 5 (content=0 -> sections=1 -> section=2 ->
            // blocks=3 -> block=4 -> props=5), so the declared maxDepth (12) is measured
            // from the content root in BOTH validators. Passing 1 here made the TS limit
            // four levels looser than SQL (SQL/TS divergence).
            validateExtensibleValue(block.props, `${bp}.props`, 5, issues);
          }
        });
      }
    });
  }

  if (input.theme !== undefined) {
    if (!isPlainObject(input.theme)) {
      issues.push({
        path: 'content.theme',
        code: 'snapshot.type',
        message: 'theme must be an object.',
      });
    } else {
      validateExtensibleValue(input.theme, 'content.theme', 1, issues);
    }
  }
  if (input.effects !== undefined) {
    if (!isPlainObject(input.effects)) {
      issues.push({
        path: 'content.effects',
        code: 'snapshot.type',
        message: 'effects must be an object.',
      });
    } else {
      validateExtensibleValue(input.effects, 'content.effects', 1, issues);
    }
  }
  if (input.seo !== undefined) {
    if (!isPlainObject(input.seo)) {
      issues.push({
        path: 'content.seo',
        code: 'snapshot.type',
        message: 'seo must be an object.',
      });
    } else {
      validateAllowedKeys(input.seo, ALLOWED_SEO_KEYS, 'content.seo', issues);
      if (input.seo.title !== undefined)
        validateString(
          input.seo.title,
          'content.seo.title',
          issues,
          SNAPSHOT_LIMITS.maxSeoTitleLength,
        );
      if (input.seo.description !== undefined)
        validateString(
          input.seo.description,
          'content.seo.description',
          issues,
          SNAPSHOT_LIMITS.maxSeoDescriptionLength,
        );
    }
  }

  if (issues.length > 0) return failure(issues);
  return success(input as unknown as PublishableSnapshotContent);
}

export function isPublishableSnapshotContent(input: unknown): input is PublishableSnapshotContent {
  return validatePublishableSnapshotContent(input).ok;
}
