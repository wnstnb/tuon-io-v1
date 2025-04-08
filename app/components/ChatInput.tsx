'use client';

import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useAI } from '../context/AIContext';

export default function ChatInput() {
  const [message, setMessage] = useState('');
  const { sendMessage, isLoading } = useAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get accurate scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set height based on scrollHeight (content height)
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200 // Max height in pixels
      )}px`;
    }
  }, [message]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isLoading) return;
    
    const userMessage = message;
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    await sendMessage(userMessage);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="chat-input-container">
      <div className="textarea-container">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={isLoading}
          rows={1}
          className="chat-textarea"
        />
      </div>
      <button 
        type="submit" 
        disabled={!message.trim() || isLoading}
        className="send-button"
      >
        <Send size={18} />
      </button>
    </form>
  );
} 