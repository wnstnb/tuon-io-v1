'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global root layout error caught:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="global-error-container">
          <h2>Critical Error</h2>
          <p>Something went wrong with the application.</p>
          <button
            onClick={() => reset()}
            className="error-reset-button"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
} 