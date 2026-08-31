import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnvironment } from '@/lib/config/environment';
import { shouldRedirectUnauthenticated } from '@/lib/auth/server-route-policy';

export async function updateSupabaseSession(request: NextRequest) {
  const env = getPublicEnvironment({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    OCPNG_STRICT_ENV: process.env.OCPNG_STRICT_ENV,
  });

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && Boolean(data?.claims);

  if (shouldRedirectUnauthenticated(request.nextUrl.pathname, isAuthenticated)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
