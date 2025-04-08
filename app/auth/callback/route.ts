import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  
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
    
    // Exchange the code for a session
    await supabase.auth.exchangeCodeForSession(code);
    
    return response;
  }
  
  // If no code, redirect to login
  return NextResponse.redirect(new URL('/login', request.url));
} 