# WASDOK-62 authentication security regression tests

Spec: [WASDOK-62](https://ocpng.atlassian.net/browse/WASDOK-62), under WASDOK-23.
Baseline: `5cbec721258f169aa92146b2ec39d6b4e222a17b` (WASDOK-61).

## Acceptance coverage

| Requirement | Executable evidence |
| --- | --- |
| Unauthenticated protected routes fail safely | `tests/security/server-auth-boundary.test.ts` executes the root proxy and dashboard layout; `npm run test:auth-build` sends GET, HEAD and RSC requests to a production Next.js server. |
| Expired/revoked session behavior | Real Supabase SSR/claims/cookie code processes synthetic expired sessions, successful token rotation, rejected refresh tokens, malformed tokens and an Auth-rejected forged cookie. Existing session-lifecycle tests cover browser session-loss events. |
| No privileged credentials in client configuration or browser bundles | Configuration rejects legacy service-role JWTs and `sb_secret_` keys; the real browser client emits the public API key. A synthetic server canary build scans static files, source maps, prerendered HTML/RSC and public HTTP responses. Scanner fixtures prove leakage is rejected and missing builds cannot pass. |
| Authentication security tests run in CI | `.github/workflows/ci.yml` explicitly runs `test:auth-security` and `test:auth-build`, in addition to all existing unit, RLS, domain, schema, route, type and lint gates. |

## Commands

```sh
npm run test:auth-security
npm run test:auth-build
```

`test:auth-build` builds with synthetic public and server keys, scans the resulting artifacts, starts a loopback production server, sends 30 protected requests plus 3 public-route checks, then stops the server. It overwrites `.next` with a test configuration; run the normal deployment build with the deployment environment before publishing. It does not use a hosted Supabase project, create users, or modify application records.

To inspect an existing build independently:

```sh
npm run verify:client-artifacts
```

That scanner checks configured `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY` values when present, and independently detects Supabase secret-key strings and JWTs whose payload declares `service_role`. Diagnostics identify affected artifacts without echoing the credential.

## Defects reproduced and repaired

The initial request-boundary and configuration tests produced four failures:

- Two refresh-rejection cases demonstrated that creating a login redirect discarded Supabase's cookie-deletion and cache-prevention headers. The proxy now copies cookie mutations and cache headers to the redirect.
- Two configuration cases demonstrated that a privileged key could be assigned to the public anonymous-key setting. Configuration now rejects both supported privileged key formats without including the key in the error.

The public-key payload decode is only a misconfiguration check. It never establishes an identity or replaces Supabase signature verification.

## Scope of evidence

The boundary tests replace only Auth HTTP responses and Next's request-cookie context. Application policies, Supabase SSR, token decoding/refresh, and Next request/response handling execute normally. These are deterministic integration tests, not a live-provider revocation test. Existing CI also starts disposable Supabase and executes the database RLS and auth-audit actor-integrity suites.

Revoking a refresh token does not necessarily invalidate a previously issued access JWT immediately. These tests prove rejection when an expired access token cannot be refreshed, and rejection when Auth refuses token validation. They do not claim immediate revocation of every unexpired JWT. Immediate session revocation would require a separately designed server-side session check. See [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions).

The artifact scan covers conventional emitted credential strings and exact server-canary values, not arbitrary obfuscation or a complete information-flow proof. No hosted database migration is required by this task.
