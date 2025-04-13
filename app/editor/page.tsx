'use client';

import React, { useState, useEffect, Suspense, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import Editor from '../components/Editor';
import EditorFAB from '../components/EditorFAB';
import TitleBar from '../components/TitleBar';
import LeftPane from '../components/LeftPane';
import RightPane from '../components/RightPane';
import GlobalSearch from '../components/GlobalSearch';
import { type Block, type PartialBlock } from "@blocknote/core";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';
import { User } from '@supabase/supabase-js';
import { ArtifactService } from '../lib/services/ArtifactService';
import { debounce, throttle } from 'lodash-es';
import { ImageService } from '../lib/services/ImageService';

// Use dynamic import with SSR disabled for ThemeToggle
const ThemeToggle = dynamic(
  () => import('../components/ThemeToggle'),
  { ssr: false }
);

// NEW: Define structure for local storage data
interface LocalArtifactData {
  content: Block[];
  title: string;
  updatedAt: string; // ISO string
}

// NEW: Define save status types for UI feedback
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'error';

// Inner component to use searchParams
function EditorPageContent() {
  const searchParams = useSearchParams();
  const artifactIdParam = searchParams.get('artifactId'); // Renamed for clarity

  const { signOut, user, isLoading } = useSupabase();
  const [title, setTitle] = useState<string>('Untitled Artifact');
  const [editorContent, setEditorContent] = useState<Block[]>([]);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [leftPanelSize, setLeftPanelSize] = useState(20);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [rightPanelSize, setRightPanelSize] = useState(20);
  const [isLeftPanelAnimating, setIsLeftPanelAnimating] = useState(false);
  const [isRightPanelAnimating, setIsRightPanelAnimating] = useState(false);

  // -- NEW State Management --
  const [currentArtifactId, setCurrentArtifactId] = useState<string | undefined>(() => {
    if (artifactIdParam) return artifactIdParam;
    const newId = crypto.randomUUID();
    // Clear potentially conflicting old keys if generating new ID
    try {
      localStorage.removeItem(`artifact-local-${newId}`);
      localStorage.removeItem(`artifact-local-meta-${newId}`);
      localStorage.removeItem(`artifact-data-${newId}`); // Clear new key format too
    } catch (e) { console.warn("Failed to clear initial localStorage"); }
    return newId;
  });
  const [isArtifactPersisted, setIsArtifactPersisted] = useState<boolean>(!!artifactIdParam);
  const [isDirty, setIsDirty] = useState<boolean>(false); // Editor state vs Local Storage state
  const [isSyncPending, setIsSyncPending] = useState<boolean>(false); // Local Storage state vs DB state
  const [isSyncing, setIsSyncing] = useState<boolean>(false); // DB sync operation in progress
  const [lastSyncError, setLastSyncError] = useState<string | null>(null); // Store last sync error message
  const [userHasManuallySetTitle, setUserHasManuallySetTitle] = useState<boolean>(false); // NEW: Track manual title edits

  // Ref to track if component is mounted to avoid state updates after unmount
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  // -- END NEW State Management --

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
      // Check if content exists AND is an array before mapping
      if (block.content && Array.isArray(block.content)) { 
        return block.content.map((item: any) => item.text || '').join(' ');
      }
      // Also consider if the block itself has direct text content (e.g., heading)
      if (typeof block.content === 'string') {
        return block.content;
      } 
      // Otherwise, return empty string for this block
      return '';
    }).join('\n').trim();
  };

  // --- Helper Function to Replace Signed URLs with Relative Paths before Saving ---
  const replaceSignedUrlsWithRelativePaths = (blocks: Block[]): Block[] => {
    const processedBlocks: Block[] = [];

    const isBlockArray = (content: any): content is Block[] => {
      return Array.isArray(content) && content.length > 0 &&
             content.every(item => typeof item === 'object' && item !== null && 'id' in item && 'type' in item);
    }

    for (const block of blocks) {
      let currentBlock: Block = JSON.parse(JSON.stringify(block)); // Deep copy

      // Process image blocks
      if (currentBlock.type === 'image' && (currentBlock.props as any)?.originalUrl) {
        // Replace the signed URL with the original relative path for saving
        currentBlock.props = { 
          ...(currentBlock.props || {}), 
          url: (currentBlock.props as any).originalUrl // Use originalUrl for saving
        } as any;
        // Optionally remove originalUrl before saving if desired, but keeping it might be useful
        // delete (currentBlock.props as any).originalUrl;
      }

      // Process children recursively
      if (currentBlock.children && currentBlock.children.length > 0) {
        currentBlock.children = replaceSignedUrlsWithRelativePaths([...currentBlock.children]);
      }

      // Process content if it is Block[] recursively
      if (isBlockArray(currentBlock.content)) {
        const nestedBlocks = currentBlock.content;
        currentBlock.content = replaceSignedUrlsWithRelativePaths([...nestedBlocks]) as any;
      }

      processedBlocks.push(currentBlock);
    }

    return processedBlocks;
  };
  // --- END Helper Function ---

  // --- Helper Function to Resolve Image Paths (Wrapped in useCallback, Type-Safe) ---
  const resolveImagePathsToUrls = useCallback(async (blocks: Block[]): Promise<Block[]> => {
    const processedBlocks: Block[] = [];

    const isBlockArray = (content: any): content is Block[] => {
       return Array.isArray(content) && content.length > 0 &&
              content.every(item => typeof item === 'object' && item !== null && 'id' in item && 'type' in item);
    }

    for (const block of blocks) {
      let currentBlock: Block = JSON.parse(JSON.stringify(block)); // Deep copy to avoid modifying original state directly

      // Process image blocks
      if (currentBlock.type === 'image' && currentBlock.props?.url) {
        const url = currentBlock.props.url;
        // Only process if it looks like a relative path and hasn't been processed already (doesn't have originalUrl)
        if (typeof url === 'string' && 
            (url.startsWith('artifact-images/') || url.startsWith('conversation-images/')) && 
            !(currentBlock.props as any).originalUrl) {
          try {
            const relativePath = url; // Keep original path
            const signedUrl = await ImageService.getAuthenticatedUrl(relativePath); // Gets signed URL
            // Update the props on the currentBlock being processed
            currentBlock.props = { 
              ...(currentBlock.props || {}), 
              url: signedUrl,          // Update URL for display
              originalUrl: relativePath // Store the original relative path
            } as any;
          } catch (error) {
            console.error(`Failed to get authenticated URL for ${url}:`, error);
            // Keep the original relative path in props.url if resolution fails
          }
        }
      }

      // Process children recursively
      if (currentBlock.children && currentBlock.children.length > 0) {
         currentBlock.children = await resolveImagePathsToUrls([...currentBlock.children]);
      }

      // Process content if it is Block[] recursively
      if (isBlockArray(currentBlock.content)) {
          const nestedBlocks = currentBlock.content;
          // Ensure we pass copies to avoid mutation issues if the same block appears multiple times
          const processedNestedBlocks = await resolveImagePathsToUrls([...nestedBlocks.map(b => JSON.parse(JSON.stringify(b)))]);
          currentBlock.content = processedNestedBlocks as any;
      }

      processedBlocks.push(currentBlock);
    }

    return processedBlocks;
  }, []);
  // --- END Helper Function ---

  // --- NEW: Core Sync Logic (to be throttled) ---
  // Renamed to Core, removed useCallback as it's handled by the ref pattern now
  const syncToDatabaseCore = async () => {
    // Use state directly here as the ref pattern ensures the latest state is available
    if (!user || !currentArtifactId || !isSyncPending || isSyncing) {
      console.log('Sync skipped:', { hasUser: !!user, currentArtifactId, isSyncPending, isSyncing });
      return;
    }

    console.log(`Attempting DB sync for artifact: ${currentArtifactId}`);
    if (isMounted.current) {
      setIsSyncing(true);
      setLastSyncError(null); // Clear previous error on new attempt
    }

    let dataToSync: LocalArtifactData | null = null;
    try {
      const localDataString = localStorage.getItem(`artifact-data-${currentArtifactId}`);
      if (localDataString) {
        dataToSync = JSON.parse(localDataString);
      }
    } catch (e) {
      console.error("Critical Error: Failed to read/parse local data before DB sync:", e);
      if (isMounted.current) {
        setLastSyncError("Failed to read local data for sync.");
        setIsSyncing(false);
        // Keep isSyncPending true, as data is unsynced
      }
      return; // Stop the sync process
    }

    if (!dataToSync || !dataToSync.content || !dataToSync.title) {
      console.error("Cannot sync to server: Invalid or missing local data.");
       if (isMounted.current) {
         setLastSyncError("Local data is missing or corrupt.");
         setIsSyncing(false);
         // Keep isSyncPending true
       }
      return;
    }

    try {
      let success = false;
      if (!isArtifactPersisted) {
        console.log('Creating new artifact on server...');
        success = await ArtifactService.createArtifactWithId(
          currentArtifactId,
          user.id,
          dataToSync.title,
          dataToSync.content
        );
        if (success && isMounted.current) {
          setIsArtifactPersisted(true);
          // Update URL if needed (only if we started without an artifactIdParam)
          if (!artifactIdParam) {
            const url = new URL(window.location.href);
            url.searchParams.set('artifactId', currentArtifactId);
            window.history.replaceState({}, '', url.toString());
          }
        }
      } else {
        console.log('Updating existing artifact on server...');
        // Perform update (consider combining title/content update in service later)
        // For simplicity, update both even if only one might have changed since last *local* save
        await ArtifactService.updateArtifactTitle(currentArtifactId, dataToSync.title);
        success = await ArtifactService.updateArtifactContent(
          currentArtifactId,
          dataToSync.content,
          user.id
        );
      }

      if (success) {
        console.log('DB sync successful.');
        if (isMounted.current) {
          setIsSyncPending(false); // Data sent is now synced
          setLastSyncError(null);
        }
      } else {
        console.error('DB sync failed (API reported failure).');
         if (isMounted.current) {
           setLastSyncError("Failed to save changes to server.");
           // Keep isSyncPending true
         }
      }
    } catch (error: any) {
      console.error('Error during DB sync:', error);
      if (isMounted.current) {
        setLastSyncError(`Sync error: ${error.message || 'Unknown error'}`);
        // Keep isSyncPending true
      }
    } finally {
      if (isMounted.current) {
        setIsSyncing(false);
      }
    }
  };
  // --- END Core Sync Logic ---

  // --- NEW: Ref + Effect to keep sync logic up-to-date ---
  const latestSyncFn = useRef(syncToDatabaseCore);

  useEffect(() => {
    latestSyncFn.current = syncToDatabaseCore;
  }, [user, currentArtifactId, isSyncPending, isSyncing, isArtifactPersisted, artifactIdParam]); // Add ALL dependencies used inside syncToDatabaseCore
  // --- END Ref + Effect ---

  // --- NEW: Throttled DB Sync Function ---
  // Throttled function now calls the *latest* function via the ref
  // useMemo ensures the throttle function itself is stable
  const throttledDbSync = useMemo(() =>
    throttle(() => {
        latestSyncFn.current(); // Execute the latest sync logic
    }, 10000, { leading: true, trailing: true })
  , []); // Empty dependency array is correct here - throttle function is created once
  // --- END Throttled DB Sync ---

  // --- NEW: Core Local Save Logic (to be debounced) ---
  const saveToLocalStorage = useCallback((contentToSave: Block[], titleToSave: string) => {
    if (!currentArtifactId) { // Removed isDirty check as it's implied by calling this
      console.log('Local save skipped: No artifact ID');
      return;
    }

    console.log(`Saving to local storage for artifact: ${currentArtifactId}`);
    try {
      const dataToStore: LocalArtifactData = {
        content: contentToSave,   // Use passed content
        title: titleToSave,       // Use passed title
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(`artifact-data-${currentArtifactId}`, JSON.stringify(dataToStore));

      if (isMounted.current) {
        setIsDirty(false); // Changes are now saved locally
        setIsSyncPending(true); // Mark that these changes need DB sync
        setLastSyncError(null); // Clear any previous error after successful local save
      }
      // REMOVED: throttledDbSync(); - Sync will be triggered by useEffect watching isSyncPending

    } catch (error) {
      console.error('Error saving to local storage:', error);
      // Optional: Indicate local save error state? For now, just log.
    }
    // Dependencies updated: Removed editorContent, title, isDirty
  }, [currentArtifactId]); // REMOVED throttledDbSync from dependencies
  // --- END Core Local Save ---

  // --- NEW: Trigger Sync via Effect when Pending ---
  useEffect(() => {
    // If there are pending changes and we are not currently syncing,
    // trigger the throttled sync function.
    if (isSyncPending && !isSyncing && isMounted.current) {
      console.log('useEffect triggering throttledDbSync due to isSyncPending=true');
      throttledDbSync();
    }
  }, [isSyncPending, isSyncing, throttledDbSync]); // Effect depends on these states/functions
  // --- END Trigger Sync Effect ---

  // --- NEW: Debounced Local Save Function ---
  // Now expects content and title arguments
  const debouncedLocalSave = useRef(
    debounce((content: Block[], currentTitle: string) => {
        saveToLocalStorage(content, currentTitle);
    }, 3000)
  ).current;
  // --- END Debounced Local Save ---

  // --- UPDATED: Handle Title Changes ---
  const handleTitleChange = useCallback((newTitle: string) => {
    if (isMounted.current) {
      setTitle(newTitle);
      setIsDirty(true); // Mark editor as dirty
      setLastSyncError(null); // Clear error when user types
      setUserHasManuallySetTitle(true); // NEW: Mark that user has manually set the title
      // Trigger the debounce on title change, passing current editorContent and new title
      debouncedLocalSave(editorContent, newTitle);
    }
  }, [debouncedLocalSave, editorContent, userHasManuallySetTitle]); // Added editorContent dependency

  // --- UPDATED: Handle Content Changes ---
  const handleContentChange = useCallback((content: Block[]) => {
    setEditorContent(content); // Ensure this line is uncommented
    if (isMounted.current) {
      setIsDirty(true); // Mark editor as dirty
      setLastSyncError(null); // Clear error when user types
      // Trigger the debounce on content change, passing the new content and current title
      debouncedLocalSave(content, title);
    }
  }, [debouncedLocalSave, title]); // Added title dependency

  // Infer title based on content
  const inferTitle = useCallback(async (artifactId: string, contentForInference: Block[]) => {
    if (!user) return; // Need user context

    // MODIFIED Check: Skip if user manually set the title OR if it's not the default placeholder
    if (userHasManuallySetTitle || title !== 'Untitled Artifact') {
       console.log('Skipping title inference: User manually set title or title is not default.', { userHasManuallySetTitle, currentTitle: title });
       return;
    }

    const textContent = extractTextForInference(contentForInference);

    if (textContent.length < 20) {
      return; // Don't infer if content is too short
    }

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
        if (data.success && data.title && isMounted.current) {
          // Update title via the handler to centralize logic (sets isDirty, triggers debounce)
          handleTitleChange(data.title);
        } else {
          console.warn('Title inference API call succeeded but returned no title.');
        }
      } else {
        console.error('Title inference API call failed:', response.statusText);
      }
    } catch (error) {
      console.error('Error calling title inference API:', error);
    }
  }, [user, title, handleTitleChange, userHasManuallySetTitle]); // ADDED userHasManuallySetTitle dependency

  // Load an artifact from Supabase
  const loadArtifact = useCallback(async (idToLoad: string, user: User) => {

    // NEW Check: Prevent UI flash if loading the same ID (e.g., on tab focus)
    if (idToLoad === currentArtifactId && isMounted.current) {
      console.log(`loadArtifact called for the same ID (${idToLoad}) - likely a refresh trigger. Skipping UI flash.`);
      // TODO: Optionally implement a silent background data refresh here if needed.
      return; 
    }

    // Reset state for loading (only runs if idToLoad is different)
    if (isMounted.current) {
      setTitle('Loading...');
      setEditorContent([]);
      setIsDirty(false);
      setIsSyncPending(false);
      setIsSyncing(false);
      setLastSyncError(null);
      setIsArtifactPersisted(false); // Assume not persisted until confirmed
      setCurrentArtifactId(idToLoad); // Set the ID being loaded
      setUserHasManuallySetTitle(false); // NEW: Reset manual title flag on load
    }

    let loadedTitle = 'Untitled Artifact';
    let loadedContent: Block[] = [];
    let finalSyncPending = false;
    let loadedDataTimestamp: Date | null = null;
    let initialUserSetTitle = false; // NEW: Track if loaded title was user-set

    try {
      console.log(`Attempting to load artifact data for ID: ${idToLoad}`);

      // 1. Fetch from server
      let serverArtifact = null;
      let serverError = false;
      try {
        serverArtifact = await ArtifactService.getArtifact(idToLoad);
        if (serverArtifact && isMounted.current) {
          setIsArtifactPersisted(true); // Mark as persisted if found on server
        }
      } catch (error) {
        console.error('Error loading artifact from server:', error);
        serverError = true;
      }
      const serverUpdate = serverArtifact?.updatedAt ? new Date(serverArtifact.updatedAt) : null;

      // 2. Check local storage
      let localData: LocalArtifactData | null = null;
      try {
        const localDataString = localStorage.getItem(`artifact-data-${idToLoad}`);
        if (localDataString) localData = JSON.parse(localDataString);
      } catch (e) {
        console.warn("Failed to parse local data for artifact:", e);
      }
      const localUpdate = localData?.updatedAt ? new Date(localData.updatedAt) : null;

      // 3. Decide what to load & Set Initial State
      if (localUpdate && (!serverUpdate || localUpdate > serverUpdate)) {
        // Local is newer or server failed/doesn't exist
        console.log('Loading newer data from local storage.');
        loadedContent = localData!.content;
        loadedTitle = localData!.title;
        loadedDataTimestamp = localUpdate;
        if (serverArtifact) { // Only sync pending if server version exists but is older
           finalSyncPending = true;
        } else {
           finalSyncPending = !serverError; // Sync pending if it's a new artifact or server errored
        }
      } else if (serverArtifact) {
        // Server is newer or same age, or local doesn't exist
        console.log('Loading data from server.');
        loadedContent = serverArtifact.content;
        loadedTitle = serverArtifact.title;
        loadedDataTimestamp = serverUpdate;
        finalSyncPending = false; // Server is the source of truth, no sync pending initially
        // Clear potentially stale local data
        localStorage.removeItem(`artifact-data-${idToLoad}`);
      } else if (serverError) {
        // Server error and no local data
        console.error('Failed to load artifact from server and no local backup found.');
        loadedTitle = 'Loading Error';
        loadedContent = [];
        finalSyncPending = false; // Cannot sync if nothing loaded
      } else {
        // Neither server nor local found (likely a brand new artifact ID)
        console.log(`Artifact ${idToLoad} not found. Starting fresh.`);
        loadedTitle = 'Untitled Artifact';
        loadedContent = [];
        finalSyncPending = false; // New artifact, nothing to sync initially
        setIsArtifactPersisted(false); // Explicitly not persisted
      }

      // NEW: Determine if the loaded title indicates a prior manual setting
      if (loadedTitle !== 'Untitled Artifact') {
        initialUserSetTitle = true;
      }

      // 4. Update Component State with RAW content
      if (isMounted.current) {
        console.log(`Setting initial editor state (raw): Title=${loadedTitle}, Content blocks=${loadedContent.length}`);
        setTitle(loadedTitle);
        setEditorContent(loadedContent); // <-- Set RAW content here
        setIsDirty(false);
        setIsSyncPending(finalSyncPending);
        setUserHasManuallySetTitle(initialUserSetTitle); // NEW: Set based on loaded title

        // Save the loaded state back to local storage as the initial baseline
        if (loadedDataTimestamp) {
           try {
             const baselineData: LocalArtifactData = {
               content: loadedContent,
               title: loadedTitle,
               updatedAt: loadedDataTimestamp.toISOString(),
             };
             localStorage.setItem(`artifact-data-${idToLoad}`, JSON.stringify(baselineData));
             console.log('Initial baseline saved to local storage.');
           } catch(e) { console.error("Failed to save initial baseline to local storage", e); }
        } else {
           // If nothing was loaded, clear local storage just in case
           localStorage.removeItem(`artifact-data-${idToLoad}`);
        }
      }

      // Post-load title inference
      const isPlaceholderTitle = !loadedTitle || loadedTitle === 'Untitled Artifact';
      // MODIFIED Check: Only infer if title is placeholder AND user hasn't manually set it yet
      if (isPlaceholderTitle && !initialUserSetTitle && loadedContent.length > 0 && isMounted.current) {
         setTimeout(() => inferTitle(idToLoad, loadedContent), 500);
      }

    } catch (error) {
      // Catch any unexpected errors during the loading/decision logic
      console.error('Unexpected error during artifact loading process:', error);
      if (isMounted.current) {
        setTitle('Error');
        setEditorContent([]);
        setIsDirty(false);
        setIsSyncPending(false);
        setLastSyncError("Unexpected error loading artifact.");
      }
    }
  }, [inferTitle, user, currentArtifactId]); // <-- ADDED currentArtifactId dependency

  // Listen for artifact selection events from FileExplorer
  useEffect(() => {
    const handleArtifactSelected = (event: CustomEvent) => {
      const { artifactId: selectedId } = event.detail;
      if (selectedId && user && selectedId !== currentArtifactId) {
        console.log(`Loading artifact from event: ${selectedId}`);
        // Before loading, check if current artifact has unsaved changes THAT NEED SYNCING
        if (isSyncPending && isMounted.current) {
           console.warn("Switching artifact with pending server changes. Attempting final sync...");
           // Attempt an immediate sync - use the *latest* function directly
           latestSyncFn.current();
        }
        // Cancel any pending debounced saves for the *old* artifact
        debouncedLocalSave.cancel();
        loadArtifact(selectedId, user);
      }
    };
    window.addEventListener('artifactSelected', handleArtifactSelected as EventListener);
    return () => {
      window.removeEventListener('artifactSelected', handleArtifactSelected as EventListener);
    };
    // Removed syncToDatabase dependency, it's handled via latestSyncFn ref now
  }, [user, loadArtifact, currentArtifactId, isSyncPending, debouncedLocalSave]);

  // Load artifact if ID is provided in URL and different from current
  useEffect(() => {
    if (artifactIdParam && user && artifactIdParam !== currentArtifactId) {
      console.log(`Loading artifact from URL: ${artifactIdParam}`);
       if (isSyncPending && isMounted.current) {
           console.warn("Loading from URL with pending server changes. Attempting final sync...");
           latestSyncFn.current(); // Attempt sync using latest logic
       }
       // Cancel any pending debounced saves for the *old* artifact
       debouncedLocalSave.cancel();
      loadArtifact(artifactIdParam, user);
    }
    // Removed syncToDatabase dependency
  }, [artifactIdParam, user, loadArtifact, currentArtifactId, isSyncPending, debouncedLocalSave]);

  // --- NEW: beforeunload Handler ---
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Check if there are pending changes that haven't been synced
      if (isSyncPending) {
        // Optionally, provide a standard message
        event.preventDefault(); // Standard practice for some browsers
        event.returnValue = ''; // Standard practice for others

        console.warn("Unload detected with pending changes. Attempting final sync...");
        // Attempt a final sync using the latest logic directly
        latestSyncFn.current();

        // Note: Using navigator.sendBeacon might be more reliable here for out-of-band data,
        // but requires backend changes and is more complex. Sticking with async for now.
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cancel any pending debounced/throttled calls on component unmount
      debouncedLocalSave.cancel();
      throttledDbSync.cancel(); // Cancel the throttle wrapper too
    };
    // Removed syncToDatabase dependency
  }, [isSyncPending, debouncedLocalSave, throttledDbSync]);

  // --- NEW useEffect Hook for Processing Image URLs ---
  useEffect(() => {
    // Only run if component is mounted and content exists
    if (!isMounted.current || !editorContent || editorContent.length === 0) {
      return;
    }

    let needsProcessing = false;
    let processingInProgress = false;

    // Recursive check function
    const checkNeedsProcessing = (blocks: Readonly<Block[]>) => {
      for (const block of blocks) {
        if (needsProcessing) return;
        if (block.type === 'image' && block.props?.url && typeof block.props.url === 'string' &&
            (block.props.url.startsWith('artifact-images/') || block.props.url.startsWith('conversation-images/'))) {
          needsProcessing = true;
          return;
        }
        if (block.children && block.children.length > 0) checkNeedsProcessing(block.children);
        // Basic check for block array content
        if (Array.isArray(block.content) && block.content.length > 0 && typeof block.content[0] === 'object' && 'type' in block.content[0]) {
            // Use 'as any' here for the recursive *check* to satisfy linter
            checkNeedsProcessing(block.content as any);
        }
      }
    };

    checkNeedsProcessing(editorContent);

    // If unprocessed paths exist and we aren't already processing
    if (needsProcessing && !processingInProgress) {
      console.log("useEffect: Detected unprocessed image paths. Starting resolution...");
      processingInProgress = true; // Set flag

      resolveImagePathsToUrls(editorContent) // Use the stable callback
        .then(processedContent => {
          // Check mount status again *inside* the promise resolution
          if (isMounted.current) {
            // Only update if the content actually changed after processing
            if (JSON.stringify(processedContent) !== JSON.stringify(editorContent)) {
               console.log("useEffect: Image paths resolved. Updating editor content.");
               setEditorContent(processedContent);
            } else {
               console.log("useEffect: Processed content is identical to current. Skipping update.");
            }
          } else {
             console.log("useEffect: Component unmounted before image processing completed.");
          }
        })
        .catch(error => {
          console.error("useEffect: Error processing image URLs:", error);
          // Optionally set an error state here
        })
        .finally(() => {
           processingInProgress = false; // Reset flag
        });
    } else if (!needsProcessing) {
       // console.log("useEffect: editorContent does not require image processing."); // Optional log
    }

  }, [editorContent, resolveImagePathsToUrls]); // Run when content or the (stable) function changes
  // --- END NEW useEffect Hook ---

  // Initialize: Load or setup new artifact
  useEffect(() => {
    if (artifactIdParam && user) {
      console.log('Initial load based on URL artifactId');
      // Call loadArtifact here if needed
      loadArtifact(artifactIdParam, user);
    } else if (!artifactIdParam && user && currentArtifactId) {
      // Handle case where there's no artifactId in URL (new artifact)
      console.log('Initial setup for new artifact with ID:', currentArtifactId);
      if (isMounted.current) {
        // Set initial state for a new artifact
        setTitle('Untitled Artifact');
        setEditorContent([]);
        setIsDirty(false);
        setIsSyncPending(false); // New artifact doesn't need sync initially
        setIsSyncing(false);
        setLastSyncError(null);
        setIsArtifactPersisted(false);
      }
    }
    // Removed loadArtifact from dependencies to prevent loop on new artifact setup
  }, [artifactIdParam, user, currentArtifactId]); // <-- loadArtifact REMOVED

  // Memoize editor props (Ensure handleContentChange/handleTitleChange are stable via useCallback)
  const editorProps = useMemo(() => {
    return {
      initialContent: editorContent, // Pass the state set by loadArtifact
      onChange: handleContentChange, // Stable useCallback reference
      artifactId: currentArtifactId,
      userId: user?.id
    };
  }, [editorContent, handleContentChange, currentArtifactId, user?.id]); // Dependencies updated

  // Show a loading state if user data is still loading
  if (isLoading) {
    return <div className="loading">Loading user data...</div>;
  }

  // --- UPDATED: Save Status Display Logic ---
  const getSaveStatusMessage = (): string => {
      if (lastSyncError) return `❌: ${lastSyncError}`;
      if (isSyncing) return "☁️"; //Syncing to server...
      if (isSyncPending) return "⏳"; //Changes saved locally, sync pending...
      if (isDirty) return "💾"; // Indicates changes made, debounce timer running
      if (!isDirty && !isSyncPending) return "✅"; // Idle state, fully synced
      return ""; // Should ideally not happen
  };

  const getSaveStatusTitle = (): string => {
      return `Dirty: ${isDirty} | Sync Pending: ${isSyncPending} | Syncing: ${isSyncing} | Persisted: ${isArtifactPersisted}`;
  };
  // --- END Save Status Display Logic ---

  return (
    <main className="app-container">
      <header>
        <div className="header-content" style={{ paddingLeft: 0 }}>
          <h1 className="font-jetbrains-mono" style={{ paddingLeft: '8px' }}>tuon.io</h1>
          
          <GlobalSearch />
          
          <div className="header-actions">
            <div className="save-status" title={getSaveStatusTitle()}>
                <span>{getSaveStatusMessage()}</span>
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