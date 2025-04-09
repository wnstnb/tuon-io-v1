'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import Editor from '../components/Editor';
import TitleBar from '../components/TitleBar';
import LeftPane from '../components/LeftPane';
import { type Block } from "@blocknote/core";
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';

// Use dynamic import with SSR disabled for ThemeToggle
const ThemeToggle = dynamic(
  () => import('../components/ThemeToggle'),
  { ssr: false }
);

export default function EditorPage() {
  const { signOut } = useSupabase();
  const [title, setTitle] = useState<string>('Untitled Artifact');
  const [editorContent, setEditorContent] = useState<Block[]>([]);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [leftPanelSize, setLeftPanelSize] = useState(20);
  const [showTipBanner, setShowTipBanner] = useState(true);

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
          <div className="header-actions">
            <button onClick={() => signOut()} className="sign-out-button">
              Sign Out
            </button>
            <ThemeToggle />
          </div>
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
              {showTipBanner && (
                <div className="tip-banner">
                  <div className="tip-content">
                    <Info size={18} />
                    <span>
                      <strong>Image Tips:</strong> Insert images by typing / and selecting Image, dragging & dropping files, or pasting images directly (Ctrl+V) into the editor
                    </span>
                  </div>
                  <button 
                    type="button" 
                    className="tip-close" 
                    onClick={() => setShowTipBanner(false)}
                    aria-label="Close tip"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
} 