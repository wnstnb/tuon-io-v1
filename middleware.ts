import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  console.log(`[Middleware] Processing request for ${request.nextUrl.pathname}`);
  
  // Check for auth-related cookies
  const allCookies = request.cookies.getAll();
  console.log(`[Middleware] Found ${allCookies.length} cookies:`, 
    allCookies.map(cookie => `${cookie.name}=${cookie.value ? '(has value)' : '(empty)'}`).join(', ')
  );

  // Check for specific Supabase auth cookies
  const supabaseAuthCookie = request.cookies.get('sb-access-token');
  const supabaseRefreshCookie = request.cookies.get('sb-refresh-token');
  
  console.log(`[Middleware] Supabase auth cookies:`, {
    'sb-access-token': supabaseAuthCookie ? 'present' : 'missing',
    'sb-refresh-token': supabaseRefreshCookie ? 'present' : 'missing'
  });

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(name) {
          const value = request.cookies.get(name)?.value;
          console.log(`[Middleware] Reading cookie: ${name}=${value ? '(exists)' : '(not found)'}`);
          return value;
        },
        set(name, value, options) {
          console.log(`[Middleware] Setting cookie: ${name}`);
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name, options) {
          console.log(`[Middleware] Removing cookie: ${name}`);
          response.cookies.delete({
            name,
            ...options,
          });
        },
      },
    }
  );

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Add debugging to understand session state
    console.log("[Middleware] Auth check result:", {
      path: request.nextUrl.pathname,
      hasSession: !!session,
      userId: session?.user?.id || 'undefined',
      accessToken: session?.access_token ? `${session.access_token.substring(0, 10)}...` : 'undefined',
      tokenType: session?.token_type || 'undefined',
      refreshToken: session?.refresh_token ? 'present' : 'undefined'
    });

    // More forgiving session check
    const isAuthenticated = !!session?.user;

    // If user is not signed in and the current path is not /login, redirect to /login
    if (!isAuthenticated && request.nextUrl.pathname !== '/login' && !request.nextUrl.pathname.startsWith('/auth/')) {
      console.log("[Middleware] Redirecting to login from:", request.nextUrl.pathname);
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // If user is signed in and the current path is /, redirect to /editor
    if (isAuthenticated && request.nextUrl.pathname === '/') {
      console.log("[Middleware] Redirecting to editor from home page");
      return NextResponse.redirect(new URL('/editor', request.url));
    }
  } catch (error) {
    console.error("[Middleware] Error checking session:", error);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico).*)'],
}; 