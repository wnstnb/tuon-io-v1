'use client';

import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import Editor from '../components/Editor';
import TitleBar from '../components/TitleBar';
import LeftPane from '../components/LeftPane';
import { type Block } from "@blocknote/core";
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';
import { User } from '@supabase/supabase-js';
import { ArtifactService } from '../lib/services/ArtifactService';
import { UserService } from '../lib/services/UserService';
import { supabase } from '../lib/supabase';

// Use dynamic import with SSR disabled for ThemeToggle
const ThemeToggle = dynamic(
  () => import('../components/ThemeToggle'),
  { ssr: false }
);

// Inner component to use searchParams
function EditorPageContent() {
  const searchParams = useSearchParams();
  const artifactId = searchParams.get('artifactId');
  
  const { signOut, user, isLoading } = useSupabase();
  const [title, setTitle] = useState<string>('Untitled Artifact');
  const [editorContent, setEditorContent] = useState<Block[]>([
    {
      id: "1",
      type: "paragraph",
      props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
      content: [],
      children: []
    }
  ]);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [leftPanelSize, setLeftPanelSize] = useState(20);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | undefined>(() => {
    if (artifactId) return artifactId;
    return crypto.randomUUID();
  });
  const [isArtifactPersisted, setIsArtifactPersisted] = useState<boolean>(!!artifactId);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isSaving, setIsSaving] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  // Basic UI interaction callbacks
  const toggleLeftPanel = useCallback(() => {
    setShowLeftPanel(!showLeftPanel);
  }, [showLeftPanel]);

  const handlePanelResize = useCallback((sizes: number[]) => {
    if (sizes.length > 0) {
      // Only update if the size is different to avoid unnecessary re-renders
      if (Math.abs(sizes[0] - leftPanelSize) > 0.5) {
        setLeftPanelSize(sizes[0]);
        console.log('Panel resized to:', sizes[0]);
      }
    }
  }, [leftPanelSize]);

  // Load an artifact from Supabase
  const loadArtifact = useCallback(async (artifactId: string, user: User) => {
    try {
      console.log(`Loading artifact data for ID: ${artifactId}`);
      
      // Reset content to empty first to avoid showing old content
      setEditorContent([{
        id: "1",
        type: "paragraph",
        props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
        content: [],
        children: []
      }]);
      
      setTitle('Loading...'); // Reset title while loading
      
      const artifact = await ArtifactService.getArtifact(artifactId);
      
      if (artifact) {
        console.log(`Successfully loaded artifact: ${artifact.title} with ${artifact.content.length} blocks`);
        setTitle(artifact.title);
        setEditorContent(artifact.content);
        setCurrentArtifactId(artifact.id);
        setIsArtifactPersisted(true);
        setSaveStatus('saved');
      }
    } catch (error) {
      console.error('Error loading artifact:', error);
    }
  }, []);

  // Create a new artifact in Supabase with the client-generated ID
  const createArtifact = useCallback(async () => {
    if (!user || !currentArtifactId) return;
    
    try {
      setIsSaving(true);
      setSaveStatus('saving');
      
      const success = await ArtifactService.createArtifactWithId(
        currentArtifactId,
        user.id,
        title,
        editorContent
      );
      
      if (success) {
        setIsArtifactPersisted(true);
        setSaveStatus('saved');
        
        // Update URL with the artifact ID if needed
        if (!artifactId) {
          const url = new URL(window.location.href);
          url.searchParams.set('artifactId', currentArtifactId);
          window.history.replaceState({}, '', url.toString());
        }
      } else {
        setSaveStatus('unsaved');
      }
    } catch (error) {
      console.error('Error creating artifact:', error);
      setSaveStatus('unsaved');
    } finally {
      setIsSaving(false);
    }
  }, [user, currentArtifactId, title, editorContent, artifactId]);

  // Save the current artifact to Supabase
  const saveArtifact = useCallback(async () => {
    if (!user || !currentArtifactId) return;
    
    // If the artifact hasn't been persisted yet, create it
    if (!isArtifactPersisted) {
      await createArtifact();
      return;
    }
    
    try {
      setIsSaving(true);
      setSaveStatus('saving');
      
      // Update artifact content
      await ArtifactService.updateArtifactContent(
        currentArtifactId,
        editorContent,
        user.id
      );
      
      setSaveStatus('saved');
    } catch (error) {
      console.error('Error saving artifact:', error);
      setSaveStatus('unsaved');
    } finally {
      setIsSaving(false);
    }
  }, [user, currentArtifactId, editorContent, createArtifact, isArtifactPersisted]);

  // Handle title changes with debounced save
  const handleTitleChange = useCallback(async (newTitle: string) => {
    setTitle(newTitle);
    setSaveStatus('unsaved');
    
    // Clear any existing save timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    // If we have an artifact ID, update the title
    if (currentArtifactId && user) {
      const timeout = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          await ArtifactService.updateArtifactTitle(currentArtifactId, newTitle);
          setSaveStatus('saved');
        } catch (error) {
          console.error('Error updating title:', error);
          setSaveStatus('unsaved');
        }
      }, 1000);
      
      setSaveTimeout(timeout);
    }
  }, [currentArtifactId, user, saveTimeout]);

  // Handle content changes with debounced save
  const handleContentChange = useCallback((content: Block[]) => {
    setEditorContent(content);
    setSaveStatus('unsaved');
    
    // Clear any existing save timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    // Only set a new timeout if we're not already saving
    if (!isSaving) {
      // Set a new timeout for saving with a longer debounce
      // Coordinate with the debounce in Editor.tsx (3s) + time for processing
      const timeout = setTimeout(() => {
        if (content.length > 0 && user) {
          // Use a ref to track if this is the most recent save request
          const saveTimestamp = Date.now();
          saveArtifact();
        }
      }, 7000); // 7 second debounce (longer than Editor's debounce)
      
      setSaveTimeout(timeout);
    }
  }, [user, saveTimeout, saveArtifact, isSaving]);

  // Listen for artifact selection events from FileExplorer
  useEffect(() => {
    // Handler function to load artifact when selected from FileExplorer
    const handleArtifactSelected = (event: CustomEvent) => {
      const { artifactId } = event.detail;
      if (artifactId && user && artifactId !== currentArtifactId) {
        console.log(`Loading artifact from event: ${artifactId}`);
        setCurrentArtifactId(artifactId);
        setIsArtifactPersisted(true);
        loadArtifact(artifactId, user);
      }
    };

    // Add event listener for custom event
    window.addEventListener('artifactSelected', handleArtifactSelected as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('artifactSelected', handleArtifactSelected as EventListener);
    };
  }, [user, loadArtifact, currentArtifactId]);

  // Load artifact if ID is provided in URL and different from current
  useEffect(() => {
    if (artifactId && user && artifactId !== currentArtifactId) {
      console.log(`Loading artifact from URL: ${artifactId}`);
      setCurrentArtifactId(artifactId);
      setIsArtifactPersisted(true);
      loadArtifact(artifactId, user);
    }
  }, [artifactId, user, loadArtifact, currentArtifactId]);

  // Memoize editor props to prevent unnecessary re-renders
  const editorProps = useMemo(() => {
    console.log('Updating editor props with new content');
    return {
      initialContent: editorContent,
      onChange: handleContentChange,
      artifactId: currentArtifactId,
      userId: user?.id,
      // Adding a timestamp forces re-evaluation when content changes
      _forceUpdate: Date.now()
    };
  }, [editorContent, handleContentChange, currentArtifactId, user?.id]);

  // Show a loading state if user data is still loading
  if (isLoading) {
    return <div className="loading">Loading user data...</div>;
  }

  return (
    <main className="app-container">
      <header>
        <div className="header-content">
          <h1>tuon.io - Your IDE for everything</h1>
          <div className="header-actions">
            <div className="save-status">
              {saveStatus === 'saving' && <span>Saving...</span>}
              {saveStatus === 'unsaved' && (
                <button 
                  onClick={saveArtifact} 
                  className="save-button" 
                  disabled={isSaving}
                >
                  <Save size={16} /> Save
                </button>
              )}
            </div>
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
                collapsible={false}
              >
                <LeftPane />
              </Panel>
              <PanelResizeHandle 
                id="resize-handle" 
                className="resize-handle"
              >
                <div className="resize-line"></div>
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
              <Editor 
                key={`editor-instance-${currentArtifactId}`}
                {...editorProps}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
}

// Loading fallback
function EditorLoading() {
  return <div className="loading">Loading editor...</div>;
}

// Main component with Suspense
export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <EditorPageContent />
    </Suspense>
  );
} 