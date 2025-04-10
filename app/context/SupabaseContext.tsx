'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';

interface SupabaseContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check for an active session when the component mounts
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user || null);
        
        // If user is already logged in, redirect to editor with a slight delay
        if (session?.user && window.location.pathname === '/login') {
          console.log('User already logged in, preparing to redirect to /editor');
          // Add small delay to ensure session is fully established
          setTimeout(() => {
            console.log('Redirecting to /editor after session check');
            router.push('/editor');
          }, 300);
        }
      } catch (error) {
        console.error('Error checking auth session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        
        // Update local state
        setSession(session);
        setUser(session?.user || null);
        
        // Handle authentication events
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          // Allow session to fully persist before navigation
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Only redirect to /editor if we're currently on the login page to prevent redirect loops
          if (event === 'SIGNED_IN' && window.location.pathname === '/login') {
            console.log('User signed in, redirecting to /editor');
            router.push('/editor');
          }
        } else if (event === 'SIGNED_OUT') {
          // Clear local state
          console.log('User signed out, redirecting to /login');
          router.push('/login');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // Function to sign in with OTP via email
  const signIn = async (email: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to sign out
  const signOut = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SupabaseContext.Provider value={{ user, session, isLoading, signIn, signOut }}>
      {children}
    </SupabaseContext.Provider>
  );
}

// Custom hook to use the Supabase context
export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
} 