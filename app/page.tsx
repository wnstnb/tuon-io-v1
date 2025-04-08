'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import Editor from './components/Editor';
import TitleBar from './components/TitleBar';
import LeftPane from './components/LeftPane';
import { type Block } from "@blocknote/core";
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Use dynamic import with SSR disabled for ThemeToggle
const ThemeToggle = dynamic(
  () => import('./components/ThemeToggle'),
  { ssr: false }
);

export default function Home() {
  const [title, setTitle] = useState<string>('Untitled Artifact');
  const [editorContent, setEditorContent] = useState<Block[]>([]);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [leftPanelSize, setLeftPanelSize] = useState(20);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    // In a real application, you would store this title in a database
    console.log('Title changed:', newTitle);
  };

  const handleContentChange = (content: Block[]) => {
    setEditorContent(content);
    // In a real application, you would store this content in a database
    console.log('Editor content changed:', content);
  };

  const toggleLeftPanel = () => {
    setShowLeftPanel(!showLeftPanel);
  };

  const handlePanelResize = (sizes: number[]) => {
    if (sizes.length > 0) {
      setLeftPanelSize(sizes[0]);
    }
  };

  return (
    <main className="app-container">
      <header>
        <div className="header-content">
          <h1>tuon.io - Your IDE for everything</h1>
          <ThemeToggle />
        </div>
      </header>
      <div className="content-area">
        <PanelGroup 
          autoSaveId="tuon-layout" 
          direction="horizontal"
          onLayout={handlePanelResize}
        >
          {showLeftPanel && (
            <>
              <Panel 
                id="left-panel" 
                defaultSize={leftPanelSize}
                minSize={10}
                maxSize={40}
                order={1}
                className="animated-panel left-panel"
              >
                <LeftPane />
              </Panel>
              <PanelResizeHandle 
                id="resize-handle" 
                className="resize-handle"
              >
                <button 
                  onClick={toggleLeftPanel}
                  className="toggle-button"
                  aria-label="Collapse left panel"
                >
                  <ChevronLeft size={16} />
                </button>
              </PanelResizeHandle>
            </>
          )}
          <Panel 
            id="content-panel" 
            order={2}
            className="animated-panel"
          >
            <div className="main-content">
              {!showLeftPanel && (
                <button
                  onClick={toggleLeftPanel}
                  className="toggle-button toggle-button-left"
                  aria-label="Expand left panel"
                >
                  <ChevronRight size={16} />
                </button>
              )}
              <TitleBar 
                initialTitle={title} 
                onTitleChange={handleTitleChange} 
              />
              <Editor onChange={handleContentChange} />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
} 