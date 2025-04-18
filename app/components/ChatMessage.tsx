'use client';

import React, { useState, useEffect } from 'react';
import { Message } from '../context/AIContext';
import { User, Bot, Search, Info } from 'lucide-react';
import { ImageService } from '../lib/services/ImageService';
import { supabase } from '../lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Components } from 'react-markdown';

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isSearchResult = isSystem && message.content.includes('Search results for');
  const isSearchNotification = isSystem && message.content.includes('performed a web search for');
  const hasImage = !!message.imageUrl;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch and prepare image for display
  useEffect(() => {
    if (!hasImage || !message.imageUrl) return;
    
    const loadImage = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const imageUrlString = message.imageUrl as string; // Cast since we already checked it's not undefined
        
        // Check image URL type
        const isStoredPath = imageUrlString.includes('/') && !imageUrlString.startsWith('http');
        const isPublicUrl = imageUrlString.includes('/object/public/');
        const isAuthenticatedUrl = imageUrlString.includes('/object/authenticated/');
        
        let authUrl: string;
        
        // Get appropriate URL based on image type
        if (isStoredPath) {
          // Convert stored path to authenticated URL
          authUrl = await ImageService.getAuthenticatedUrl(imageUrlString);
        } else if (isPublicUrl) {
          // Extract bucket and path from public URL and convert
          const matches = imageUrlString.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);
          if (matches && matches.length >= 3) {
            const [_, bucket, path] = matches;
            authUrl = await ImageService.getAuthenticatedUrl(`${bucket}/${path}`);
          } else {
            authUrl = imageUrlString;
          }
        } else if (isAuthenticatedUrl) {
          // Already authenticated URL
          authUrl = imageUrlString;
        } else {
          // External or unknown URL format
          setImageUrl(imageUrlString);
          setLoading(false);
          return;
        }
        
        // Fetch the image with authentication and create a blob URL
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        
        if (token && (isAuthenticatedUrl || isStoredPath || isPublicUrl)) {
          // Fetch with auth token
          const response = await fetch(authUrl, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          
          // Clean up previous blob URL if exists
          if (imageUrl && imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageUrl);
          }
          
          setImageUrl(blobUrl);
        } else {
          // No token or not an authenticated URL
          setImageUrl(authUrl);
        }
      } catch (err) {
        console.error('Error loading image:', err);
        setError(`Failed to load image: ${err instanceof Error ? err.message : 'Unknown error'}`);
        
        // Fall back to the original URL as last resort
        if (message.imageUrl && message.imageUrl.startsWith('http')) {
          setImageUrl(message.imageUrl);
        } else {
          setImageUrl(null);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadImage();
    
    // Cleanup blob URLs on unmount
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [message.imageUrl, hasImage]);
  
  // Handle image click to open in new tab
  const handleImageClick = () => {
    if (!imageUrl) return;
    
    // For blob URLs or regular URLs, just open
    window.open(imageUrl, '_blank');
  };
  
  // Process message content to handle markdown
  const processMessageContent = (content: string) => {
    // Replace [Code Block] with proper markdown code block if it's not already one
    let processed = content.replace(/^\[Code Block\]$/gm, '```\n```');
    
    // If there's a table in plain text format, convert it to markdown table
    if (processed.includes('|') && !processed.includes('|-')) {
      const lines = processed.split('\n');
      const tableStart = lines.findIndex(line => line.includes('|'));
      if (tableStart !== -1) {
        // Add the separator row after the header
        const columnCount = lines[tableStart].split('|').length - 1;
        const separator = '|' + Array(columnCount).fill('---').join('|') + '|';
        lines.splice(tableStart + 1, 0, separator);
        processed = lines.join('\n');
      }
    }
    
    return processed;
  };
  
  return (
    <div className={`chat-message ${isUser ? 'user-message' : isSystem ? 'system-message' : 'assistant-message'}`}>
      <div className="message-avatar">
        {isUser ? (
          <User size={20} />
        ) : isSearchResult || isSearchNotification ? (
          <Search size={20} />
        ) : isSystem ? (
          <Info size={20} />
        ) : (
          <Bot size={20} />
        )}
      </div>
      <div className="message-content">
        <div className={`message-bubble ${isSearchResult ? 'search-result-message' : ''} ${isSearchNotification ? 'search-notification-message' : ''}`}>
          {/* Display text content with markdown support */}
          {message.content && (
            <div className="markdown-content">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({children, ...props}) => <p className="markdown-p" {...props}>{children}</p>,
                  h1: ({children, ...props}) => <h1 className="markdown-h1" {...props}>{children}</h1>,
                  h2: ({children, ...props}) => <h2 className="markdown-h2" {...props}>{children}</h2>,
                  h3: ({children, ...props}) => <h3 className="markdown-h3" {...props}>{children}</h3>,
                  h4: ({children, ...props}) => <h4 className="markdown-h4" {...props}>{children}</h4>,
                  h5: ({children, ...props}) => <h5 className="markdown-h5" {...props}>{children}</h5>,
                  h6: ({children, ...props}) => <h6 className="markdown-h6" {...props}>{children}</h6>,
                  ul: ({children, ...props}) => <ul className="markdown-ul" {...props}>{children}</ul>,
                  ol: ({children, ...props}) => <ol className="markdown-ol" {...props}>{children}</ol>,
                  li: ({children, ...props}) => <li className="markdown-li" {...props}>{children}</li>,
                  code: ({inline, className, children, ...props}: any) => 
                    inline ? (
                      <code className="markdown-code-inline" {...props}>{children}</code>
                    ) : (
                      <code className="markdown-code" {...props}>{children}</code>
                    ),
                  pre: ({children, ...props}) => <pre className="markdown-pre" {...props}>{children}</pre>,
                  blockquote: ({children, ...props}) => <blockquote className="markdown-blockquote" {...props}>{children}</blockquote>,
                  a: ({children, ...props}) => <a className="markdown-a" {...props}>{children}</a>,
                  table: ({children, ...props}) => <table className="markdown-table" {...props}>{children}</table>,
                  thead: ({children, ...props}) => <thead className="markdown-thead" {...props}>{children}</thead>,
                  tbody: ({children, ...props}) => <tbody className="markdown-tbody" {...props}>{children}</tbody>,
                  tr: ({children, ...props}) => <tr className="markdown-tr" {...props}>{children}</tr>,
                  th: ({children, ...props}) => <th className="markdown-th" {...props}>{children}</th>,
                  td: ({children, ...props}) => <td className="markdown-td" {...props}>{children}</td>,
                  img: ({...props}) => <img className="markdown-img" {...props} />,
                  hr: ({...props}) => <hr className="markdown-hr" {...props} />
                }}
              >
                {processMessageContent(message.content)}
              </ReactMarkdown>
            </div>
          )}
          
          {/* Display image if present */}
          {hasImage && (
            <div className="message-image-container">
              {loading ? (
                <div className="image-loading">Loading image...</div>
              ) : error ? (
                <div className="image-error">{error}</div>
              ) : imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="User uploaded image" 
                  className="message-image"
                  onClick={handleImageClick}
                />
              ) : (
                <div className="image-error">Failed to load image</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 