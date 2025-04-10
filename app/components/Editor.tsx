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
}

export default function Editor({ initialContent, onChange, artifactId, userId }: EditorProps) {
  // Ensure initialContent is always an array with at least one paragraph block
  const safeInitialContent = React.useMemo(() => {
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
  }, [initialContent]);

  return (
    <div className="editor-container">
      <ThemeAwareEditor 
        initialContent={safeInitialContent}
        onChange={onChange}
        EditorComponent={BlockNoteEditor}
        artifactId={artifactId}
        userId={userId}
      />
    </div>
  );
} 