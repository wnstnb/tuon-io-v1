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
      <div className="chat-header">
        <div className="header-button-container">
          <button 
            className="new-chat-button"
            onClick={() => createNewConversation()}
            aria-label="New Conversation"
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>
        <div className="header-button-container">
          <ModelSelector />
        </div>
      </div>
      
      <div className="chat-messages">
        {!currentConversation || currentConversation.messages.length === 0 ? (
          <div className="empty-chat">
            <h3>Start a new conversation</h3>
            <p>Select a model and send a message to begin</p>
            <p className="chat-tips">
              <strong>Tip:</strong> You can upload images using the image button or by pasting them directly (Ctrl+V)
            </p>
          </div>
        ) : (
          <>
            {currentConversation.messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            {isLoading && (
              <div className="loading-indicator">
                <Loader2 size={24} className="spinner" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      <div className="chat-input-wrapper">
        <ChatInput />
      </div>
    </div>
  );
} 