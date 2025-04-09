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
          initialContent: props.initialContent,
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
            
            // Convert the file to a data URL
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                resolve(e.target?.result as string);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }
        });
        
        // Register onChange handler
        React.useEffect(() => {
          if (!props.onChange) return;
          
          const handleChange = () => {
            props.onChange(editor.document);
          };
          
          editor.onChange(handleChange);
          
          return () => {
            // Just remove the handler without passing null
            // The handler will be garbage collected
          };
        }, [editor, props.onChange]);
        
        return (
          <BlockNoteView 
            editor={editor} 
            theme={props.theme || "light"} 
          />
        );
      }
    };
  }),
  { ssr: false }
);

// Dynamically import theme hook with SSR disabled
const ThemeAwareEditor = dynamic(
  () => import('./ThemeAwareEditor'),
  { ssr: false }
);

interface EditorProps {
  initialContent?: Block[];
  onChange?: (content: Block[]) => void;
}

export default function Editor({ initialContent, onChange }: EditorProps) {
  return (
    <div className="editor-container">
      <ThemeAwareEditor 
        initialContent={initialContent}
        onChange={onChange}
        EditorComponent={BlockNoteEditor}
      />
    </div>
  );
} 