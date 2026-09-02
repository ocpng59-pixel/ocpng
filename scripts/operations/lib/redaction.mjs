const REDACTED = '[REDACTED]';

export function redactOperationalText(value) {
  let text = String(value ?? '');

  text = text.replace(/\bBearer\s+[^\s"'`]+/gi, `Bearer ${REDACTED}`);
  text = text.replace(
    /\b(token|access_token|refresh_token|secret|password|service_role|database_url|encryption_key)\s*=\s*[^\s&;,]+/gi,
    (_match, key) => `${key}=${REDACTED}`,
  );
  text = text.replace(
    /\b(postgres(?:ql)?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
    (_match, scheme, username) => `${scheme}${username}:${REDACTED}@`,
  );

  return text;
}

export function safeOperationalError(error) {
  if (error instanceof Error) {
    return redactOperationalText(error.message);
  }
  return redactOperationalText(error);
}
