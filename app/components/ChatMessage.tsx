'use client';

import React from 'react';
import { Message } from '../context/AIContext';
import { User, Bot, ImageIcon } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hasImage = !!message.imageUrl;
  
  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'assistant-message'}`}>
      <div className="message-avatar">
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      <div className="message-content">
        <div className="message-bubble">
          {/* Display text content */}
          {message.content && message.content.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
          
          {/* Display image if present */}
          {hasImage && (
            <div className="message-image-container">
              <img 
                src={message.imageUrl} 
                alt="User uploaded image" 
                className="message-image"
                onClick={() => window.open(message.imageUrl, '_blank')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 