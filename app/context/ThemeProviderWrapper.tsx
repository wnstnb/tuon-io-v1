'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ThemeProviderClient = dynamic(
  () => import('./ThemeContext').then(mod => ({ default: mod.ThemeProvider })),
  { ssr: false }
);

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProviderClient>{children}</ThemeProviderClient>;
} 