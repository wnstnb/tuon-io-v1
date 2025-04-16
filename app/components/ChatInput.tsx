'use client';

import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { Send, Image, Search, Sparkles } from 'lucide-react';
import { useAI, EditorContext } from '../context/AIContext';
import ModelSelector from './ModelSelector';
import { Block } from '@blocknote/core';

// Define search type (can be shared)
type SearchType = 'web' | 'exaAnswer';

// Optional prop to receive editor context from parent components
interface ChatInputProps {
  editorContext?: EditorContext;
  isPanelCollapsed?: boolean;
}

export default function ChatInput({ editorContext: initialEditorContext, isPanelCollapsed = false }: ChatInputProps = {}) {
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { sendMessage, isLoading } = useAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchType, setSearchType] = useState<SearchType>('web');

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

  // Function to request editor content (now expects markdown and selected IDs)
  const requestEditorContext = () => {
    return new Promise<{ markdown?: string; selectedBlockIds?: string[] }>((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null; // Variable to hold the timeout ID

      // Set up a one-time listener for the response
      const handleContentResponse = (event: CustomEvent) => {
        if (timeoutId) {
          clearTimeout(timeoutId); // Clear the timeout if the response is received
          timeoutId = null;
        }
        window.removeEventListener('editor:contentResponse', handleContentResponse as EventListener); // Remove listener here

        const { markdown, selectedBlockIds, error } = event.detail;
        if (error) {
          console.error('ChatInput: Error receiving editor context:', error);
          resolve({}); // Resolve with empty object on error
        } else {
          console.log('ChatInput received editor context:', { markdown: markdown?.substring(0, 50) + '...', selectedBlockIds });
          resolve({ markdown, selectedBlockIds });
        }
        // Listener removal moved up
      };

      // Listen for the response
      window.addEventListener('editor:contentResponse', handleContentResponse as EventListener);

      // Request the content
      const requestEvent = new CustomEvent('editor:requestContent');
      window.dispatchEvent(requestEvent);
      console.log('ChatInput dispatched requestContent event.');

      // Set a timeout in case we don't get a response
      timeoutId = setTimeout(() => { // Store the timeout ID
        timeoutId = null; // Clear the stored ID once timeout executes
        window.removeEventListener('editor:contentResponse', handleContentResponse as EventListener);
        console.warn('ChatInput: Timeout waiting for editor contentResponse.');
        resolve({}); // Resolve with empty object on timeout
      }, 5000); // Slightly increased timeout
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    console.log('ChatInput: handleSubmit called.');
    
    if ((!message.trim() && !selectedImage) || isLoading) return;
    
    const userMessage = message;
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    // Capture current editor context (markdown + selected IDs)
    const { markdown: editorMarkdown, selectedBlockIds } = await requestEditorContext();
    
    // Prepare enhanced editor context
    const enhancedEditorContext: EditorContext = {
      ...initialEditorContext,
      markdown: editorMarkdown,
      selectedBlockIds: selectedBlockIds,
    };
    
    console.log(`ChatInput: Preparing to call sendMessage. Search Type: ${searchType}`, { hasImage: !!selectedImage, message: userMessage });

    // Handle message with image OR normal message
    const imageDataUrl = selectedImage ? imagePreview : null;
    if (selectedImage) {
      clearSelectedImage();
    }
    
    // Call sendMessage, always passing the current searchType and panel state
    await sendMessage(
      userMessage, 
      imageDataUrl, 
      enhancedEditorContext, 
      searchType,
      isPanelCollapsed
    );

  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Toggle Search Type Function
  const toggleSearchType = () => {
    setSearchType(currentType => currentType === 'web' ? 'exaAnswer' : 'web');
  };

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit} className="chat-input-form">
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
        {/* New wrapper for textarea and buttons */}
        <div className="chat-input-field-area">
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
            {/* Add ModelSelector to the left */}
            <div className="model-selector-wrapper">
              <ModelSelector />
            </div>
            {/* Existing buttons moved to their own wrapper for alignment */}
            <div className="action-buttons-wrapper">
              <button 
                type="button" 
                onClick={toggleSearchType}
                className={`search-type-toggle-button ${searchType}`}
                disabled={isLoading}
                aria-label={`Toggle search mode (Current: ${searchType === 'web' ? 'Web Search' : 'Exa Answer'})`}
                title={`Current mode: ${searchType === 'web' ? 'Web Search' : 'Exa Answer (AI Answer)'}`}
              >
                {searchType === 'web' ? <Search size={18} /> : <Sparkles size={18} />}
              </button>
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
        </div> {/* End of new chat-input-field-area */}
      </form>
    </div>
  );
} 