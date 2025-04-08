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
        const editor = useCreateBlockNote({
          initialContent: props.initialContent,
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