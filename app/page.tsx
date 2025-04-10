'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Use dynamic import with SSR disabled for ThemeToggle
const ThemeToggle = dynamic(
  () => import('./components/ThemeToggle'),
  { ssr: false }
);

export default function LandingPage() {
  return (
    <main className="landing-container">
      <header className="landing-header">
        <div className="landing-header-content">
          <h1>tuon.io</h1>
          <div className="landing-header-actions">
            <Link href="/login" className="login-link">
              Sign In
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      
      <section className="hero-section">
        <div className="hero-content">
          <h1>Your IDE for everything</h1>
          <p className="hero-description">
            AI-powered content creation and management platform that stores your content in one place and empowers you to craft, enhance, and organize your work with precision.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="cta-button">
              Get Started
            </Link>
            <Link href="/intent-tester" className="cta-secondary ml-4">
              Try Intent Analysis
            </Link>
          </div>
        </div>
      </section>
      
      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} tuon.io. All rights reserved.</p>
      </footer>
    </main>
  );
} 