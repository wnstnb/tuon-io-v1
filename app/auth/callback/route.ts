import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ArtifactService } from '@/app/lib/services/ArtifactService';
import { ConversationService } from '@/app/lib/services/ConversationService';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  
  console.log("[Auth Callback] Processing auth callback with code:", !!code);
  
  if (code) {
    const cookieStore = await cookies();
    let response: NextResponse;

    // Create a Supabase client initially using cookieStore (might not set cookies on response correctly)
    const supabaseInitial = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const cookie = cookieStore.get(name)?.value;
            // console.log(`[Auth Callback - Initial] Reading cookie: ${name}=${cookie ? '(exists)' : '(not found)'}`);
            return cookie;
          },
          set(name: string, value: string, options: CookieOptions) {
            // console.log(`[Auth Callback - Initial] Attempting to set cookie via store: ${name}`);
            // Setting via cookieStore might not attach to the final response
            try {
                cookieStore.set({ name, value, ...options });
            } catch (error) {
                console.error(`[Auth Callback - Initial] Failed to set cookie ${name} via store:`, error);
            }
          },
          remove(name: string, options: CookieOptions) {
            // console.log(`[Auth Callback - Initial] Attempting to remove cookie via store: ${name}`);
            try {
                cookieStore.set({ name, value: '', ...options });
            } catch (error) {
                console.error(`[Auth Callback - Initial] Failed to remove cookie ${name} via store:`, error);
            }
          },
        },
      }
    );

    let redirectUrl = '/editor';

    try {
      // Exchange the code for a session using the initial client
      const { data, error } = await supabaseInitial.auth.exchangeCodeForSession(code);
      console.log(`[Auth Callback] Session exchange result:`, 
        error ? `ERROR: ${error.message}` : 
        `SUCCESS: User ${data?.session?.user?.id?.substring(0, 8) || 'unknown'}`
      );
      
      if (error) {
        console.error("[Auth Callback] Full error during session exchange:", error);
        redirectUrl = '/login?error=auth_error';
      } else if (data.session) {
        const userId = data.session.user.id;
        console.log(`[Auth Callback] User authenticated: ${userId}`);

        // Check if user has existing conversations
        // Use a Supabase client configured for server-side actions if needed
        const existingConversations = await ConversationService.getUserConversations(userId);

        if (existingConversations.length === 0) {
          console.log(`[Auth Callback] First login or no existing conversations detected for user ${userId}. Creating initial artifact and conversation.`);
          try {
            // Create a new artifact
            const artifactTitle = 'Untitled Artifact';
            const artifactId = await ArtifactService.createArtifact(userId, artifactTitle);
            console.log(`[Auth Callback] Created artifact: ${artifactId}`);

            // Create a new conversation linked to the artifact
            const conversationTitle = 'New Conversation';
            const conversationId = await ConversationService.createConversation(userId, conversationTitle, artifactId);
            console.log(`[Auth Callback] Created conversation: ${conversationId}, linked to artifact: ${artifactId}`);

            // Redirect to the editor with the new artifact
            redirectUrl = `/editor/${artifactId}`;

          } catch (creationError) {
            console.error(`[Auth Callback] Error creating initial artifact/conversation for user ${userId}:`, creationError);
            // Fallback redirect to generic editor page even if creation failed
            redirectUrl = '/editor?error=initial_setup_failed';
          }
        } else {
           console.log(`[Auth Callback] Existing user ${userId} detected with ${existingConversations.length} conversations. Redirecting to default editor.`);
           // Keep default redirectUrl = '/editor'
        }
      } else {
         console.warn("[Auth Callback] Session exchange successful but no session data found.");
         redirectUrl = '/login?error=auth_issue';
      }
    } catch (err) {
      console.error("[Auth Callback] Exception during code exchange or initial setup:", err);
      redirectUrl = '/login?error=server_error';
    }
    
    // Create the response AFTER potential cookie operations and determining redirectUrl
    response = NextResponse.redirect(new URL(redirectUrl, request.url));

    // Re-setup Supabase client with the actual response object to ensure cookies are set correctly on redirect
    const supabaseForResponse = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { 
                    // Reading doesn't modify the response, can use cookieStore
                    return cookieStore.get(name)?.value 
                },
                set(name: string, value: string, options: CookieOptions) { 
                    // console.log(`[Auth Callback - Response] Setting cookie on response: ${name}`);
                    response.cookies.set({ name, value, ...options })
                },
                remove(name: string, options: CookieOptions) { 
                    // console.log(`[Auth Callback - Response] Removing cookie on response: ${name}`);
                    response.cookies.set({ name, value: '', ...options })
                },
            },
        }
    );

    // Attempt session exchange again using the response-aware client to set cookies correctly.
    try {
        const { error: sessionError } = await supabaseForResponse.auth.exchangeCodeForSession(code);
        if (sessionError) {
             console.error("[Auth Callback] Error during second exchangeCodeForSession (for cookie setting):", sessionError);
             // If session exchange fails here, the user might not be properly logged in despite initial success.
             // Consider redirecting back to login, but for now, just log it.
             // response = NextResponse.redirect(new URL('/login?error=cookie_error', request.url)); // Optionally force redirect
        } else {
            // console.log("[Auth Callback] Re-ran exchangeCodeForSession to set cookies on response object.");
        }
    } catch(cookieError) {
        console.error("[Auth Callback] Exception during second exchangeCodeForSession (for cookie setting):", cookieError);
        // Handle potential exceptions during cookie setting
    }

    return response;
  }
  
  // If no code, redirect to login
  console.log("[Auth Callback] No code provided, redirecting to login");
  return NextResponse.redirect(new URL('/login', request.url));
} 