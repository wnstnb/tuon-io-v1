import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import React from 'react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './globals.css';
import { ThemeProviderWrapper } from './context/ThemeProviderWrapper';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'tuon.io - Your IDE for everything',
  description: 'AI-powered content creation and management platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProviderWrapper>
          {children}
        </ThemeProviderWrapper>
      </body>
    </html>
  );
} 