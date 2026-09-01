export type AuthAuditAction = 'auth.sign_in_succeeded' | 'auth.sign_out';

type SafeMetadataValue = string | number | boolean | null;
export type AuthAuditMetadata = Record<string, SafeMetadataValue>;

export type AuthAuditInsertRow = {
  actor_id: string;
  action: AuthAuditAction;
  entity_type: 'auth_session';
  request_metadata: AuthAuditMetadata;
  classification: 'RESTRICTED';
  metadata: { source: 'wasdok-auth' };
};

type AuditInsertResult = {
  error: { message: string } | null;
};

type RecordAuthenticatedAuthEventInput = {
  insert: (row: AuthAuditInsertRow) => Promise<AuditInsertResult>;
  actorId: string;
  action: AuthAuditAction;
  requestMetadata?: Record<string, unknown>;
};

export type RecordAuthAuditResult =
  | { ok: true }
  | { ok: false; message: string };

const SAFE_METADATA_KEYS = new Set([
  'path',
  'auth_method',
  'event_source',
  'reason_code',
]);

const ALLOWED_ACTIONS = new Set<AuthAuditAction>([
  'auth.sign_in_succeeded',
  'auth.sign_out',
]);

export function sanitizeAuthAuditMetadata(
  input: Record<string, unknown>,
): AuthAuditMetadata {
  const sanitized: AuthAuditMetadata = {};

  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;

    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function recordAuthenticatedAuthEvent({
  insert,
  actorId,
  action,
  requestMetadata = {},
}: RecordAuthenticatedAuthEventInput): Promise<RecordAuthAuditResult> {
  if (!actorId || !ALLOWED_ACTIONS.has(action)) {
    return { ok: false, message: 'Authenticated audit context is invalid' };
  }

  try {
    const { error } = await insert({
      actor_id: actorId,
      action,
      entity_type: 'auth_session',
      request_metadata: sanitizeAuthAuditMetadata(requestMetadata),
      classification: 'RESTRICTED',
      metadata: { source: 'wasdok-auth' },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: 'Audit event could not be recorded' };
  }
}
