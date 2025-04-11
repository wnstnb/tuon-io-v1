'use client';

import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import Editor from '../components/Editor';
import EditorFAB from '../components/EditorFAB';
import TitleBar from '../components/TitleBar';
import LeftPane from '../components/LeftPane';
import RightPane from '../components/RightPane';
import GlobalSearch from '../components/GlobalSearch';
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
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [rightPanelSize, setRightPanelSize] = useState(20);
  const [isLeftPanelAnimating, setIsLeftPanelAnimating] = useState(false);
  const [isRightPanelAnimating, setIsRightPanelAnimating] = useState(false);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | undefined>(() => {
    if (artifactId) return artifactId;
    return crypto.randomUUID();
  });
  const [isArtifactPersisted, setIsArtifactPersisted] = useState<boolean>(!!artifactId);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isSaving, setIsSaving] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [hasInferredTitleForCurrentArtifact, setHasInferredTitleForCurrentArtifact] = useState<boolean>(false);

  // Basic UI interaction callbacks
  const toggleLeftPanel = useCallback(() => {
    if (isLeftPanelAnimating) return;
    
    if (showLeftPanel) {
      // Collapsing left panel
      setIsLeftPanelAnimating(true);
      const leftPanel = document.getElementById('left-panel');
      if (leftPanel) {
        leftPanel.style.animation = 'slideOutLeft 0.3s ease forwards';
        setTimeout(() => {
          setShowLeftPanel(false);
          setIsLeftPanelAnimating(false);
        }, 300);
      } else {
        setShowLeftPanel(false);
        setIsLeftPanelAnimating(false);
      }
    } else {
      // Expanding left panel
      setShowLeftPanel(true);
      setIsLeftPanelAnimating(true);
      setTimeout(() => {
        setIsLeftPanelAnimating(false);
      }, 300);
    }
  }, [showLeftPanel, isLeftPanelAnimating]);

  const toggleRightPanel = useCallback(() => {
    if (isRightPanelAnimating) return;
    
    if (showRightPanel) {
      // Collapsing right panel
      setIsRightPanelAnimating(true);
      const rightPanel = document.getElementById('right-panel');
      if (rightPanel) {
        rightPanel.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => {
          setShowRightPanel(false);
          setIsRightPanelAnimating(false);
        }, 300);
      } else {
        setShowRightPanel(false);
        setIsRightPanelAnimating(false);
      }
    } else {
      // Expanding right panel
      setShowRightPanel(true);
      setIsRightPanelAnimating(true);
      setTimeout(() => {
        setIsRightPanelAnimating(false);
      }, 300);
    }
  }, [showRightPanel, isRightPanelAnimating]);

  const handlePanelResize = useCallback((sizes: number[]) => {
    if (sizes.length > 0) {
      // Only update if the size is different to avoid unnecessary re-renders
      if (Math.abs(sizes[0] - leftPanelSize) > 0.5) {
        setLeftPanelSize(sizes[0]);
        console.log('Left panel resized to:', sizes[0]);
      }
      
      // If right panel is visible, update its size
      if (showRightPanel && sizes.length > 2) {
        if (Math.abs(sizes[2] - rightPanelSize) > 0.5) {
          setRightPanelSize(sizes[2]);
          console.log('Right panel resized to:', sizes[2]);
        }
      }
    }
  }, [leftPanelSize, rightPanelSize, showRightPanel]);

  // Helper function to extract text content for title inference
  const extractTextForInference = (content: Block[]): string => {
    return content.slice(0, 5).map((block: any) => {
      if (block.content) {
        return block.content.map((item: any) => item.text || '').join(' ');
      }
      return '';
    }).join('\n').trim();
  };

  // Function to call the title inference API
  const inferTitle = useCallback(async (artifactId: string, contentForInference: Block[]) => {
    if (!user) return; // Need user context

    const textContent = extractTextForInference(contentForInference);

    if (textContent.length < 20) {
      console.log('Content too short, skipping title inference.');
      return; // Don't infer if content is too short
    }

    console.log(`Inferring title for artifact ${artifactId}...`);
    setHasInferredTitleForCurrentArtifact(true); // Mark as attempted

    try {
      const response = await fetch('/api/infer-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Ensure cookies are sent
        body: JSON.stringify({
          content: textContent,
          contextType: 'artifact',
          contextId: artifactId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.title) {
          console.log(`Title inference successful: "${data.title}"`);
          setTitle(data.title); // Update local title state
          setSaveStatus('saved'); // Assume API updated DB, mark as saved
        } else {
          console.warn('Title inference API call succeeded but returned no title.');
        }
      } else {
        console.error('Title inference API call failed:', response.statusText);
      }
    } catch (error) {
      console.error('Error calling title inference API:', error);
      // Optionally reset the flag if the call fails completely, allowing another try?
      // setHasInferredTitleForCurrentArtifact(false); 
    }
  }, [user]); // Dependency: user

  // Load an artifact from Supabase
  const loadArtifact = useCallback(async (artifactId: string, user: User) => {
    try {
      console.log(`Loading artifact data for ID: ${artifactId}`);
      setHasInferredTitleForCurrentArtifact(false); // Reset inference flag for new artifact
      
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

        // Check if we should infer a title after loading
        const isPlaceholderTitle = !artifact.title || artifact.title === 'Untitled Artifact';
        if (isPlaceholderTitle) {
          // Use a short delay to allow editor content to potentially render fully
          setTimeout(() => inferTitle(artifact.id, artifact.content), 500); 
        } else {
          setHasInferredTitleForCurrentArtifact(true); // Mark as done if loaded title is specific
        }
      }
    } catch (error) {
      console.error('Error loading artifact:', error);
    }
  }, [inferTitle]); // Added inferTitle dependency

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
          saveArtifact(); // Save the actual content

          // Check if we need to infer title for the first time
          if (!hasInferredTitleForCurrentArtifact && currentArtifactId) {
             inferTitle(currentArtifactId, content); 
          }
        }
      }, 7000); // 7 second debounce (longer than Editor's debounce)
      
      setSaveTimeout(timeout);
    }
  }, [user, saveTimeout, saveArtifact, isSaving, hasInferredTitleForCurrentArtifact, currentArtifactId, inferTitle]); // Added dependencies

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

  // Listen for title updates from the title inference service -- REMOVED as inference is now handled differently
  // useEffect(() => {
  //   // Handler for title updates coming from the inference service
  //   const handleTitleUpdated = (event: CustomEvent) => {
  //     const { artifactId, title } = event.detail;
      
  //     // Only update the title if it's for the current artifact
  //     if (artifactId && artifactId === currentArtifactId && title) {
  //       console.log(`Received title update from inference: "${title}"`);
  //       setTitle(title);
  //       setSaveStatus('saved');
  //     }
  //   };

  //   // Add event listener for the title update event
  //   window.addEventListener('artifactTitleUpdated', handleTitleUpdated as EventListener);
    
  //   // Clean up
  //   return () => {
  //     window.removeEventListener('artifactTitleUpdated', handleTitleUpdated as EventListener);
  //   };
  // }, [currentArtifactId]);

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
        <div className="header-content" style={{ paddingLeft: 0 }}>
          <h1 className="font-jetbrains-mono" style={{ paddingLeft: '8px' }}>tuon.io</h1>
          
          <GlobalSearch />
          
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
                id="left-resize-handle" 
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
              <EditorFAB 
                artifactId={currentArtifactId}
                userId={user?.id}
              />
              {!showRightPanel && (
                <button
                  onClick={toggleRightPanel}
                  className="toggle-button toggle-button-right"
                  aria-label="Expand right panel"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
            </div>
          </Panel>
          {showRightPanel && (
            <>
              <PanelResizeHandle 
                id="right-resize-handle" 
                className="resize-handle"
              >
                <div className="resize-line"></div>
                <button 
                  onClick={toggleRightPanel}
                  className="toggle-button"
                  aria-label="Collapse right panel"
                >
                  <ChevronRight size={16} />
                </button>
              </PanelResizeHandle>
              <Panel 
                id="right-panel" 
                defaultSize={rightPanelSize}
                minSize={10}
                maxSize={40}
                order={3}
                className="animated-panel right-panel"
                collapsible={false}
              >
                <RightPane />
              </Panel>
            </>
          )}
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