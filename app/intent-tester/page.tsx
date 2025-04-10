'use client';

import React from 'react';
import IntentTester from '../components/IntentTester';

export default function IntentTesterPage() {
  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Intent Analysis Testing Page</h1>
      <p className="text-center mb-8 max-w-2xl mx-auto">
        This page allows you to test the intent analysis agent, which determines whether AI responses 
        should be directed to the editor or conversation pane.
      </p>
      
      <IntentTester />
      
      <div className="mt-12 text-center">
        <a 
          href="/" 
          className="text-blue-500 hover:underline"
        >
          Back to Home
        </a>
      </div>
    </main>
  );
} 