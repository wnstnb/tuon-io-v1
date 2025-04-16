'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, History } from 'lucide-react';
import { ArtifactService } from '../lib/services/ArtifactService';
import { useAI } from '../context/AIContext';
import { groupBy } from 'lodash-es';
import { useSupabase } from '../context/SupabaseContext';

interface SearchResult {
  id: string;
  title: string;
  type: 'artifact' | 'conversation';
  preview?: string;
  hasContent: boolean;
}

export default function GlobalSearch() {
  const { 
    conversationHistory, 
    selectConversation, 
    isLoadingConversations
  } = useAI();
  const { session } = useSupabase();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentItems, setRecentItems] = useState<SearchResult[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
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
        preview: artifact.preview || 'No preview available',
        hasContent: true // Artifacts always have content
      }));
      
      // Add matching conversations
      const conversationResults = conversationHistory
        .filter(conversation => 
          conversation.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(conversation => ({
          id: conversation.id,
          title: conversation.title,
          type: 'conversation' as const,
          preview: conversation.messages && conversation.messages.length > 0 
            ? conversation.messages[0].content.substring(0, 60) + '...' 
            : 'Empty conversation',
          hasContent: (conversation.messages && conversation.messages.length > 0) ? true : false
        }))
        // Sort conversations to prioritize those with content
        .sort((a, b) => {
          // First sort by content (non-empty first)
          if (a.hasContent && !b.hasContent) return -1;
          if (!a.hasContent && b.hasContent) return 1;
          // Then sort alphabetically by title
          return a.title.localeCompare(b.title);
        });
      
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
      if (query) {
        searchItems(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);
  
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

  // Group results by type
  const groupedResults = groupBy(results, 'type');

  // Function to load recent items
  const loadRecentItems = useCallback(async () => {
    if (isLoadingRecents) return;
    setIsLoadingRecents(true);
    const userId = session?.user?.id;

    if (!userId) {
      console.warn('No user ID found, cannot load recent items.');
      setRecentItems([]);
      setIsLoadingRecents(false);
      return;
    }

    try {
      // Fetch recent artifacts
      const recentArtifacts = await ArtifactService.getRecentArtifacts(userId);
      const artifactResults = recentArtifacts.map(artifact => ({
        id: artifact.id,
        title: artifact.title,
        type: 'artifact' as const,
        preview: artifact.preview,
        hasContent: true // Artifacts always have content
      }));

      // Get recent conversations (already sorted by update time in useAI hook? Assuming yes)
      const recentConversations = conversationHistory
        .map(conversation => ({
          id: conversation.id,
          title: conversation.title,
          type: 'conversation' as const,
          preview: conversation.messages && conversation.messages.length > 0
            ? conversation.messages[0].content.substring(0, 60) + '...'
            : 'Empty conversation',
          hasContent: (conversation.messages && conversation.messages.length > 0) ? true : false
        }))
        // Sort to prioritize conversations with content
        .sort((a, b) => {
          // First sort by content (non-empty first)
          if (a.hasContent && !b.hasContent) return -1;
          if (!a.hasContent && b.hasContent) return 1;
          // Then maintain original order (which should be by recent update)
          return 0;
        })
        .slice(0, 5); // Take top 5 after sorting

      setRecentItems([...artifactResults, ...recentConversations]);
    } catch (error) {
      console.error('Error loading recent items:', error);
      setRecentItems([]);
    } finally {
      setIsLoadingRecents(false);
    }
  }, [conversationHistory, isLoadingRecents, session]);

  // Group recent items by type
  const groupedRecentItems = groupBy(recentItems, 'type');

  // Handle focus - load recents if query is empty
  const handleFocus = () => {
    setShowResults(true);
    if (!query) {
      loadRecentItems();
    }
  };

  return (
    <div className="global-search-container" ref={searchRef}>
      <div className="search-icon">
        <Search size={16} />
      </div>
      <input 
        type="text" 
        className="global-search-input" 
        placeholder="Search artifacts & conversations..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        aria-label="Search for conversations and artifacts"
      />
      <div className="search-shortcut">Ctrl K</div>
      
      {showResults && (
        <div className="search-results-dropdown">
          {/* Conditional Rendering: Show Recents or Search Results */}
          {query ? (
            // SEARCH RESULTS (when query exists)
            isSearching ? (
              <div className="search-loading">Searching...</div>
            ) : results.length > 0 ? (
              <div className="grouped-search-results">
                {/* Render Artifacts section */}
                {groupedResults.artifact && groupedResults.artifact.length > 0 && (
                  <div className="results-group">
                    <h4 className="results-group-header">Artifacts</h4>
                    <ul className="search-results-list">
                      {groupedResults.artifact.map((result) => (
                        <li 
                          key={result.id} 
                          className="search-result-item"
                          onClick={() => handleResultClick(result)}
                        >
                          <div className="result-type">📄</div>
                          <div className="result-content">
                            <div className="result-title">{result.title}</div>
                            <div className="result-preview">{result.preview}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Render Conversations section */}
                {groupedResults.conversation && groupedResults.conversation.length > 0 && (
                  <div className="results-group">
                    <h4 className="results-group-header">Conversations</h4>
                    <ul className="search-results-list">
                      {groupedResults.conversation.map((result) => (
                        <li 
                          key={result.id} 
                          className="search-result-item"
                          onClick={() => handleResultClick(result)}
                        >
                          <div className="result-type">💬</div>
                          <div className="result-content">
                            <div className="result-title">{result.title}</div>
                            <div className="result-preview">{result.preview}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-results">No results found for "{query}"</div>
            )
          ) : (
            // RECENT ITEMS (when query is empty)
            isLoadingRecents ? (
              <div className="search-loading">Loading recent items...</div>
            ) : recentItems.length > 0 ? (
              <div className="grouped-search-results">
                {/* Render Recent Artifacts section */}
                {groupedRecentItems.artifact && groupedRecentItems.artifact.length > 0 && (
                  <div className="results-group">
                    <h4 className="results-group-header">Recent Artifacts</h4>
                    <ul className="search-results-list">
                      {groupedRecentItems.artifact.map((item) => (
                        <li 
                          key={item.id} 
                          className="search-result-item"
                          onClick={() => handleResultClick(item)}
                        >
                          <div className="result-type">📄</div>
                          <div className="result-content">
                            <div className="result-title">{item.title}</div>
                            <div className="result-preview">{item.preview}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Render Recent Conversations section */}
                {groupedRecentItems.conversation && groupedRecentItems.conversation.length > 0 && (
                  <div className="results-group">
                    <h4 className="results-group-header">Recent Conversations</h4>
                    <ul className="search-results-list">
                      {groupedRecentItems.conversation.map((item) => (
                        <li 
                          key={item.id} 
                          className="search-result-item"
                          onClick={() => handleResultClick(item)}
                        >
                          <div className="result-type">💬</div>
                          <div className="result-content">
                            <div className="result-title">{item.title}</div>
                            <div className="result-preview">{item.preview}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="search-placeholder">
                No recent items found. Start typing to search.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
} 