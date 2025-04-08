'use client';

import React from 'react';
import { ThemeProvider } from './ThemeContext';
import { AIProvider } from './AIContext';
import { SupabaseProvider } from './SupabaseContext';
import dynamic from 'next/dynamic';

// Import SessionDebug component with SSR disabled
const SessionDebug = dynamic(
  () => import('../components/SessionDebug'),
  { ssr: false }
);

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SupabaseProvider>
        <AIProvider>
          {children}
          <SessionDebug />
        </AIProvider>
      </SupabaseProvider>
    </ThemeProvider>
  );
} 