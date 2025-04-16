'use client';

import React, { useState, useEffect, ComponentType } from 'react';
import { type Block } from "@blocknote/core";
import { useTheme } from '../context/ThemeContext';

interface ThemeAwareEditorProps {
  initialContent?: Block[];
  onChange?: (content: Block[]) => void;
  EditorComponent: ComponentType<any>;
  [key: string]: any; // Allow any additional props
}

export default function ThemeAwareEditor({ 
  initialContent, 
  onChange, 
  EditorComponent,
  ...restProps
}: ThemeAwareEditorProps) {
  const [mounted, setMounted] = useState(false);
  // Always call useTheme at the component level, regardless of mounting state
  const { theme } = useTheme();
  
  // Only access theme context after component has mounted
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Don't render anything until client-side
  if (!mounted) {
    // Return an empty div with the same dimensions to prevent layout shift
    return <div className="editor-placeholder"></div>;
  }
  
  return (
    <EditorComponent 
      initialContent={initialContent}
      onChange={onChange}
      theme={theme}
      {...restProps}
    />
  );
} 