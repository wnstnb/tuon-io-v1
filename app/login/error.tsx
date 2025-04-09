'use client';

import { useEffect } from 'react';

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Login page error caught:', error);
  }, [error]);

  return (
    <div className="login-error-container">
      <h2>Login Error</h2>
      <p>There was a problem with the login page. Please try again.</p>
      <button
        onClick={() => reset()}
        className="error-reset-button"
      >
        Try again
      </button>
    </div>
  );
} 