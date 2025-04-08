import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  
  console.log("[Auth Callback] Processing auth callback with code:", !!code);
  
  if (code) {
    // Create a response to modify cookies on
    const response = NextResponse.redirect(new URL('/editor', request.url));
    
    // Create a Supabase client using the request and response
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name) {
            const cookie = request.cookies.get(name)?.value;
            console.log(`[Auth Callback] Reading cookie: ${name}=${cookie ? '(exists)' : '(not found)'}`);
            return cookie;
          },
          set(name, value, options) {
            console.log(`[Auth Callback] Setting cookie: ${name}=${value ? value.substring(0, 10) + '...' : '(empty)'}`);
            response.cookies.set({
              name,
              value,
              ...options,
            });
          },
          remove(name, options) {
            console.log(`[Auth Callback] Removing cookie: ${name}`);
            response.cookies.delete({
              name,
              ...options,
            });
          },
        },
      }
    );
    
    try {
      // Exchange the code for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      console.log(`[Auth Callback] Session exchange result:`, 
        error ? `ERROR: ${error.message}` : 
        `SUCCESS: User ${data?.session?.user?.id?.substring(0, 8) || 'unknown'}`
      );
      
      if (error) {
        console.error("[Auth Callback] Full error:", error);
      }
    } catch (err) {
      console.error("[Auth Callback] Exception during code exchange:", err);
    }
    
    return response;
  }
  
  // If no code, redirect to login
  console.log("[Auth Callback] No code provided, redirecting to login");
  return NextResponse.redirect(new URL('/login', request.url));
} 