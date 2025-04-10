'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { SearchResult } from '../context/AIContext';
import { supabase } from '../lib/supabase';

interface WebSearchInputProps {
  onSearchComplete?: (results: SearchResult[], query: string) => void;
}

export default function WebSearchInput({ onSearchComplete }: WebSearchInputProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Check for valid session first
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('You must be logged in to perform searches');
      }

      // 1. Perform the web search using the SearchService
      const { SearchService } = await import('../lib/services/SearchService');
      const searchResults = await SearchService.search(query, 5);

      // 2. Save the search to Supabase via the API
      const saveResponse = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          query: query,
          results: searchResults,
          search_provider: 'ExaSearch',
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        console.error('Search save error:', errorData);
        throw new Error(errorData.error || 'Failed to save search history');
      }

      // 3. Notify parent component of the search results if callback provided
      if (onSearchComplete) {
        onSearchComplete(searchResults, query);
      }

      // Clear the search input
      setQuery('');
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'An error occurred during search');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="web-search-input">
      <form onSubmit={handleSearch}>
        <div className="search-input-container">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the web..."
            disabled={isLoading}
            className="search-input"
          />
          <button 
            type="submit" 
            disabled={isLoading || !query.trim()} 
            className="search-button"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>
      {error && <p className="search-error">{error}</p>}
    </div>
  );
} 