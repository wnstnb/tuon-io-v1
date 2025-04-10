'use client';

import React, { useState } from 'react';
import { MessageSquare, Files } from 'lucide-react';
import ChatInterface from './ChatInterface';
import FileExplorer from './FileExplorer';
import { useRouter, useSearchParams } from 'next/navigation';

type Tab = 'conversation' | 'fileExplorer';

export default function LeftPane() {
  const [activeTab, setActiveTab] = useState<Tab>('conversation');
  const searchParams = useSearchParams();
  const currentArtifactId = searchParams.get('artifactId') || undefined;

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
            <FileExplorer currentArtifactId={currentArtifactId} />
          </div>
        )}
      </div>
    </div>
  );
} 