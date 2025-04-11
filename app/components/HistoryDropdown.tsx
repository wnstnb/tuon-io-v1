'use client';

import React, { useState, useRef, useEffect } from 'react';
import { History, Search, X, Loader2 } from 'lucide-react';
import { useAI } from '../context/AIContext';

export default function HistoryDropdown() {
  const { conversationHistory, selectConversation, loadUserConversations } = useAI();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    // We rely on the AIContext to handle reloading when needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When conversations are loaded, update loading state
  useEffect(() => {
    if (conversationHistory.length > 0) {
      setIsLoadingConversations(false);
    }
  }, [conversationHistory]);

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    setSearchQuery(''); // Clear search when toggling
  };

  const filteredHistory = conversationHistory.filter(
    (conversation) => 
      conversation.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="history-dropdown" ref={dropdownRef}>
      <button 
        className="history-button"
        onClick={toggleDropdown}
        aria-label="Conversation History"
      >
        <History size={16} />
        <span className="history-button-text">History</span>
      </button>

      {isOpen && (
        <div className="dropdown-content dropdown-left">
          <div className="search-container">
            <Search size={14} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button 
              className="clear-button"
              onClick={() => setSearchQuery('')}
              style={{ visibility: searchQuery ? 'visible' : 'hidden' }}
            >
              <X size={14} />
            </button>
          </div>
          
          <div className="history-list">
            {isLoadingConversations ? (
              <div className="empty-history">
                <Loader2 size={24} className="spinner" />
                <p>Loading conversations...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="empty-history">
                <p>{searchQuery ? 'No matching conversations' : 'No conversations yet'}</p>
              </div>
            ) : (
              filteredHistory.map((conversation) => (
                <button
                  key={conversation.id}
                  className="history-item"
                  onClick={() => {
                    selectConversation(conversation.id);
                    setIsOpen(false);
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
        </div>
      )}
    </div>
  );
} 