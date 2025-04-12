'use client';

import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { Send, Image, Search } from 'lucide-react';
import { useAI, EditorContext, SearchOptions } from '../context/AIContext';
import { Block } from '@blocknote/core';

// Optional prop to receive editor context from parent components
interface ChatInputProps {
  editorContext?: EditorContext;
}

export default function ChatInput({ editorContext: initialEditorContext }: ChatInputProps = {}) {
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { sendMessage, isLoading } = useAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

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

  // Add event listener for paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isLoading) return;
      
      // Check if we're pasting into the textarea or its parent
      if (
        e.target === textareaRef.current || 
        textareaRef.current?.contains(e.target as Node)
      ) {
        // Check if clipboard has images
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault(); // Prevent default paste behavior for images
            
            const file = items[i].getAsFile();
            if (!file) continue;
            
            // Check file size (limit to 10MB)
            if (file.size > 10 * 1024 * 1024) {
              alert('Image size should be less than 10MB');
              return;
            }
            
            setSelectedImage(file);
            
            // Create a preview
            const reader = new FileReader();
            reader.onload = (e) => {
              setImagePreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
            
            // Don't break the loop because we want text too if available
          }
        }
      }
    };

    // Add the event listener to the window
    window.addEventListener('paste', handlePaste);
    
    // Clean up
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isLoading]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Check if file is an image
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Check file size (limit to 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Image size should be less than 10MB');
        return;
      }
      
      setSelectedImage(file);
      
      // Create a preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear selected image
  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Function to request editor content (now expects markdown)
  const requestEditorMarkdown = () => {
    return new Promise<string | undefined>((resolve) => {
      // Set up a one-time listener for the response
      const handleContentResponse = (event: CustomEvent) => {
        if (event.detail && typeof event.detail.markdown === 'string') {
          console.log('ChatInput received editor markdown content.');
          resolve(event.detail.markdown);
        } else if (event.detail && event.detail.error) {
          console.error('ChatInput: Error receiving editor content:', event.detail.error);
          resolve(undefined); // Resolve with undefined on error
        } else {
          console.warn('ChatInput: Received unexpected contentResponse format.', event.detail);
          resolve(undefined);
        }
        window.removeEventListener('editor:contentResponse', handleContentResponse as EventListener);
      };
      
      // Listen for the response
      window.addEventListener('editor:contentResponse', handleContentResponse as EventListener);
      
      // Request the content
      const requestEvent = new CustomEvent('editor:requestContent');
      window.dispatchEvent(requestEvent);
      console.log('ChatInput dispatched requestContent event.');
      
      // Set a timeout in case we don't get a response
      setTimeout(() => {
        window.removeEventListener('editor:contentResponse', handleContentResponse as EventListener);
        console.warn('ChatInput: Timeout waiting for editor contentResponse.');
        resolve(undefined); // Resolve with undefined on timeout
      }, 1000); // Increased timeout slightly
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !selectedImage) || isLoading) return;
    
    const userMessage = message;
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    // Capture current editor content as markdown before sending message
    const editorMarkdown = await requestEditorMarkdown();
    
    // Prepare enhanced editor context with markdown string
    const enhancedEditorContext: EditorContext = {
      ...initialEditorContext,
      markdown: editorMarkdown // Add the markdown string
    };
    
    // Check if this is a search request (starts with /search)
    const isSearchRequest = userMessage.trim().startsWith('/search');
    
    // Handle message with image
    if (selectedImage) {
      const imageDataUrl = imagePreview;
      clearSelectedImage();
      // Pass the context with markdown
      await sendMessage(userMessage, imageDataUrl, enhancedEditorContext);
    } else if (isSearchRequest) {
      // Extract the search query (everything after /search)
      const searchQuery = userMessage.trim().substring('/search'.length).trim();
      if (searchQuery) {
        // Call sendMessage with search flag, query, and context with markdown
        await sendMessage(userMessage, null, enhancedEditorContext, { isSearch: true, searchQuery });
      } else {
        // Empty search query, handle as normal message with context
        await sendMessage(userMessage, null, enhancedEditorContext);
      }
    } else {
      // Normal message (not search) with context
      await sendMessage(userMessage, null, enhancedEditorContext);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Check for search mode when message changes
  useEffect(() => {
    setIsSearchMode(message.trim().startsWith('/search'));
  }, [message]);

  return (
    <div className={`chat-input-container ${isSearchMode ? 'search-mode' : ''}`}>
      <form onSubmit={handleSubmit} className="chat-input-form">
        {/* Display search indicator when in search mode */}
        {isSearchMode && (
          <div className="search-indicator">
            <Search size={16} />
            <span>Web Search Mode</span>
          </div>
        )}
        
        {/* Selected image preview */}
        {imagePreview && (
          <div className="image-preview-container">
            <img src={imagePreview} alt="Preview" className="image-preview" />
            <button 
              type="button" 
              className="clear-image-btn"
              onClick={clearSelectedImage}
              aria-label="Clear selected image"
            >
              &times;
            </button>
          </div>
        )}
        <div className="input-wrapper">
          <div className="textarea-container">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message or paste an image..."
              disabled={isLoading}
              rows={1}
              className="chat-textarea"
            />
          </div>
          <div className="input-buttons">
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="image-button"
              disabled={isLoading}
              aria-label="Upload image"
            >
              <Image size={18} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button 
              type="submit" 
              disabled={(!message.trim() && !selectedImage) || isLoading}
              className="send-button"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
} 