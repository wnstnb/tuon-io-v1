'use client';

import React from 'react';
import { type Block } from "@blocknote/core";
import dynamic from 'next/dynamic';

// Dynamically import BlockNote components with SSR disabled
const BlockNoteEditor = dynamic(
  () => import('@blocknote/react').then((mod) => {
    return {
      default: (props: any) => {
        const { useCreateBlockNote } = mod;
        const { BlockNoteView } = require('@blocknote/mantine');
        
        // Create editor with image upload support
        const editor = useCreateBlockNote({
          initialContent: props.initialContent && props.initialContent.length > 0 
            ? props.initialContent 
            : [{
                id: "default",
                type: "paragraph",
                props: { 
                  textColor: "default", 
                  backgroundColor: "default", 
                  textAlignment: "left" 
                },
                content: [],
                children: []
              }],
          // Add file upload handler for images
          uploadFile: async (file) => {
            // Check if file is an image
            if (!file.type.startsWith('image/')) {
              throw new Error('Only image files are supported');
            }
            
            // Check file size (10MB max)
            if (file.size > 10 * 1024 * 1024) {
              throw new Error('Image size should be less than 10MB');
            }
            
            try {
              // Check if we have an artifact ID and user ID for storing in Supabase
              if (props.artifactId && props.userId) {
                // Import the ImageService
                const { ImageService } = await import('../lib/services/ImageService');
                
                // Convert the file to a data URL first
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target?.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                
                // Upload the image to Supabase
                const imageUrl = await ImageService.uploadArtifactImage(
                  props.userId,
                  props.artifactId,
                  dataUrl
                );
                
                // Return the public URL from Supabase
                return imageUrl;
              } else {
                // Fall back to local data URL if not connected to Supabase
                return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    resolve(e.target?.result as string);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
              }
            } catch (error) {
              console.error('Error uploading image:', error);
              // Fall back to local data URL on error
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                  resolve(e.target?.result as string);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            }
          }
        });
        
        // Register onChange handler
        React.useEffect(() => {
          if (!props.onChange) return;
          
          // Create a more effective debounce implementation
          let debounceTimeout: NodeJS.Timeout | null = null;
          const debounceDelay = 3000; // 3 seconds
          
          const handleChange = () => {
            // Clear any existing timeout
            if (debounceTimeout) {
              clearTimeout(debounceTimeout);
            }
            
            // Set a new timeout
            debounceTimeout = setTimeout(() => {
              // Only update when content has meaningful changes
              const blocks = editor.document;
              props.onChange(blocks);
            }, debounceDelay);
          };
          
          // Register the handler with the editor
          editor.onChange(handleChange);
          
          // Cleanup function
          return () => {
            if (debounceTimeout) {
              clearTimeout(debounceTimeout);
            }
          };
        }, [editor, props.onChange]);
        
        return (
          <BlockNoteView 
            editor={editor} 
            theme={props.theme || "light"} 
            className="bn-editor"
          />
        );
      }
    };
  }),
  { ssr: false }
);

// Dynamically import theme component with SSR disabled
const ThemeAwareEditor = dynamic(
  () => import('./ThemeAwareEditor'),
  { ssr: false }
);

interface EditorProps {
  initialContent?: Block[];
  onChange?: (content: Block[]) => void;
  artifactId?: string;
  userId?: string;
  onContentAccessRequest?: (content: Block[]) => void;
}

export default function Editor({ initialContent, onChange, artifactId, userId, onContentAccessRequest }: EditorProps) {
  // State to track content updates from AI
  const [aiContent, setAiContent] = React.useState<Block[] | null>(null);
  // State to track current editor content
  const [currentContent, setCurrentContent] = React.useState<Block[]>(initialContent || []);
  // State to show status indicator for AI operations
  const [aiStatus, setAiStatus] = React.useState<{
    isProcessing: boolean;
    operation?: string;
    message?: string;
  }>({ isProcessing: false });
  
  // Debugging log to verify when props change
  React.useEffect(() => {
    console.log(`Editor received new content for artifact: ${artifactId}`);
  }, [initialContent, artifactId]);
  
  // Listen for editor:update events from the AI
  React.useEffect(() => {
    const handleEditorUpdate = (event: CustomEvent) => {
      console.log('Editor received update event:', event.detail);
      if (event.detail && event.detail.blocks) {
        const { blocks, operation, metadata, userInput, hadPriorContent } = event.detail;
        
        // Show status indicator
        setAiStatus({
          isProcessing: true,
          operation,
          message: getOperationMessage(operation)
        });
        
        // Handle operations differently based on type
        switch (operation) {
          case 'CREATE':
            // For create operations, just replace the content
            console.log('Editor: Creating new content');
            setAiContent(blocks);
            break;
            
          case 'REPLACE':
            // For replace operations, replace all content
            console.log('Editor: Replacing all content');
            setAiContent(blocks);
            break;
            
          case 'MODIFY':
          case 'EXPAND':
            // For modifications, we currently replace the entire content
            // In a more sophisticated implementation, we could merge or update specific parts
            console.log(`Editor: Modifying content (${operation})`);
            setAiContent(blocks);
            break;
            
          case 'REFORMAT':
            // For reformatting, we preserve content but change structure
            console.log('Editor: Reformatting content');
            setAiContent(blocks);
            break;
            
          case 'DELETE':
            // For delete operations, we might only remove specific blocks
            // For now, we just replace everything
            console.log('Editor: Deleting content');
            setAiContent(blocks);
            break;
            
          default:
            // Default to replacement for unknown operations
            console.log('Editor: Unspecified operation, defaulting to replacement');
            setAiContent(blocks);
            break;
        }
        
        // Trigger save immediately after AI content is applied to the editor
        if (onChange) {
          console.log('Editor: Triggering autosave after AI content insertion');
          onChange(blocks);
        }
        
        // Clear status after a delay
        setTimeout(() => {
          setAiStatus({ isProcessing: false });
        }, 2000);
      }
    };
    
    // Helper to get user-friendly operation messages
    const getOperationMessage = (operation?: string): string => {
      switch (operation) {
        case 'CREATE': return 'Creating new content...';
        case 'REPLACE': return 'Replacing content...';
        case 'MODIFY': return 'Modifying content...';
        case 'EXPAND': return 'Expanding content...';
        case 'REFORMAT': return 'Reformatting content...';
        case 'DELETE': return 'Removing content...';
        default: return 'Updating content...';
      }
    };
    
    // Add event listener with type assertion
    window.addEventListener('editor:update', handleEditorUpdate as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('editor:update', handleEditorUpdate as EventListener);
    };
  }, []);

  // Expose current content when requested
  React.useEffect(() => {
    // Setup custom event listener for content access requests
    const handleContentRequest = () => {
      // Send the current content back via a custom event
      const responseEvent = new CustomEvent('editor:contentResponse', {
        detail: {
          content: currentContent
        }
      });
      window.dispatchEvent(responseEvent);
      
      // Also call the callback if provided
      if (onContentAccessRequest) {
        onContentAccessRequest(currentContent);
      }
    };

    window.addEventListener('editor:requestContent', handleContentRequest);
    
    return () => {
      window.removeEventListener('editor:requestContent', handleContentRequest);
    };
  }, [currentContent, onContentAccessRequest]);
  
  // Ensure initialContent is always an array with at least one paragraph block
  const safeInitialContent = React.useMemo(() => {
    // If we have AI content, prioritize it
    if (aiContent) {
      return aiContent;
    }
    
    if (!initialContent || !Array.isArray(initialContent) || initialContent.length === 0) {
      // Create a properly typed empty paragraph block
      const defaultBlock: Block = {
        id: "default",
        type: "paragraph",
        props: { 
          textColor: "default", 
          backgroundColor: "default", 
          textAlignment: "left" 
        },
        content: [],
        children: []
      };
      
      return [defaultBlock];
    }
    return initialContent;
  }, [initialContent, aiContent]);

  // Reset AI content when artifact changes
  React.useEffect(() => {
    setAiContent(null);
  }, [artifactId]);

  return (
    <div className="editor-container">
      {aiStatus.isProcessing && (
        <div className="ai-status-indicator">
          <span className="ai-status-icon">🔄</span>
          <span className="ai-status-message">{aiStatus.message}</span>
        </div>
      )}
      <ThemeAwareEditor 
        // Create a more specific key that will force a remount when content changes
        key={`editor-${artifactId}-${safeInitialContent ? safeInitialContent.length : 'empty'}-${aiContent ? 'ai-updated' : 'regular'}`}
        initialContent={safeInitialContent}
        onChange={(blocks) => {
          // Reset AI content after user modification
          if (aiContent) {
            setAiContent(null);
          }
          // Update current content state
          setCurrentContent(blocks);
          if (onChange) {
            onChange(blocks);
          }
        }}
        EditorComponent={BlockNoteEditor}
        artifactId={artifactId}
        userId={userId}
      />
    </div>
  );
} 