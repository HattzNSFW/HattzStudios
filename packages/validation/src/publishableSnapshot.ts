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

const FORBIDDEN_KEY_PATTERNS = [
  /password/i,
  /credential/i,
  /secret/i,
  /token/i,
  /session/i,
  /cookie/i,
  /recovery/i,
  /private/i,
  /draft/i,
  /admin/i,
  /internal/i,
  /audit/i,
  /roleassignment/i,
  /permissionoverride/i,
  /syncoperation/i,
  /settinghistory/i,
  /featureflag/i,
  /notification/i,
  /storageusage/i,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEY_PATTERNS.some((re) => re.test(key));
}

function pushForbiddenKeyIssues(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => pushForbiddenKeyIssues(item, `${path}[${i}]`, issues));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isForbiddenKey(key)) {
      issues.push({
        path: childPath,
        code: 'snapshot.forbidden_key',
        message: `Forbidden key "${key}" is not allowed in publishable snapshot content.`,
      });
    }
    pushForbiddenKeyIssues(child, childPath, issues);
  }
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

function validateString(value: unknown, path: string, issues: ValidationIssue[], max = 500): void {
  if (typeof value !== 'string') {
    issues.push({ path, code: 'snapshot.type', message: 'Expected string.' });
    return;
  }
  if (value.length > max) {
    issues.push({
      path,
      code: 'snapshot.length',
      message: `String exceeds maximum length (${max}).`,
    });
  }
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

  // Recursive forbidden key scan (defense in depth)
  pushForbiddenKeyIssues(input, 'content', issues);

  validateAllowedKeys(input, ALLOWED_ROOT_KEYS, 'content', issues);

  if (
    typeof input.schemaVersion !== 'number' ||
    !Number.isInteger(input.schemaVersion) ||
    input.schemaVersion < 1
  ) {
    issues.push({
      path: 'content.schemaVersion',
      code: 'snapshot.schemaVersion',
      message: 'schemaVersion must be a positive integer.',
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
    } else if (input.profile.displayName.length > 80) {
      issues.push({
        path: 'content.profile.displayName',
        code: 'snapshot.length',
        message: 'profile.displayName exceeds 80 characters.',
      });
    }
    if (input.profile.bio !== undefined)
      validateString(input.profile.bio, 'content.profile.bio', issues, 2000);
    if (input.profile.avatarAssetId !== undefined)
      validateString(input.profile.avatarAssetId, 'content.profile.avatarAssetId', issues, 128);
    if (input.profile.bannerAssetId !== undefined)
      validateString(input.profile.bannerAssetId, 'content.profile.bannerAssetId', issues, 128);
  }

  if (!Array.isArray(input.sections)) {
    issues.push({
      path: 'content.sections',
      code: 'snapshot.type',
      message: 'sections must be an array.',
    });
  } else {
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
      if (typeof section.type !== 'string' || !section.type)
        issues.push({
          path: `${sp}.type`,
          code: 'snapshot.required',
          message: 'section.type is required.',
        });
      if (typeof section.visible !== 'boolean')
        issues.push({
          path: `${sp}.visible`,
          code: 'snapshot.type',
          message: 'section.visible must be boolean.',
        });
      if (typeof section.order !== 'number')
        issues.push({
          path: `${sp}.order`,
          code: 'snapshot.type',
          message: 'section.order must be number.',
        });
      if (!Array.isArray(section.blocks)) {
        issues.push({
          path: `${sp}.blocks`,
          code: 'snapshot.type',
          message: 'section.blocks must be an array.',
        });
      } else {
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
          if (typeof block.type !== 'string' || !block.type)
            issues.push({
              path: `${bp}.type`,
              code: 'snapshot.required',
              message: 'block.type is required.',
            });
          if (typeof block.visible !== 'boolean')
            issues.push({
              path: `${bp}.visible`,
              code: 'snapshot.type',
              message: 'block.visible must be boolean.',
            });
          if (typeof block.order !== 'number')
            issues.push({
              path: `${bp}.order`,
              code: 'snapshot.type',
              message: 'block.order must be number.',
            });
          if (!isPlainObject(block.props))
            issues.push({
              path: `${bp}.props`,
              code: 'snapshot.type',
              message: 'block.props must be an object.',
            });
        });
      }
    });
  }

  if (input.theme !== undefined && !isPlainObject(input.theme)) {
    issues.push({
      path: 'content.theme',
      code: 'snapshot.type',
      message: 'theme must be an object.',
    });
  }
  if (input.effects !== undefined && !isPlainObject(input.effects)) {
    issues.push({
      path: 'content.effects',
      code: 'snapshot.type',
      message: 'effects must be an object.',
    });
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
        validateString(input.seo.title, 'content.seo.title', issues, 120);
      if (input.seo.description !== undefined)
        validateString(input.seo.description, 'content.seo.description', issues, 300);
    }
  }

  if (issues.length > 0) return failure(issues);
  return success(input as unknown as PublishableSnapshotContent);
}

export function isPublishableSnapshotContent(input: unknown): input is PublishableSnapshotContent {
  return validatePublishableSnapshotContent(input).ok;
}
