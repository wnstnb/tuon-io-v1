'use client';

import React, { useRef, useEffect } from 'react';
import { useAI } from '../context/AIContext';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ModelSelector from './ModelSelector';
import { Loader2, Plus } from 'lucide-react';

export default function ChatInterface() {
  const { currentConversation, isLoading, createNewConversation } = useAI();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages]);

  return (
    <div className="chat-interface">
      {/* Chat messages are always rendered now (if data exists) */}
      <div className="chat-messages">
        {/* Display loading indicator specifically when messages are being loaded */}
        {isLoading && (!currentConversation || !currentConversation.messages) && (
          <div className="loading-indicator initial-load">
            <Loader2 size={24} className="spinner" />
            <p>Loading messages...</p>
          </div>
        )}

        {/* Display empty state only if not loading and no messages exist */}
        {!isLoading && (!currentConversation || !currentConversation.messages || currentConversation.messages.length === 0) ? (
          <div className="empty-chat">
            <h3>Start a new conversation</h3>
            <p>Select a model and send a message to begin</p>
            <p className="chat-tips">
              <strong>Tip:</strong> You can upload images using the image button or by pasting them directly (Ctrl+V)
            </p>
          </div>
        ) : (
          /* Render messages only if they exist */
          currentConversation && currentConversation.messages && (
            <>
              {currentConversation.messages.map((message, index) => (
                <ChatMessage key={index} message={message} />
              ))}
              {/* Show spinner for subsequent loading (e.g., waiting for AI response) */}
              {isLoading && currentConversation.messages.length > 0 && (
                <div className="loading-indicator">
                  <Loader2 size={24} className="spinner" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )
        )}
      </div>
      
      {/* Chat Input is now conditionally rendered/styled by parent */}
      {/* Keep wrapper for potential future features within chat interface */}
      <div className="chat-input-wrapper">
        {/* Render ChatInput here, CSS will hide wrapper when panel is collapsed */}
        <ChatInput /> 
      </div>
    </div>
  );
} 