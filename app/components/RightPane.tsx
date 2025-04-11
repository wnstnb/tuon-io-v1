'use client';

import React, { useState, useEffect } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { useAI, SearchHistoryItem, SearchResult } from '../context/AIContext';
import WebSearchInput from './WebSearchInput';

type Tab = 'search';

export default function RightPane() {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const { searchHistory, setSearchHistory } = useAI();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Effect to expand the most recent search item by default
  useEffect(() => {
    if (searchHistory.length > 0 && !expandedItems.hasOwnProperty(searchHistory[0].id)) {
      setExpandedItems(prev => ({
        ...prev,
        [searchHistory[0].id]: true // Expand first item by default
      }));
    }
  }, [searchHistory]); // Dependency on searchHistory

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
    // Reset expanded state: only the new item is expanded
    setExpandedItems({ [searchItem.id]: true });
  };

  // Function to toggle the expanded state of an item
  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id] // Toggle the state
    }));
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
                {searchHistory.map((item, index) => {
                  // Determine if the current item is expanded
                  const isExpanded = expandedItems[item.id] ?? false; // Default to collapsed unless explicitly expanded
                  
                  return (
                    <div key={item.id} className="search-history-item">
                      {/* Make the query section clickable */}
                      <button
                        className="search-query-button" // Use a button for accessibility
                        onClick={() => toggleExpand(item.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`search-results-${item.id}`}
                      >
                        {/* Show ChevronDown if expanded, ChevronRight if collapsed */}
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Search size={14} className="query-icon" />
                        <span className="query-text">{item.query}</span>
                        <span className="search-timestamp">{formatDate(item.timestamp)}</span>
                      </button>
                      {/* Conditionally render the search results */}
                      {isExpanded && (
                        <div className="search-results" id={`search-results-${item.id}`}>
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
                      )}
                    </div>
                  );
                })}
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