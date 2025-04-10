'use client';

import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { Send, Image } from 'lucide-react';
import { useAI, EditorContext } from '../context/AIContext';
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
  const [capturedEditorContent, setCapturedEditorContent] = useState<Block[] | undefined>(undefined);

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

  // Function to request editor content
  const requestEditorContent = () => {
    return new Promise<Block[] | undefined>((resolve) => {
      // Set up a one-time listener for the response
      const handleContentResponse = (event: CustomEvent) => {
        if (event.detail && event.detail.content) {
          setCapturedEditorContent(event.detail.content);
          resolve(event.detail.content);
        } else {
          resolve(undefined);
        }
        window.removeEventListener('editor:contentResponse', handleContentResponse as EventListener);
      };
      
      // Listen for the response
      window.addEventListener('editor:contentResponse', handleContentResponse as EventListener);
      
      // Request the content
      const requestEvent = new CustomEvent('editor:requestContent');
      window.dispatchEvent(requestEvent);
      
      // Set a timeout in case we don't get a response
      setTimeout(() => {
        window.removeEventListener('editor:contentResponse', handleContentResponse as EventListener);
        resolve(undefined);
      }, 500);
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
    
    // Capture current editor content before sending message
    const editorContent = await requestEditorContent();
    
    // Prepare enhanced editor context with current content
    const enhancedEditorContext: EditorContext = {
      ...initialEditorContext,
      editorContent: editorContent
    };
    
    // Log editor context for debugging
    if (enhancedEditorContext) {
      console.log('Sending message with enhanced editor context:', {
        ...enhancedEditorContext,
        editorContent: editorContent ? `[${editorContent.length} blocks]` : 'none'
      });
    }
    
    // Handle message with image
    if (selectedImage) {
      const imageDataUrl = imagePreview;
      clearSelectedImage();
      await sendMessage(userMessage, imageDataUrl, enhancedEditorContext);
    } else {
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

  return (
    <form onSubmit={handleSubmit} className="chat-input-container">
      {imagePreview && (
        <div className="image-preview-container">
          <img 
            src={imagePreview} 
            alt="Preview" 
            className="image-preview" 
          />
          <button 
            type="button" 
            onClick={clearSelectedImage}
            className="clear-image-button"
            aria-label="Remove image"
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
  );
} 