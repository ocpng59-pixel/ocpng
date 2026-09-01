type SignOutResult = { error: { message: string } | null };

type SessionSignOutDependencies = {
  signOut: (options: { scope: 'local' }) => Promise<SignOutResult>;
  redirect: (path: string) => void;
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
