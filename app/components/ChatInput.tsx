'use client';

import React, { useState, FormEvent, useRef, useEffect, useCallback } from 'react';
import { Send, Image, Search, Sparkles, X as CloseIcon } from 'lucide-react';
import { useAI, EditorContext } from '../context/AIContext';
import ModelSelector from './ModelSelector';

// Define search type (can be shared)
type SearchType = 'web' | 'exaAnswer';

// NEW: Notification Type Definition
type NotificationType = 'info' | 'error' | 'success';
interface NotificationState {
  message: string;
  type: NotificationType;
  id: number; // Unique ID for timeout management
}

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
  const [notification, setNotification] = useState<NotificationState | null>(null); // NEW: Notification state
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null); // NEW: Ref for timeout
  const [followUpText, setFollowUpText] = useState<string | null>(null); // NEW: State for follow-up text

  // --- NEW: Function to show notification ---
  const showNotification = useCallback((message: string, type: NotificationType, duration = 3000) => {
    // Clear existing timeout if any
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    const newNotificationId = Date.now(); // Simple unique ID
    setNotification({ message, type, id: newNotificationId });

    // Set new timeout to clear the notification
    notificationTimeoutRef.current = setTimeout(() => {
      // Only clear if the notification hasn't been replaced by a newer one
      setNotification(current => (current?.id === newNotificationId ? null : current));
      notificationTimeoutRef.current = null;
    }, duration);
  }, []);

  // --- NEW: Function to hide notification ---
  const hideNotification = useCallback(() => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
    setNotification(null);
  }, []);

  // --- NEW: Effect to listen for global notification events ---
  useEffect(() => {
    const handleShowNotification = (event: CustomEvent) => {
      const { message, type = 'info', duration = 3000 } = event.detail;
      if (message) {
        showNotification(message, type, duration);
      }
    };

    const handleHideNotification = () => {
      hideNotification();
    };

    window.addEventListener('chat:showNotification', handleShowNotification as EventListener);
    window.addEventListener('chat:hideNotification', handleHideNotification);

    // Cleanup listener and timeout on unmount
    return () => {
      window.removeEventListener('chat:showNotification', handleShowNotification as EventListener);
      window.removeEventListener('chat:hideNotification', handleHideNotification);
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, [showNotification, hideNotification]); // Dependencies include the memoized functions

  // --- NEW: Effect to listen for follow-up text event ---
  useEffect(() => {
    const handleFollowUp = (event: CustomEvent) => {
      const text = event.detail?.text;
      if (typeof text === 'string') {
        console.log('ChatInput received followUpText:', text.substring(0, 50) + '...');
        setFollowUpText(text);
        // Optionally focus the textarea after adding follow-up
        textareaRef.current?.focus();
      }
    };

    window.addEventListener('editor:followUpText', handleFollowUp as EventListener);

    return () => {
      window.removeEventListener('editor:followUpText', handleFollowUp as EventListener);
    };
  }, []); // Empty dependency array ensures this runs once on mount
  // --- END NEW ---

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
    
    if ((!message.trim() && !selectedImage && !followUpText) || isLoading) return;
    
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
    
    // --- NEW: Prepare follow-up text for sending --- 
    let messageToSend = userMessage;
    if (followUpText) {
      // Simple prefixing. You might want a more structured format.
      messageToSend = `Regarding the selected text:\n\`\`\`\n${followUpText}\n\`\`\`\n\n${userMessage}`;
      setFollowUpText(null); // Clear follow-up text after preparing it
    }
    // --- END NEW ---
    
    // Call sendMessage, always passing the current searchType and panel state
    await sendMessage(
      messageToSend, // Use the potentially modified message
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

  const clearFollowUpText = useCallback(() => {
    setFollowUpText(null);
  }, []);

  return (
    // Make the container relative to position the notification absolutely within it
    <div className="chat-input-container relative">
      {/* --- NEW: Notification Display --- */}
      {notification && (
        <div
          className={`chat-input-notification ${notification.type}`}
          role="alert"
        >
          <span className="notification-message">{notification.message}</span>
          <button
            onClick={hideNotification}
            className="notification-close-btn"
            aria-label="Dismiss notification"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
      {/* --- End Notification Display --- */}

      <form onSubmit={handleSubmit} className="chat-input-form">
        {/* --- NEW: Display Follow-up Text --- */} 
        {followUpText && (
          <div className="follow-up-text-container">
            <span className="follow-up-label">💭</span>
            <div className="follow-up-content">
              <RenderMarkdown markdown={followUpText} maxLength={150} />
            </div>
            <button
              type="button"
              className="clear-follow-up-btn"
              onClick={clearFollowUpText}
              aria-label="Clear follow-up text"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}
        {/* --- END NEW --- */} 

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
              placeholder={followUpText ? "Add details or ask about the text..." : "What do you want to focus on?"}
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
                disabled={(!message.trim() && !selectedImage && !followUpText) || isLoading}
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

// --- NEW: Simple component to render Markdown as HTML (basic implementation) ---
// You might want a more robust Markdown renderer like 'react-markdown'
const RenderMarkdown: React.FC<{ markdown: string; maxLength?: number }> = ({ markdown, maxLength = 100 }) => {
  // Basic preview: replace newlines with spaces and truncate
  const previewText = markdown.replace(/\n+/g, ' ').trim();
  const displayText = previewText.length > maxLength 
    ? previewText.substring(0, maxLength) + '...' 
    : previewText;

  return (
    <span title={markdown}> {/* Show full text on hover */}
      {displayText}
    </span>
  );
};
// --- END NEW --- 