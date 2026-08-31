const protectedApplicationPrefixes = ['/dashboard'] as const;

export function isProtectedApplicationPath(pathname: string): boolean {
  return protectedApplicationPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldRedirectUnauthenticated(pathname: string, isAuthenticated: boolean): boolean {
  return !isAuthenticated && isProtectedApplicationPath(pathname);
}
