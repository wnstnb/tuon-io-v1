import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import React from 'react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './globals.css';
import './styles/components/file-explorer.css';
import 'react-toastify/dist/ReactToastify.css';
import ClientProviders from './context/ClientProviders';
import { ToastContainer, Flip } from 'react-toastify';

const inter = Inter({ subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '700'] 
});

export const metadata: Metadata = {
  title: 'tuon.io',
  description: 'AI-powered content creation and management platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${jetbrainsMono.variable}`}>
        <ClientProviders>
          {children}
          <ToastContainer
            position="bottom-center"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick={false}
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
            transition={Flip}
          />
        </ClientProviders>
      </body>
    </html>
  );
} 