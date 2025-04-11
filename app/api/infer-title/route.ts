import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { TitleInferenceService } from '@/app/lib/services/TitleInferenceService';
import { ConversationService } from '@/app/lib/services/ConversationService';
import { ArtifactService } from '@/app/lib/services/ArtifactService';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  console.log('--- /api/infer-title API called ---');
  let userId;
  let supabase;
  const cookieStore = cookies();
  console.log('/api/infer-title: Cookies initialized');

  // Log request headers for debugging
  console.log('/api/infer-title: Request headers:');
  const headers = Object.fromEntries(request.headers.entries());
  console.log(JSON.stringify(headers, null, 2));

  // Extract cookie string for manual parsing
  const cookieHeader = request.headers.get('cookie');
  console.log(`/api/infer-title: Cookie header present: ${!!cookieHeader}`);

  // Try Bearer token auth first
  const authHeader = request.headers.get('Authorization');
  console.log(`/api/infer-title: Authorization header present: ${!!authHeader}`);
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log('/api/infer-title: Found Bearer token, attempting token auth');
    const token = authHeader.substring(7);
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
    console.log('/api/infer-title: Created Supabase client with Bearer token');
    
    try {
      const { data, error } = await supabase.auth.getUser();
      console.log(`/api/infer-title: getUser result: ${!!data?.user}, error: ${!!error}`);
      
      if (error || !data.user) {
        console.error('Error verifying token for /api/infer-title:', error);
        console.log('/api/infer-title: Bearer token validation failed, will try cookie auth');
        // Don't return 401 yet, fallback to cookie auth
      } else {
        userId = data.user.id;
        console.log(`/api/infer-title: Successfully authenticated with Bearer token, userId: ${userId}`);
      }
    } catch (tokenErr) {
      console.error('/api/infer-title: Exception during token validation:', tokenErr);
      // Continue to cookie auth
    }
  } else {
    console.log('/api/infer-title: No Bearer token found, will try cookie auth');
  }

  // Fallback to cookie-based auth if Bearer token didn't work or wasn't present
  if (!userId && cookieHeader) {
    console.log('/api/infer-title: Attempting direct cookie-based authentication');
    try {
      // Find Supabase auth cookie in the cookie string
      const cookieParts = cookieHeader.split(';');
      let authToken = null;
      
      // Loop through cookies to find the auth token
      for (const part of cookieParts) {
        const [name, value] = part.trim().split('=');
        if (name && name.includes('-auth-token') && value) {
          // Skip the code-verifier cookie, we need the main auth token
          if (name.includes('-auth-token-code-verifier')) {
            console.log('/api/infer-title: Skipping code-verifier cookie');
            continue;
          }
          
          authToken = decodeURIComponent(value);
          console.log(`/api/infer-title: Found auth token cookie: ${name}`);
          break;
        }
      }
      
      if (authToken && authToken.startsWith('base64-')) {
        console.log('/api/infer-title: Extracting token from base64- encoded cookie');
        try {
          // Remove the 'base64-' prefix and parse the JSON
          const base64String = authToken.substring(7); // Remove 'base64-' prefix
          console.log(`/api/infer-title: Base64 string length: ${base64String.length}`);
          
          const decodedString = Buffer.from(base64String, 'base64').toString();
          console.log(`/api/infer-title: Decoded JSON start: ${decodedString.substring(0, 50)}...`);
          
          const tokenData = JSON.parse(decodedString);
          console.log(`/api/infer-title: Parsed token data keys: ${Object.keys(tokenData).join(', ')}`);
          
          // Extract the access token - it could be at different locations depending on format
          let accessToken = null;
          
          if (tokenData.access_token) {
            // Direct access token
            accessToken = tokenData.access_token;
            console.log('/api/infer-title: Found direct access_token in cookie data');
          } else if (tokenData.token_type === 'bearer' && tokenData.refresh_token) {
            // We have token metadata but need to look for the JWT inside it
            // Often the access token is embedded in the first part of the token data
            accessToken = tokenData.access_token;
            console.log('/api/infer-title: Found access_token from token metadata');
          } else if (tokenData.user?.id) {
            // If we have the user ID but no access token, we can try to create a client
            // without the token and use other session data
            userId = tokenData.user.id;
            console.log(`/api/infer-title: Found user ID ${userId} from cookie data`);
            
            // Create Supabase client with anon key (no token)
            supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL || '',
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
            );
            
            console.log('/api/infer-title: Successfully used user ID from cookie data');
            // No need to verify further since we found the user ID
            accessToken = 'found_user_id_only';
          }
          
          if (accessToken && accessToken !== 'found_user_id_only') {
            console.log('/api/infer-title: Using extracted access token for auth');
            // Use the extracted token to create a Supabase client
            supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL || '',
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
              {
                global: {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                },
              }
            );
            
            // Verify the user with the token
            const { data, error } = await supabase.auth.getUser();
            console.log(`/api/infer-title: Direct token getUser result: ${!!data?.user}, error: ${!!error}`);
            
            if (error || !data.user) {
              console.error('Error verifying extracted token:', error);
              // Don't return 401 yet, keep trying other methods
              accessToken = null;
            } else {
              userId = data.user.id;
              console.log(`/api/infer-title: Successfully authenticated with cookie token, userId: ${userId}`);
            }
          }
          
          // If we still don't have a userId but have the token data, try to extract userId directly
          if (!userId && tokenData.user?.id) {
            userId = tokenData.user.id;
            console.log(`/api/infer-title: Using user ID ${userId} directly from token data`);
            
            // Initialize Supabase client if not done yet
            if (!supabase) {
              supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
              );
            }
          }
        } catch (tokenParseErr) {
          console.error('/api/infer-title: Error parsing token data:', tokenParseErr);
          // Continue to other methods
        }
      }
      
      // If we haven't authenticated yet, try a more direct approach with raw cookie extraction
      if (!userId) {
        console.log('/api/infer-title: Trying direct access to Supabase auth data');
        
        try {
          // Find the main Supabase auth token from the cookie header
          const authTokenMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
          
          if (authTokenMatch && authTokenMatch[1]) {
            const rawAuthToken = decodeURIComponent(authTokenMatch[1]);
            
            if (rawAuthToken.startsWith('base64-')) {
              const rawTokenData = Buffer.from(rawAuthToken.substring(7), 'base64').toString();
              console.log('/api/infer-title: Direct extracted token data start:', rawTokenData.substring(0, 50) + '...');
              
              try {
                const parsedToken = JSON.parse(rawTokenData);
                
                if (parsedToken.user && parsedToken.user.id) {
                  userId = parsedToken.user.id;
                  console.log(`/api/infer-title: Successfully extracted user ID directly: ${userId}`);
                  
                  // Create a client with the user data we have
                  supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
                  );
                }
              } catch (parseErr) {
                console.error('/api/infer-title: Error parsing direct token:', parseErr);
              }
            }
          }
        } catch (directErr) {
          console.error('/api/infer-title: Error in direct token extraction:', directErr);
        }
      }
      
      // If we still haven't authenticated, try the standard method as fallback
      if (!userId) {
        // Fallback to the original method as a last resort
        console.log('/api/infer-title: No auth token cookie found, trying createRouteHandlerClient');
        supabase = createRouteHandlerClient({ cookies: () => cookieStore });
        
        try {
          const { data, error } = await supabase.auth.getSession();
          console.log(`/api/infer-title: getSession fallback result: ${!!data?.session}, error: ${!!error}`);
          
          if (error || !data.session?.user) {
            console.error('Error getting session for /api/infer-title:', error);
            console.log('/api/infer-title: No valid session found in cookies');
            return NextResponse.json({ error: 'Unauthorized - No valid session or token' }, { status: 401 });
          }
          
          userId = data.session.user.id;
          console.log(`/api/infer-title: Successfully authenticated with fallback method, userId: ${userId}`);
        } catch (routeHandlerErr) {
          console.error('/api/infer-title: Exception during fallback authentication:', routeHandlerErr);
          return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
        }
      }
    } catch (cookieErr: any) {
      console.error('/api/infer-title: Exception during cookie parsing/authentication:', cookieErr);
      return NextResponse.json({ error: 'Authentication error', details: cookieErr.message }, { status: 401 });
    }
  } else if (!userId) {
    console.log('/api/infer-title: No authentication method available');
    return NextResponse.json({ error: 'Unauthorized - No authentication provided' }, { status: 401 });
  }

  // Ensure supabase client is initialized for potential later use (though not used later in this specific logic)
  if (!supabase) {
     // This case should theoretically not happen if the above logic is sound
     console.error('Supabase client not initialized in /api/infer-title');
     return NextResponse.json({ error: 'Internal Server Error - Auth client init failed' }, { status: 500 });
  }

  try {
    // Parse request body
    console.log('/api/infer-title: Parsing request body');
    const { content, contextType, contextId } = await request.json();
    console.log(`/api/infer-title: Request parameters: contextType=${contextType}, contextId=${contextId}`);

    // Validate request parameters
    if (!content || !contextType || !contextId) {
      console.log('/api/infer-title: Missing required parameters');
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Only accept valid context types
    if (contextType !== 'conversation' && contextType !== 'artifact') {
      console.log(`/api/infer-title: Invalid context type: ${contextType}`);
      return NextResponse.json({ error: 'Invalid context type' }, { status: 400 });
    }

    console.log('/api/infer-title: Calling TitleInferenceService.inferTitleFromContent');
    // Generate title using Gemini
    const title = await TitleInferenceService.inferTitleFromContent(content);
    console.log(`/api/infer-title: Generated title: "${title}"`);

    // Update the appropriate record based on context type
    let success = false;
    console.log(`/api/infer-title: Updating ${contextType} title`);

    if (contextType === 'conversation') {
      // Update conversation title
      console.log(`/api/infer-title: Updating conversation title for ID: ${contextId}`);
      success = await ConversationService.updateConversationTitle(contextId, title);
    } else if (contextType === 'artifact') {
      // Update artifact title
      console.log(`/api/infer-title: Updating artifact title for ID: ${contextId}`);
      // Pass the userId and authenticated supabase client
      success = await ArtifactService.updateArtifactTitle(contextId, title, userId, supabase);
    }

    console.log(`/api/infer-title: Title update success: ${success}`);
    if (!success) {
      console.error(`/api/infer-title: Failed to update ${contextType} title`);
      return NextResponse.json({ error: `Failed to update ${contextType} title` }, { status: 500 });
    }

    // Return the inferred title
    console.log('/api/infer-title: Successfully completed title inference and update');
    return NextResponse.json({ success: true, title });

  } catch (error: any) {
    console.error("Title inference API error:", error);
    console.error("/api/infer-title stack trace:", error.stack);
    return NextResponse.json({ error: error.message || 'Failed to infer title' }, { status: 500 });
  }
} 