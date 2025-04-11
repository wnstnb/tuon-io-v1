'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, History } from 'lucide-react';
import { ArtifactService } from '../lib/services/ArtifactService';
import { useAI } from '../context/AIContext';

interface SearchResult {
  id: string;
  title: string;
  type: 'artifact' | 'conversation';
  preview?: string;
}

export default function GlobalSearch() {
  const { conversationHistory, selectConversation, loadUserConversations } = useAI();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [activeTab, setActiveTab] = useState<'search' | 'history'>('search');
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Load conversations when component mounts
  useEffect(() => {
    const loadConversations = async () => {
      try {
        setIsLoadingConversations(true);
        await loadUserConversations();
      } catch (error) {
        console.error('Error loading conversations:', error);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    loadConversations();
  }, [loadUserConversations]);

  // When conversations are loaded, update loading state
  useEffect(() => {
    if (conversationHistory.length > 0) {
      setIsLoadingConversations(false);
    }
  }, [conversationHistory]);
  
  // Handle clicks outside the search component to close results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard shortcut (Ctrl+K) to focus search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        const input = document.querySelector('.global-search-input') as HTMLInputElement;
        if (input) {
          input.focus();
          setShowResults(true);
        }
      }
      
      // Close on escape
      if (event.key === 'Escape') {
        setShowResults(false);
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Search function
  const searchItems = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Search artifacts
      const artifacts = await ArtifactService.searchArtifacts(searchQuery);
      
      // Convert artifacts to search results
      const artifactResults = artifacts.map(artifact => ({
        id: artifact.id,
        title: artifact.title || 'Untitled Artifact',
        type: 'artifact' as const,
        preview: artifact.preview || 'No preview available'
      }));
      
      // Add matching conversations
      const conversationResults = conversationHistory
        .filter(conversation => 
          conversation.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(conversation => ({
          id: conversation.id,
          title: conversation.title,
          type: 'conversation' as const,
          preview: conversation.messages.length > 0 
            ? conversation.messages[0].content.substring(0, 60) + '...' 
            : 'Empty conversation'
        }));
      
      setResults([...artifactResults, ...conversationResults]);
    } catch (error) {
      console.error('Error searching:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query && activeTab === 'search') {
        searchItems(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activeTab]);
  
  // Filter conversations based on search query in history tab
  const filteredConversations = conversationHistory.filter(
    conversation => conversation.title.toLowerCase().includes(query.toLowerCase())
  );

  // Handle selecting a result
  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'artifact') {
      // Navigate to artifact
      router.push(`/editor?artifactId=${result.id}`);
      
      // Also dispatch a custom event for components listening for artifact selection
      const event = new CustomEvent('artifactSelected', { 
        detail: { artifactId: result.id } 
      });
      window.dispatchEvent(event);
    } else {
      // Handle conversation selection
      selectConversation(result.id);
    }
    
    setShowResults(false);
    setQuery('');
  };
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="global-search-container" ref={searchRef}>
      <div className="search-icon">
        <Search size={16} />
      </div>
      <input 
        type="text" 
        className="global-search-input" 
        placeholder={activeTab === 'search' ? "Search docs" : "Search conversations..."}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setShowResults(true)}
        aria-label="Search for conversations and artifacts"
      />
      <div className="search-shortcut">Ctrl K</div>
      
      {showResults && (
        <div className="search-results-dropdown">
          <div className="search-tabs">
            <button 
              className={`search-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <Search size={14} />
              <span>Search</span>
            </button>
            <button 
              className={`search-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={14} />
              <span>History</span>
            </button>
          </div>
          
          {activeTab === 'search' ? (
            // SEARCH TAB CONTENT
            <>
              {isSearching ? (
                <div className="search-loading">Searching...</div>
              ) : results.length > 0 ? (
                <ul className="search-results-list">
                  {results.map((result) => (
                    <li 
                      key={result.id} 
                      className="search-result-item"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="result-type">
                        {result.type === 'artifact' ? '📄' : '💬'}
                      </div>
                      <div className="result-content">
                        <div className="result-title">{result.title}</div>
                        <div className="result-preview">{result.preview}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : query ? (
                <div className="no-results">No results found</div>
              ) : (
                <div className="search-placeholder">
                  Start typing to search for artifacts and conversations
                </div>
              )}
            </>
          ) : (
            // HISTORY TAB CONTENT
            <div className="history-list">
              {isLoadingConversations ? (
                <div className="empty-history">
                  <Loader2 size={24} className="spinner" />
                  <p>Loading conversations...</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="empty-history">
                  <p>{query ? 'No matching conversations' : 'No conversations yet'}</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    className="history-item"
                    onClick={() => {
                      selectConversation(conversation.id);
                      setShowResults(false);
                    }}
                  >
                    <div className="conversation-info">
                      <span className="conversation-title">{conversation.title}</span>
                      <span className="conversation-date">{formatDate(conversation.updatedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 