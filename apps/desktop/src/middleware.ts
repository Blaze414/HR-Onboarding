import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decideSurface, resolveBackendUrl, SURFACE_HOP_PARAM } from '@snoopy/shared';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth'];

/**
 * Refreshes the Supabase session cookie and keeps unauthenticated visitors out
 * of the workspace.
 *
 * This layer deliberately reads the session from the cookie instead of calling
 * the auth service: it runs on every request, including RSC prefetches, and a
 * network round trip here was the single largest slice of page latency. It is
 * only a redirect for people who are obviously signed out. The authoritative
 * check still happens per route in `requireSession`/`requireAdmin`, which do
 * verify the user with the auth service, and RLS remains the real boundary —
 * a forged cookie gets past this redirect and then fails at both.
 */
export async function middleware(request: NextRequest) {
  /*
   * Device routing runs before anything else, so a phone never pays to render a
   * workspace it is not allowed to use. The decision is made from the user
   * agent because that is known before any markup exists — a viewport check
   * could only run after the wrong app had already loaded.
   */
  const decision = decideSurface({
    current: 'desktop',
    userAgent: request.headers.get('user-agent'),
    otherAppUrl: process.env.NEXT_PUBLIC_MOBILE_APP_URL,
    alreadyRedirected: request.nextUrl.searchParams.has(SURFACE_HOP_PARAM),
  });

  if (decision.action === 'redirect') {
    return NextResponse.redirect(decision.url);
  }
  if (decision.action === 'block') {
    const url = request.nextUrl.clone();
    url.pathname = '/wrong-device';
    url.search = '';
    // Rewritten, not redirected: the address stays put so a refresh re-checks
    // rather than stranding someone on an error page.
    return NextResponse.rewrite(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    // Same host resolution as the browser and the server components, so the auth
    // cookie is read under the name it was written with.
    resolveBackendUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, request.headers.get('host')),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$).*)'],
};
