'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error caught:', error);
  }, [error]);

  return (
    <div className="error-container">
      <h2>Something went wrong!</h2>
      <p>An unexpected error has occurred. Please try again.</p>
      <button
        onClick={() => reset()}
        className="error-reset-button"
      >
        Try again
      </button>
    </div>
  );
} 