'use client';

import React from 'react';
import { ThemeProvider } from './ThemeContext';
import { AIProvider } from './AIContext';
import { SupabaseProvider } from './SupabaseContext';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SupabaseProvider>
        <AIProvider>
          {children}
        </AIProvider>
      </SupabaseProvider>
    </ThemeProvider>
  );
} 