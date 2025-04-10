'use client';

import React, { useState } from 'react';
import { IntentAgentService, IntentAnalysisResult } from '../lib/services/IntentAgentService';

const IntentTester: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<IntentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  const analyzeIntent = async () => {
    if (!userInput.trim()) {
      setError('Please enter some text to analyze');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    
    try {
      // Call the IntentAgentService to analyze the user input
      const analysisResult = await IntentAgentService.analyzeIntent(userInput, {
        // You can add editor context here if needed
        currentFile: 'example.tsx',
      });
      
      // Log the result to console for debugging
      console.log('Intent analysis result:', analysisResult);
      
      // Update state with the result
      setResult(analysisResult);
    } catch (err) {
      console.error('Error analyzing intent:', err);
      setError('Failed to analyze intent: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg max-w-xl mx-auto my-8">
      <h2 className="text-xl font-bold mb-4">Intent Analysis Tester</h2>
      
      <div className="mb-4">
        <label className="block mb-2">
          Enter instruction to analyze:
          <textarea
            className="w-full p-2 border rounded mt-1"
            rows={5}
            value={userInput}
            onChange={handleInputChange}
            placeholder="Type an instruction like 'Create a React component' or 'Explain how promises work'"
          />
        </label>
      </div>
      
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        onClick={analyzeIntent}
        disabled={isAnalyzing || !userInput.trim()}
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze Intent'}
      </button>
      
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {result && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Analysis Result:</h3>
          <div className="bg-gray-100 p-3 rounded">
            <p><strong>Destination:</strong> <span className={result.destination === 'EDITOR' ? 'text-green-600' : 'text-blue-600'}>{result.destination}</span></p>
            <p><strong>Confidence:</strong> {(result.confidence * 100).toFixed(1)}%</p>
            <p><strong>Reasoning:</strong> {result.reasoning}</p>
            
            {result.metadata && Object.keys(result.metadata).length > 0 && (
              <div className="mt-2">
                <p><strong>Metadata:</strong></p>
                <pre className="text-xs mt-1 bg-gray-200 p-2 rounded overflow-x-auto">
                  {JSON.stringify(result.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="mt-6 text-sm text-gray-500">
        <p>This component tests the Intent Analysis Agent.</p>
        <p>It helps determine if the AI should output to the editor or conversation pane.</p>
      </div>
    </div>
  );
};

export default IntentTester; 