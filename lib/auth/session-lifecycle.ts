type SignOutResult = { error: { message: string } | null };

type SessionSignOutDependencies = {
  signOut: (options: { scope: 'local' }) => Promise<SignOutResult>;
  redirect: (path: string) => void;
};

type ClaimsVerificationResult = {
  data?: { claims?: unknown | null } | null;
  error?: unknown | null;
};

export type SessionSignOutResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signOutCurrentSession({
  signOut,
  redirect,
}: SessionSignOutDependencies): Promise<SessionSignOutResult> {
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
