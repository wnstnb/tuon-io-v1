'use client';

import React, { useState, useEffect } from 'react';
import { Message } from '../context/AIContext';
import { User, Bot } from 'lucide-react';
import { ImageService } from '../lib/services/ImageService';
import { supabase } from '../lib/supabase';

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
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