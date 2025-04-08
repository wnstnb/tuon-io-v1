'use client';

import React from 'react';
import { useAI } from '../context/AIContext';
import { MessageSquare, Plus } from 'lucide-react';

export default function ChatHistory() {
  const { conversationHistory, selectConversation, createNewConversation, currentConversation } = useAI();

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
        {conversationHistory.length === 0 ? (
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