import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create the supabase client using browser-compatible cookie handling
export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    cookies: {
      get(name) {
        if (typeof document === 'undefined') return '';
        const cookie = document.cookie
          .split('; ')
          .find((row) => row.startsWith(`${name}=`));
        return cookie ? cookie.split('=')[1] : '';
      },
      set(name, value, options) {
        if (typeof document === 'undefined') return;
        // Build the cookie string
        let cookieStr = `${name}=${value}`;
        if (options.expires) {
          cookieStr += `; expires=${options.expires.toUTCString()}`;
        }
        if (options.path) {
          cookieStr += `; path=${options.path}`;
        }
        if (options.domain) {
          cookieStr += `; domain=${options.domain}`;
        }
        if (options.sameSite) {
          cookieStr += `; samesite=${options.sameSite}`;
        }
        if (options.secure) {
          cookieStr += '; secure';
        }
        document.cookie = cookieStr;
      },
      remove(name, options) {
        if (typeof document === 'undefined') return;
        let cookieStr = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        if (options.path) {
          cookieStr += `; path=${options.path}`;
        }
        if (options.domain) {
          cookieStr += `; domain=${options.domain}`;
        }
        document.cookie = cookieStr;
      },
    },
  }
); 