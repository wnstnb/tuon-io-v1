'use client';

import React, { useEffect, useState } from 'react';
import { useAI } from '../context/AIContext';
import { MessageSquare, Plus, Loader2 } from 'lucide-react';

export default function ChatHistory() {
  const { conversationHistory, selectConversation, createNewConversation, currentConversation, loadUserConversations } = useAI();
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="chat-history">
      <button 
        className="new-chat-button"
        onClick={() => createNewConversation()}
      >
        <Plus size={16} />
        <span>New Chat</span>
      </button>
      
      <div className="history-list">
        {isLoadingConversations ? (
          <div className="empty-history">
            <Loader2 size={24} className="spinner" />
            <p>Loading conversations...</p>
          </div>
        ) : conversationHistory.length === 0 ? (
          <div className="empty-history">
            <p>No conversations yet</p>
          </div>
        ) : (
          conversationHistory.map((conversation) => (
            <button
              key={conversation.id}
              className={`history-item ${currentConversation?.id === conversation.id ? 'active' : ''}`}
              onClick={() => selectConversation(conversation.id)}
            >
              <MessageSquare size={16} />
              <div className="conversation-info">
                <span className="conversation-title">{conversation.title}</span>
                <span className="conversation-date">{formatDate(conversation.updatedAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
} 