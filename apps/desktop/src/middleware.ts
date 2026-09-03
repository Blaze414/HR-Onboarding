import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decideSurface, resolveBackendUrl, SURFACE_HOP_PARAM } from '@snoopy/shared';
import { NextResponse, type NextRequest } from 'next/server';

/*
 * The only paths reachable without a session. `/api/auth` is the sign-in route
 * itself, which necessarily runs before there is anything to verify — it does
 * its own rate limiting and records every attempt, so it is not an unguarded
 * door, only an unauthenticated one.
 */
const PUBLIC_PATHS = ['/login', '/auth', '/api/auth'];

/**
 * Throw away the auth cookies for this request's backend host.
 *
 * Named by @supabase/ssr after the host, so they are matched by prefix rather
 * than guessed: `sb-127-auth-token`, `sb-192-auth-token`, and the chunked
 * variants it writes when a session is too large for one cookie.
 */
function forgetSession(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (/^sb-.*-auth-token/.test(cookie.name)) {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' });
    }
  }
}

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

  /*
   * A cookie can outlive the session it names. The clearest way to produce one
   * is to reset the database underneath a browser that is still signed in: the
   * refresh token it holds no longer exists, so every request tries to refresh,
   * fails with `refresh_token_not_found`, and logs it — forever, because
   * nothing ever throws the cookie away.
   *
   * Treat it as signed out and clear the cookies once, so the next request is
   * an ordinary anonymous one rather than another failed refresh.
   */
  let user = null;
  let staleSession = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) staleSession = true;
    else user = data.session?.user ?? null;
  } catch {
    staleSession = true;
  }
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    const redirect = NextResponse.redirect(url);
    if (staleSession) forgetSession(request, redirect);
    return redirect;
  }

  // Signed out on a public path, but still carrying a dead cookie: drop it here
  // too, or the sign-in page itself keeps trying to refresh it.
  if (staleSession) forgetSession(request, response);

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

/*
 * `file-viewer/` is the document viewer's runtime — workers, WASM, fonts and
 * vendor bundles, fetched by the viewer itself rather than navigated to.
 *
 * Without it here the middleware answered those requests with a 307 to the
 * sign-in page, and pdf.js parsed the redirect body as JavaScript: "Setting up
 * fake worker failed: Invalid or unexpected token" — the unexpected token being
 * the `<` of an HTML page. Nothing under it is user data; it is the same bytes
 * for everybody and is regenerated from the package on install.
 */
/*
 * One string literal, not a concatenation: Next reads this at build time by
 * static analysis and cannot evaluate an expression. Splitting it across two
 * lines with a `+` leaves the matcher unset and the middleware running on
 * everything — which is exactly the bug this line exists to fix, silently
 * restored.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|file-viewer/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$).*)'],
};
