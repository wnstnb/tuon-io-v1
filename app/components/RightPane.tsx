'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';

type Tab = 'search';

export default function RightPane() {
  const [activeTab, setActiveTab] = useState<Tab>('search');

  return (
    <div className="right-pane-container">
      {/* Tab navigation */}
      <div className="tabs-container">
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={16} />
          <span>Search</span>
        </button>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'search' && (
          <div className="tab-panel">
            <div className="search-placeholder">
              <span>Web search capability coming soon...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 