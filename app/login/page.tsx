'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

// Dynamically import the Auth component with SSR disabled
const AuthUI = dynamic(
  () => import('../components/AuthUI'),
  { ssr: false }
);

export default function Login() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectAttempted = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      if (redirectAttempted.current) return;
      
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log("Login page session check:", !!session, session?.user?.id?.substring(0, 8));
        
        setSession(session);
        
        if (session?.user && !isRedirecting) {
          console.log("Session found in login page, setting redirect flag");
          setIsRedirecting(true);
          redirectAttempted.current = true;
          router.replace('/editor');
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error checking session in login page:", error);
        setIsLoading(false);
      }
    };
    
    checkSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed in login page:", _event);
      setSession(session);
      
      if (session && !redirectAttempted.current && !isRedirecting) {
        console.log("Session detected in login page auth change");
        setIsRedirecting(true);
        redirectAttempted.current = true;
        router.replace('/editor');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, isRedirecting]);

  if (isLoading || isRedirecting) {
    return <div className="login-container">
      {isRedirecting ? "Redirecting to editor..." : "Checking authentication status..."}
    </div>;
  }
  
  return (
    <div className="login-container">
      <div className="login-form-wrapper">
        <h1>tuon.io</h1>
        <h2>Sign in to your account</h2>
        <AuthUI />
      </div>
    </div>
  );
} 