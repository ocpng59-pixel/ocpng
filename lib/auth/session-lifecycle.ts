type SignOutResult = { error: { message: string } | null };

type AuthAuditResult =
  | { ok: true }
  | { ok: false; message: string };

type AuthAuditEvent = {
  actorId: string;
  action: 'auth.sign_in_succeeded' | 'auth.sign_out';
  requestMetadata: Record<string, unknown>;
};

type PasswordSignInResult = {
  data: { user: { id: string } | null } | null;
  error: { message: string } | null;
};

type SessionSignInDependencies = {
  signIn: (credentials: {
    email: string;
    password: string;
  }) => Promise<PasswordSignInResult>;
  recordAudit: (event: AuthAuditEvent) => Promise<AuthAuditResult>;
  signOut: (options: { scope: 'local' }) => Promise<SignOutResult>;
  redirect: (path: string) => void;
};

type SessionSignOutDependencies = {
  actorId?: string | null;
  pathname?: string;
  recordAudit?: (event: AuthAuditEvent) => Promise<AuthAuditResult>;
  signOut: (options: { scope: 'local' }) => Promise<SignOutResult>;
  redirect: (path: string) => void;
};

type ClaimsVerificationResult = {
  data?: { claims?: unknown | null } | null;
  error?: unknown | null;
};

export type SessionSignInResult =
  | { ok: true }
  | { ok: false; message: string };

export type SessionSignOutResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signInCurrentSession(
  { signIn, recordAudit, signOut, redirect }: SessionSignInDependencies,
  credentials: { email: string; password: string },
): Promise<SessionSignInResult> {
  const { data, error } = await signIn(credentials);

  if (error) {
    return { ok: false, message: error.message };
  }

  const actorId = data?.user?.id;
  if (!actorId) {
    return { ok: false, message: 'Authentication failed' };
  }

  const auditResult = await recordAudit({
    actorId,
    action: 'auth.sign_in_succeeded',
    requestMetadata: {
      path: '/login',
      auth_method: 'password',
      event_source: 'wasdok-web',
    },
  });

  if (!auditResult.ok) {
    await signOut({ scope: 'local' });
    return { ok: false, message: 'Unable to establish an audited session' };
  }

  redirect('/dashboard');
  return { ok: true };
}

export async function signOutCurrentSession({
  actorId,
  pathname = '/dashboard',
  recordAudit,
  signOut,
  redirect,
}: SessionSignOutDependencies): Promise<SessionSignOutResult> {
  if (actorId && recordAudit) {
    try {
      await recordAudit({
        actorId,
        action: 'auth.sign_out',
        requestMetadata: {
          path: pathname,
          event_source: 'wasdok-web',
          reason_code: 'user_initiated',
        },
      });
    } catch {
      // Audit availability must never trap a user inside an authenticated session.
    }
  }

  const { error } = await signOut({ scope: 'local' });

  if (error) {
    return { ok: false, message: error.message };
  }

  redirect('/login');
  return { ok: true };
}

export async function hasValidServerSession(
  getClaims: () => Promise<ClaimsVerificationResult>,
): Promise<boolean> {
  try {
    const { data, error } = await getClaims();
    return !error && Boolean(data?.claims);
  } catch {
    return false;
  }
}

export function shouldReturnToLoginAfterAuthEvent({
  event,
  hasSession,
  pathname,
}: {
  event: string;
  hasSession: boolean;
  pathname: string;
}): boolean {
  const protectedPath = pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  if (!protectedPath || hasSession) return false;

  return event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED';
}
