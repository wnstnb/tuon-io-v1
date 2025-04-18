import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory store (Note: This is not suitable for production with multiple serverless instances)
// In production, this should be replaced with Redis or another distributed cache
const rateLimitStore = new Map<string, { count: number, timestamp: number }>();

// Configure rate limits for different paths
// Format: { [pathPrefix]: { limit: number, window: number in ms } }
const rateLimits = {
  // Authentication endpoints - strict limits to prevent brute force
  '/api/auth': { limit: 20, window: 60 * 1000 }, // 20 requests per minute

  // Data modification endpoints - moderate limits
  '/api/save-search': { limit: 30, window: 60 * 1000 }, // 30 requests per minute
  
  // Search and inferencing endpoints - more generous but still protected
  '/api/web-search': { limit: 30, window: 60 * 1000 }, // 30 requests per minute
  '/api/search-answer': { limit: 30, window: 60 * 1000 }, // 30 requests per minute
  '/api/infer-title': { limit: 30, window: 60 * 1000 }, // 30 requests per minute
  
  // Default for all other API routes
  'default': { limit: 60, window: 60 * 1000 }, // 60 requests per minute
};

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of Array.from(rateLimitStore.entries())) {
    const { timestamp, count } = data;
    // Get the matching limit config
    const pathPrefix = key.split('|')[0];
    const config = getRateLimitConfig(pathPrefix);
    
    // If the window has passed, remove the entry
    if (now - timestamp > config.window) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Extract a unique identifier from the request
 * Uses UserId for authenticated requests, IP for unauthenticated
 */
function getUserIdentifier(request: NextRequest): string {
  // Check for authentication header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // We don't decode the token here, just use it as an identifier
    // The actual token validation happens later in the API route handlers
    const token = authHeader.substring(7);
    return `user_${token.substring(0, 10)}`; // Just use a prefix of the token
  }
  
  // Get IP address
  let ip = request.headers.get('x-real-ip') || '';
  
  // Fallback to x-forwarded-for if no real IP (common in proxied environments)
  if (!ip) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '';
  }
  
  // Final fallback - NextRequest in Next.js 12+ doesn't have direct ip property
  // so we use a fallback string if we couldn't get the IP from headers
  if (!ip) {
    ip = 'unknown_ip';
  }
  
  return `ip_${ip}`;
}

/**
 * Get the rate limit configuration for a path
 */
function getRateLimitConfig(path: string): { limit: number, window: number } {
  // Check each path prefix to find a match
  for (const [prefix, config] of Object.entries(rateLimits)) {
    if (prefix !== 'default' && path.startsWith(prefix)) {
      return config;
    }
  }
  
  // Return default if no specific match
  return rateLimits.default;
}

/**
 * Check if a request exceeds the rate limit
 * Returns true if rate limited, false otherwise
 */
function checkRateLimit(
  identifier: string, 
  path: string, 
  config: { limit: number, window: number }
): { limited: boolean, remaining: number, resetTime: number } {
  const now = Date.now();
  const key = `${path}|${identifier}`;
  
  // Get current count or initialize
  const current = rateLimitStore.get(key) || { count: 0, timestamp: now };
  
  // If the window has passed, reset the counter
  if (now - current.timestamp > config.window) {
    current.count = 1;
    current.timestamp = now;
  } else {
    // Increment the counter
    current.count += 1;
  }
  
  // Store the updated count
  rateLimitStore.set(key, current);
  
  // Calculate remaining requests and reset time
  const remaining = Math.max(0, config.limit - current.count);
  const resetTime = current.timestamp + config.window;
  
  // Return true if rate limited
  return { 
    limited: current.count > config.limit,
    remaining,
    resetTime
  };
}

export async function middleware(request: NextRequest) {
  console.log(`[API Middleware] Processing request for ${request.nextUrl.pathname}`);
  
  // Get the path to determine which rate limit applies
  const path = request.nextUrl.pathname;
  
  // Get configuration based on path
  const config = getRateLimitConfig(path);
  
  // Get identifier (user ID or IP)
  const identifier = getUserIdentifier(request);
  
  // Check if rate limited
  const { limited, remaining, resetTime } = checkRateLimit(identifier, path, config);
  
  // Calculate reset header (seconds until window reset)
  const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);
  
  if (limited) {
    console.log(`[API Middleware] Rate limit exceeded for ${identifier} on ${path}`);
    
    // Return 429 Too Many Requests
    return new NextResponse('Too many requests', {
      status: 429,
      headers: {
        'Retry-After': resetSeconds.toString(),
        'X-RateLimit-Limit': config.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetTime.toString(),
        'Content-Type': 'text/plain',
      },
    });
  }
  
  // Proceed with the request but add rate limit headers
  const response = NextResponse.next();
  
  // Add rate limit headers to response
  response.headers.set('X-RateLimit-Limit', config.limit.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', resetTime.toString());
  
  return response;
}

// Apply this middleware only to API routes
export const config = {
  matcher: ['/api/:path*'],
}; 