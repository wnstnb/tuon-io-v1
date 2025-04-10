import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const requestBody = await request.json();
  const { query, results, search_provider = 'ExaSearch' } = requestBody;

  if (!query || !results) {
    return NextResponse.json({ error: 'Missing query or results' }, { status: 400 });
  }

  // Get auth token from header if provided
  const authHeader = request.headers.get('Authorization');
  let userId;
  let supabase;

  try {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // If there's a Bearer token, create a client with the token
      const token = authHeader.substring(7);
      
      // Create a Supabase client with the provided token
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      );
      
      // Verify the user
      const { data, error } = await supabase.auth.getUser();
      
      if (error || !data.user) {
        console.error('Error verifying token:', error);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      userId = data.user.id;
    } else {
      // Fall back to cookie-based session - properly awaited
      const cookieStore = cookies();
      supabase = createRouteHandlerClient({ cookies: () => cookieStore });
      
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      userId = session.user.id;
    }

    // Store the search in Supabase
    const { error } = await supabase
      .from('web_searches')
      .insert({
        user_id: userId,
        query: query,
        results: results,
        search_provider: search_provider,
      });

    if (error) {
      console.error('Error saving web search:', error);
      return NextResponse.json({ error: 'Failed to save search: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Exception in web search API:', error);
    return NextResponse.json({ error: 'Server error processing search' }, { status: 500 });
  }
} 