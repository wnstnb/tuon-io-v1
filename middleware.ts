import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
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
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name, options) {
          response.cookies.delete({
            name,
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Add debugging to understand session state
  console.log("Auth check in middleware:", {
    path: request.nextUrl.pathname,
    hasSession: !!session,
    userId: session?.user?.id?.substring(0, 8) // Log partial ID for privacy
  });

  // More forgiving session check
  const isAuthenticated = !!session?.user;

  // If user is not signed in and the current path is not /login, redirect to /login
  if (!isAuthenticated && request.nextUrl.pathname !== '/login' && !request.nextUrl.pathname.startsWith('/auth/')) {
    console.log("Redirecting to login from:", request.nextUrl.pathname);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user is signed in and the current path is /, redirect to /editor
  if (isAuthenticated && request.nextUrl.pathname === '/') {
    console.log("Redirecting to editor from home page");
    return NextResponse.redirect(new URL('/editor', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico).*)'],
}; 