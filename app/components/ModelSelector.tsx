'use client';

import React from 'react';
import { useAI, AIModelType } from '../context/AIContext';

const modelOptions: { value: AIModelType; label: string }[] = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-o3-mini', label: 'GPT-3.5 Mini' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro' },
];

export default function ModelSelector() {
  const { currentModel, switchModel, isLoading } = useAI();
  
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value as AIModelType;
    switchModel(newModel);
  };
  
  return (
    <div className="model-selector">
      <select 
        value={currentModel}
        onChange={handleModelChange}
        disabled={isLoading}
        className="model-select"
      >
        {modelOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
} 