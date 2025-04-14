'use client';

import React from 'react';
import ChatInterface from './ChatInterface';

export default function RightPane() {
  return (
    <div className="right-pane-container">
      <div className="tab-content">
        <div className="tab-panel active">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
} 