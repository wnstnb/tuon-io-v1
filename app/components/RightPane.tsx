'use client';

import React, { useState } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { useAI, SearchHistoryItem, SearchResult } from '../context/AIContext';
import WebSearchInput from './WebSearchInput';

type Tab = 'search';

export default function RightPane() {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const { searchHistory, setSearchHistory } = useAI();

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handler for when a search is completed via WebSearchInput
  const handleSearchComplete = (results: SearchResult[], query: string) => {
    // Create a new search history item
    const searchItem: SearchHistoryItem = {
      id: Date.now().toString(), // Simple ID generation
      query,
      results,
      timestamp: new Date()
    };
    
    // Update the search history
    setSearchHistory(prev => [searchItem, ...prev]);
  };

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
            {/* Add the WebSearchInput component at the top */}
            <div className="web-search-container">
              <WebSearchInput onSearchComplete={handleSearchComplete} />
            </div>
            
            {/* Show search history */}
            {searchHistory.length > 0 ? (
              <div className="search-history">
                {searchHistory.map((item) => (
                  <div key={item.id} className="search-history-item">
                    <div className="search-query">
                      <Search size={14} />
                      <span>{item.query}</span>
                      <span className="search-timestamp">{formatDate(item.timestamp)}</span>
                    </div>
                    <div className="search-results">
                      {item.results.map((result, index) => (
                        <div key={index} className="search-result">
                          <a 
                            href={result.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="search-result-title"
                          >
                            {result.title}
                            <ExternalLink size={12} />
                          </a>
                          <div className="search-result-url">{result.url}</div>
                          <div className="search-result-snippet">{result.text.substring(0, 150)}...</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="search-placeholder">
                <span>No search history yet. Try searching in the box above.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 