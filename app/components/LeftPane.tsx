'use client';

import React, { useState } from 'react';
import { MessageSquare, Files, History } from 'lucide-react';
import ChatInterface from './ChatInterface';
import ChatHistory from './ChatHistory';

type Tab = 'conversation' | 'fileExplorer' | 'conversationHistory';

export default function LeftPane() {
  const [activeTab, setActiveTab] = useState<Tab>('conversation');

  return (
    <div className="left-pane-container">
      {/* Tab navigation */}
      <div className="tabs-container">
        <button
          className={`tab ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversation')}
        >
          <MessageSquare size={16} />
          <span>Conversation</span>
        </button>
        <button
          className={`tab ${activeTab === 'fileExplorer' ? 'active' : ''}`}
          onClick={() => setActiveTab('fileExplorer')}
        >
          <Files size={16} />
          <span>File Explorer</span>
        </button>
        <button
          className={`tab ${activeTab === 'conversationHistory' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversationHistory')}
        >
          <History size={16} />
          <span>History</span>
        </button>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'conversation' && (
          <div className="tab-panel">
            <ChatInterface />
          </div>
        )}
        {activeTab === 'fileExplorer' && (
          <div className="tab-panel">
            {/* File Explorer content will go here */}
            <p>File Explorer tab content</p>
          </div>
        )}
        {activeTab === 'conversationHistory' && (
          <div className="tab-panel">
            <ChatHistory />
          </div>
        )}
      </div>
    </div>
  );
} 