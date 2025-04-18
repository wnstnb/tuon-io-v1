'use client';

import React, { useState, useEffect, Suspense, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelGroupHandle } from 'react-resizable-panels';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import { Newsreader } from 'next/font/google';
import Editor from '../components/Editor';
import EditorFAB from '../components/EditorFAB';
import TitleBar from '../components/TitleBar';
import { FileExplorer } from '../components/FileExplorer';
import RightPane from '../components/RightPane';
import GlobalSearch from '../components/GlobalSearch';
import ChatInput from '../components/ChatInput';
import { type Block, type PartialBlock, BlockNoteEditor } from "@blocknote/core";
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';
import { User } from '@supabase/supabase-js';
import { ArtifactService } from '../lib/services/ArtifactService';
import { debounce, throttle } from 'lodash-es';
import { ImageService } from '../lib/services/ImageService';
import { useAI } from '../context/AIContext';
import { Loader2 } from 'lucide-react';
import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";
import { ArtifactNotFoundError } from '../lib/services/ArtifactService';
import Image from 'next/image';

// Initialize the Newsreader font
const newsreader = Newsreader({ 
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

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

  const { signOut, user, isLoading: isSupabaseLoading } = useSupabase();
  const { 
    findConversationByArtifactId, 
    selectConversation, 
    createNewConversation,
    currentConversation,
    isLoading: isAILoading
  } = useAI();

  const [title, setTitle] = useState<string>('Untitled Artifact');
  const [editorContent, setEditorContent] = useState<Block[]>([]);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [rightPanelSize, setRightPanelSize] = useState<number>(25);
  const [isRightPanelAnimating, setIsRightPanelAnimating] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [bottomPanelSize, setBottomPanelSize] = useState(20);
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);
  const [isBottomPanelAnimating, setIsBottomPanelAnimating] = useState(false);

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
  const [pendingSyncArtifactId, setPendingSyncArtifactId] = useState<string | null>(null); // ID waiting for DB sync
  const [lastSuccessfulSyncTime, setLastSuccessfulSyncTime] = useState<Date | null>(null); // NEW: Track last successful sync time
  const [isEditorProcessing, setIsEditorProcessing] = useState<boolean>(false);

  // Ref for PanelGroup imperative API
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const verticalPanelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  // Ref to track previous message count for toast notifications
  const prevMessagesCountRef = useRef<number>(0);

  // --- NEW: Calculate SyncStatus based on state --- //
  const getSaveStatus = useCallback((): SyncStatus => {
    if (lastSyncError) return 'error';
    if (isSyncing) return 'syncing';
    if (isSyncPending) return 'pending';
    if (!isDirty && !isSyncPending) return 'synced'; // Explicitly 'synced'
    return 'idle'; // Default to idle if conditions above not met (e.g., isDirty but not yet pending)
  }, [isDirty, isSyncing, isSyncPending, lastSyncError]);
  // --- END SyncStatus Calculation --- //

  // Ref to track if component is mounted to avoid state updates after unmount
  const isMounted = useRef(true);
  const editorRef = useRef<BlockNoteEditor | null>(null); // Ref to store editor instance

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  // -- END NEW State Management --

  // --- Force Sync Function --- //
  const forceSync = useCallback(() => {
    if (!currentArtifactId) return;
    if (process.env.NODE_ENV === 'development') console.log(`Manual sync triggered for artifact: ${currentArtifactId}.`);
    // Directly call the latest sync logic, passing the current ID
    latestSyncFn.current(currentArtifactId);
  }, [currentArtifactId]);

  // Basic UI interaction callbacks
  const toggleRightPanel = useCallback(() => {
    const panelGroup = panelGroupRef.current;
    if (!panelGroup) return;

    setIsRightPanelAnimating(true); // Set animating flag BEFORE layout change

    if (showRightPanel) {
      // Collapse
      panelGroup.setLayout([100, 0]);
    } else {
      // Expand - use the stored rightPanelSize or a default
      const targetSize = rightPanelSize > 0 ? rightPanelSize : 25; // Ensure we expand to a non-zero size
      panelGroup.setLayout([100 - targetSize, targetSize]);
    }

    // Reset animation flag after the transition duration (MUST match CSS)
    setTimeout(() => {
      setIsRightPanelAnimating(false);
      // Note: showRightPanel state is managed by onCollapse/onExpand handlers
    }, 300); // Match CSS transition duration (e.g., 0.3s)

  }, [showRightPanel, rightPanelSize]);

  const handlePanelResize = useCallback((sizes: number[]) => {
    // Only update the stored size if the right panel is actually visible and being resized
    // This prevents overwriting the desired size when it's collapsed (size[1] would be 0)
    if (sizes.length === 2 && showRightPanel && sizes[1] > 0) { 
       // Store the size percentage when user drags
       if (Math.abs(sizes[1] - rightPanelSize) > 0.5) {
           setRightPanelSize(sizes[1]);
           if (process.env.NODE_ENV === 'development') console.log('Right panel size stored:', sizes[1]);
       }
    } 
    // No need to log content panel size unless debugging
    // else if (sizes.length > 0) {
    //     console.log('Content panel size:', sizes[0]);
    // }
  }, [rightPanelSize, showRightPanel]);

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

  // --- NEW: Core Sync Logic (with error handling for not found) ---
  const syncToDatabaseCore = async (syncIdOverride?: string) => {
    // Use override if provided (manual sync), otherwise use the CURRENT artifact ID
    // This is the crucial change - we always want to use the current artifact ID
    const idToSync = syncIdOverride || currentArtifactId;

    // Use state directly here as the ref pattern ensures the latest state is available
    // --- Check if ID to sync is valid --- //
    if (!user || !idToSync || isSyncing) {
      console.warn(`Sync skipped because a condition was not met:`, {
        hasUser: !!user,
        hasIdToSync: !!idToSync,
        isSyncing: isSyncing
      });
      return;
    }

    // --- Log IDs for debugging --- //
    if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Syncing with current artifact ID: ${currentArtifactId}, idToSync: ${idToSync}`);
    // --- END Log --- //
    
    // --- Only proceed if sync is actually pending for THIS artifact --- //
    // Read local storage JUST for the update time to check if sync is needed
    let localTimestamp: string | null = null;
    try {
      const localDataString = localStorage.getItem(`artifact-data-${idToSync}`);
      if (localDataString) {
        localTimestamp = JSON.parse(localDataString).updatedAt;
      }
    } catch { /* ignore parsing error here */ }
    
    if (!isSyncPending && !syncIdOverride) { // Don't skip if manually forced via override
        if (process.env.NODE_ENV === 'development') console.log(`Sync skipped for ${idToSync}: isSyncPending is false.`);
        return;
    }
    // --- End Check --- //

    if (process.env.NODE_ENV === 'development') console.log(`Attempting DB sync for artifact: ${idToSync}`);
    if (isMounted.current) {
      setIsSyncing(true);
      setLastSyncError(null); // Clear previous error on new attempt
    }

    let dataToSync: LocalArtifactData | null = null;
    try {
      // CRITICAL: Read from localStorage using idToSync, not pendingSyncArtifactId
      // This ensures we're syncing the right data for the right artifact
      const localDataString = localStorage.getItem(`artifact-data-${idToSync}`);
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

    // --- ADD DIAGNOSTIC LOG (Simplified) --- //
    if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: About to sync artifact ${idToSync}.`, { // Use idToSync
      title: dataToSync.title,
      contentBlockCount: dataToSync.content?.length ?? 0 // Log block count
    });
    // --- END DIAGNOSTIC LOG --- //

    // --- Log content read from storage --- //
    if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Read from localStorage: title='${dataToSync.title}', blockCount=${dataToSync.content?.length ?? 0}`, { content: JSON.stringify(dataToSync.content?.slice(0, 1)) }); // Log first block

    // --- ADD MORE DETAILED LOGGING ---
    if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Current artifact persistence state: isArtifactPersisted=${isArtifactPersisted}`);
    if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Current artifact ID vs sync ID: currentArtifactId=${currentArtifactId}, idToSync=${idToSync}`);
    // --- END ADDITIONAL LOGGING ---

    let success = false; // Initialize success flag
    let syncAttemptError: any = null; // Store potential errors

    try {
      // Determine if we should attempt create or update
      // TODO: Refine this persistence check - it's still a potential source of issues.
      // Maybe query DB explicitly if unsure?
      const assumePersisted = isArtifactPersisted || (idToSync !== currentArtifactId);
      if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Assuming artifact ${idToSync} is persisted: ${assumePersisted}`);

      if (!assumePersisted) {
        if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Entering CREATE path for artifact ${idToSync}...`);
        success = await ArtifactService.createArtifactWithId(
          idToSync,
          user.id,
          dataToSync.title,
          dataToSync.content
        );
        if (success && isMounted.current) {
          setIsArtifactPersisted(true); // Mark as persisted after successful creation
          // Update URL if needed (only if we started without an artifactIdParam)
          if (!artifactIdParam) {
            const url = new URL(window.location.href);
            url.searchParams.set('artifactId', idToSync);
            window.history.replaceState({}, '', url.toString());
          }
        }
      } else {
        // --- UPDATED: Wrap UPDATE logic in try/catch for ArtifactNotFoundError ---
        if (process.env.NODE_ENV === 'development') console.log(`syncToDatabaseCore: Entering UPDATE path for artifact ${idToSync}...`);
        try {
          // Try updating title first (if combined later, adjust logic)
          // Note: updateArtifactTitle now throws ArtifactNotFoundError if it doesn't exist
          await ArtifactService.updateArtifactTitle(idToSync, dataToSync.title, user.id);

          // Then try updating content
          // Note: updateArtifactContent also throws ArtifactNotFoundError if it doesn't exist
          success = await ArtifactService.updateArtifactContent(
            idToSync,
            dataToSync.content,
            user.id
          );
          // If both updates succeed (or content update succeeds after title), mark overall success
          // If title update failed with ArtifactNotFound, the content update won't run.
          // If title succeeded but content failed with ArtifactNotFound, success will be false.

        } catch (updateError: any) {
          if (updateError instanceof ArtifactNotFoundError) {
            console.warn(`syncToDatabaseCore: Update failed because artifact ${idToSync} not found. Attempting CREATE instead.`);
            // The artifact we tried to update doesn't exist, so try creating it.
            try {
              success = await ArtifactService.createArtifactWithId(
                idToSync,
                user.id,
                dataToSync.title,
                dataToSync.content
              );
              if (success && isMounted.current) {
                setIsArtifactPersisted(true); // Mark as persisted after successful creation
                // Update URL if needed
                if (!artifactIdParam) {
                  const url = new URL(window.location.href);
                  url.searchParams.set('artifactId', idToSync);
                  window.history.replaceState({}, '', url.toString());
                }
              }
            } catch (createError: any) {
              console.error(`syncToDatabaseCore: Fallback CREATE attempt for ${idToSync} also failed:`, createError);
              syncAttemptError = createError; // Store the creation error
              success = false;
            }
          } else {
            // Re-throw other update errors to be caught by the outer catch block
            throw updateError;
          }
        }
        // --- END UPDATED try/catch --- //
      }

      // --- State updates based on final success/failure --- //
      if (success) {
        if (process.env.NODE_ENV === 'development') console.log(`DB sync successful for ${idToSync}.`);
        if (isMounted.current) {
          setIsSyncPending(false);
          setLastSyncError(null);
          setLastSuccessfulSyncTime(new Date());
          if (idToSync === pendingSyncArtifactId) {
            setPendingSyncArtifactId(null); // Clear pending ID only if this sync was for it
          }
        }
      } else {
        console.error(`DB sync failed for ${idToSync} (API reported failure or fallback create failed).`);
        if (isMounted.current) {
          // Use the specific error if available, otherwise generic message
          const errorMessage = syncAttemptError?.message || "Failed to save changes to server.";
          setLastSyncError(errorMessage);
          // Keep isSyncPending true, DO NOT clear pendingSyncArtifactId on failure
        }
      }

    } catch (error: any) {
      // Catch errors from the initial CREATE attempt or re-thrown errors from UPDATE attempt
      console.error(`Error during DB sync process for ${idToSync}:`, error);
      if (isMounted.current) {
        setLastSyncError(`Sync error: ${error.message || 'Unknown error'}`);
        // Keep isSyncPending true, DO NOT clear pendingSyncArtifactId on exception
      }
      // success remains false
    } finally {
      if (isMounted.current) {
        setIsSyncing(false);
      }
    }
    return success;
  };
  // --- END UPDATED Core Sync Logic ---

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
        // ADDED: Log state *before* calling the sync function
        if (process.env.NODE_ENV === 'development') console.log(`Throttled function executing. Checking conditions...`, {
          hasUser: !!user, // Access user state here
          pendingSyncArtifactId, // Access pending ID state here
          isSyncing, // Access syncing state here
        });
        latestSyncFn.current(); // Execute the latest sync logic
    }, 10000, { leading: true, trailing: true })
  , [user, pendingSyncArtifactId, isSyncing]); // <-- ADD dependencies used in the log
  // --- END Throttled DB Sync ---

  // --- NEW: Debounced Local Save Function ---
  const debouncedLocalSave = useMemo(() => {
    return debounce((content: Block[], titleToSave: string) => {
      if (!isMounted.current) return;
      
      if (process.env.NODE_ENV === 'development') console.log(`Saving to localStorage: artifact=${currentArtifactId}, title=${titleToSave}, blocks=${content.length}`);
      
      try {
        // Prepare the data object
        const updatedAt = new Date().toISOString();
        const artifactData: LocalArtifactData = {
          content: content,
          title: titleToSave,
          updatedAt: updatedAt
        };
        
        // Save the data to localStorage under the CURRENT artifact ID key
        // This ensures we don't create a new artifact when the content is from AI generation
        localStorage.setItem(`artifact-data-${currentArtifactId}`, JSON.stringify(artifactData));
        
        // Mark that syncing to DB is needed
        if (isMounted.current) {
          setIsSyncPending(true);
          setPendingSyncArtifactId(currentArtifactId || null); // Handle undefined by using null
          setIsDirty(false); // Changes are now saved locally
          setLastSyncError(null); // Clear any previous error after successful local save
        }
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
    }, 5000, { leading: false, trailing: true }); // Increased delay to 5000ms
  }, [currentArtifactId]); // Add currentArtifactId as dependency
  
  // --- NEW: Trigger Sync via Effect when Pending ---
  useEffect(() => {
    // If there are pending changes and we are not currently syncing,
    // trigger the throttled sync function **using the pending ID**
    // Update: syncToDatabaseCore now reads pendingSyncArtifactId, so just call throttle.
    if (isSyncPending && pendingSyncArtifactId && !isSyncing && isMounted.current) {
      if (process.env.NODE_ENV === 'development') console.log(`useEffect triggering throttledDbSync for pending artifact ${pendingSyncArtifactId}`);
      // The throttled function calls latestSyncFn.current(), which will now use pendingSyncArtifactId
      throttledDbSync();
    }
    // Ensure dependencies are correct
  }, [isSyncPending, pendingSyncArtifactId, isSyncing, throttledDbSync]);
  // --- END Trigger Sync Effect ---

  // --- NEW: Editor Reference Setter --- //
  const setEditorReference = useCallback((editor: BlockNoteEditor) => {
    editorRef.current = editor;
  }, []);
  // --- END Editor Reference Setter --- //

  // --- Title Inference Function ---
  const inferTitle = useCallback(async (artifactId: string, contentForInference: Block[]) => {
    if (!user) return; // Need user context

    // --- DIAGNOSTIC LOG ---
    if (process.env.NODE_ENV === 'development') {
      console.log('[InferTitle Check - Inside Function]', {
        userHasManuallySetTitle,
        currentTitle: title, // Log the title state as seen by this function instance
        shouldSkip: userHasManuallySetTitle || title !== 'Untitled Artifact',
      });
    }
    // --- END DIAGNOSTIC LOG ---
    // MODIFIED Check: Skip if user manually set the title OR if it's not the default placeholder
    if (userHasManuallySetTitle || title !== 'Untitled Artifact') {
       if (process.env.NODE_ENV === 'development') console.log('Skipping title inference: User manually set title or title is not default.', { userHasManuallySetTitle, currentTitle: title });
       return;
    }

    const textContent = extractTextForInference(contentForInference);

    if (textContent.length < 20) {
       if (process.env.NODE_ENV === 'development') console.log('[InferTitle] Skipping due to short content (< 20 chars).');
      return; // Don't infer if content is too short
    }

    if (isMounted.current) {
      setIsEditorProcessing(true); // Set processing state to true
    }

    if (process.env.NODE_ENV === 'development') console.log(`[InferTitle] Calling API for artifact ${artifactId}`);

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
          if (process.env.NODE_ENV === 'development') console.log(`[InferTitle] API success, received title: "${data.title}"`);
          
          // --- MODIFIED: Update state directly instead of calling handleTitleChange ---
          const inferredTitle = data.title;
          setTitle(inferredTitle);
          setUserHasManuallySetTitle(true); // <-- Set the flag here
          setIsDirty(true); // Mark as dirty
          setLastSyncError(null); // Clear errors
          // Trigger save with the *new* inferred title and the *current* content
          debouncedLocalSave(editorContent, inferredTitle); 
          // --- END MODIFICATION ---

        } else {
          console.warn('Title inference API call succeeded but returned no title.');
        }
      } else {
        console.error('Title inference API call failed:', response.statusText);
      }
    } catch (error) {
      console.error('Error during title inference:', error);
      // Optionally handle the error state in UI if needed
    } finally {
      if (isMounted.current) {
        setIsEditorProcessing(false); // Ensure processing state is set to false
      }
    }
    // Remove handleTitleChange from dependencies, add editorContent and debouncedLocalSave
  }, [user, title, userHasManuallySetTitle, setUserHasManuallySetTitle, editorContent, debouncedLocalSave, setIsEditorProcessing]); // <-- Added setIsEditorProcessing dependency

  // --- Load Artifact Function ---
  const loadArtifact: (idToLoad: string, user: User) => Promise<void> = useCallback(async (idToLoad, user) => {
    // NEW Check: Prevent UI flash if loading the same ID (e.g., on tab focus)
    if (idToLoad === currentArtifactId && isMounted.current) {
      if (process.env.NODE_ENV === 'development') console.log(`loadArtifact called for the same ID (${idToLoad}) - likely a refresh trigger. Skipping UI flash.`);
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
      if (process.env.NODE_ENV === 'development') console.log(`Attempting to load artifact data for ID: ${idToLoad}`);

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
        if (process.env.NODE_ENV === 'development') console.log('Loading newer data from local storage.');
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
        if (process.env.NODE_ENV === 'development') console.log('Loading data from server.');
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
        if (process.env.NODE_ENV === 'development') console.log(`Artifact ${idToLoad} not found. Starting fresh.`);
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
        if (process.env.NODE_ENV === 'development') console.log(`Setting initial editor state (raw): Title=${loadedTitle}, Content blocks=${loadedContent?.length ?? 0}`); // Log count
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
             if (process.env.NODE_ENV === 'development') console.log('Initial baseline saved to local storage.');
           } catch(e) { console.error("Failed to save initial baseline to local storage", e); }
        } else {
           // If nothing was loaded, clear local storage just in case
           localStorage.removeItem(`artifact-data-${idToLoad}`);
        }
      }

      // --- NEW: Find or Create Linked Conversation --- //
      if (isMounted.current) {
        if (process.env.NODE_ENV === 'development') console.log(`Attempting to find/create conversation linked to artifact ${idToLoad}`);
        const existingConversation = findConversationByArtifactId(idToLoad);

        if (existingConversation) {
          if (process.env.NODE_ENV === 'development') console.log(`Found existing conversation ${existingConversation.id}, selecting it.`);
          // Only select if it's not already the current one
          if (currentConversation?.id !== existingConversation.id) {
            selectConversation(existingConversation.id);
          } else {
            if (process.env.NODE_ENV === 'development') console.log(`Conversation ${existingConversation.id} is already selected.`);
          }
        } else {
          if (process.env.NODE_ENV === 'development') console.log(`No existing conversation found for artifact ${idToLoad}. Creating a new one.`);
          // Pass the artifact ID to create a new, linked conversation
          // Model selection can be default or potentially based on user preferences later
          await createNewConversation(undefined, idToLoad);
          if (process.env.NODE_ENV === 'development') console.log(`createNewConversation called for artifact ${idToLoad}.`);
        }
      }
      // --- END Conversation Linking --- //

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
  }, [user, currentArtifactId, findConversationByArtifactId, selectConversation, createNewConversation, currentConversation]); // REMOVE inferTitle from here

  // --- Handle Title Change Function ---
  const handleTitleChange = useCallback((newTitle: string) => {
    if (isMounted.current) {
      if (process.env.NODE_ENV === 'development') console.log(`handleTitleChange called with: "${newTitle}"`);
      setTitle(newTitle);
      setIsDirty(true); // Mark editor as dirty
      setLastSyncError(null); // Clear error when user types
      setUserHasManuallySetTitle(true); // Mark that user has manually set the title
      // Trigger the debounce on title change, passing current editorContent and new title
      // Make sure editorContent is available here
      debouncedLocalSave(editorContent, newTitle);
    }
    // Ensure editorContent is a dependency if used directly (it is)
  }, [debouncedLocalSave, editorContent]); // Removed userHasManuallySetTitle as it's set here

  // --- Handle Content Change Function ---
  const handleContentChange = useCallback((content: Block[], sourceArtifactId?: string) => {
    // if (process.env.NODE_ENV === 'development') console.log(`handleContentChange called with content blocks: ${content.length}, sourceArtifactId: ${sourceArtifactId || 'none'}`);
    
    // Check if content is coming from a different artifact (AI generation)
    if (sourceArtifactId && sourceArtifactId !== currentArtifactId) {
      if (process.env.NODE_ENV === 'development') console.log(`[ARTIFACT ID MISMATCH] Content change includes source artifactId ${sourceArtifactId}, different from current ${currentArtifactId}`);
      if (process.env.NODE_ENV === 'development') console.log('This is likely content from AI generation. Using the correct artifact ID to prevent orphaned artifacts.');
      
      // First, save the existing data for the current artifact (if any)
      try {
        const existingData = localStorage.getItem(`artifact-data-${currentArtifactId}`);
        if (existingData) {
          // Save the data with a backup name in case we need to recover it
          localStorage.setItem(`artifact-data-${currentArtifactId}-backup`, existingData);
          if (process.env.NODE_ENV === 'development') console.log(`Backed up data for current artifact ${currentArtifactId} before switching`);
        }
      } catch (e) {
        console.error('Error backing up current artifact data:', e);
      }
      
      // Update the current artifact ID to match the source
      // This ensures we don't create a new artifact when saving AI-generated content
      setCurrentArtifactId(sourceArtifactId);
      
      // Since we're changing currentArtifactId, also update persistence flag
      // This helps syncToDatabaseCore make the right decision about create vs update
      setIsArtifactPersisted(true);
      
      if (process.env.NODE_ENV === 'development') console.log(`[ARTIFACT ID UPDATED] Current artifact ID has been updated to: ${sourceArtifactId}`);

      // Now clear the sync pending for the old artifact ID
      if (pendingSyncArtifactId !== sourceArtifactId) {
        // We're switching artifacts, so any pending sync for the old one should be cancelled
        setPendingSyncArtifactId(sourceArtifactId);
        if (process.env.NODE_ENV === 'development') console.log(`Cleared pending sync for previous artifact ID, now tracking: ${sourceArtifactId}`);
      }
      
      // Update the URL to match the new artifact ID
      try {
        const url = new URL(window.location.href);
        const currentUrlArtifactId = url.searchParams.get('artifactId');
        
        if (currentUrlArtifactId !== sourceArtifactId) {
          url.searchParams.set('artifactId', sourceArtifactId);
          window.history.replaceState({}, '', url.toString());
          if (process.env.NODE_ENV === 'development') console.log(`Updated URL to reflect new artifact ID: ${sourceArtifactId}`);
        }
      } catch (e) {
        console.error('Error updating URL with new artifact ID:', e);
      }
    } else {
      if (sourceArtifactId) {
        // if (process.env.NODE_ENV === 'development') console.log(`Content change has matching artifactId: ${sourceArtifactId} (matches current)`);
      } else {
        // if (process.env.NODE_ENV === 'development') console.log(`Content change has no source artifactId (likely user edit)`);
      }
    }
    
    setEditorContent(content); // Update editor content state
    if (isMounted.current) {
      setIsDirty(true); // Mark editor as dirty
      setLastSyncError(null); // Clear error when user types
      // Trigger the debounce on content change, passing the new content and current title
      debouncedLocalSave(content, title);

      // Only trigger title inference if this is a user edit (no sourceArtifactId)
      // and we haven't already inferred or set a title, AND we are not currently processing
      if (!sourceArtifactId &&
          title === 'Untitled Artifact' &&
          !userHasManuallySetTitle &&
          content.length > 0 &&
          !isEditorProcessing
          ) {
        const artifactIdForInference = currentArtifactId;
        if (artifactIdForInference) {
          if (process.env.NODE_ENV === 'development') {
             console.log(`[InferTitle Check - ContentChange] Conditions met. Triggering inference for artifact ${artifactIdForInference}.`);
          }
          // Call inferTitle directly (now defined above)
          inferTitle(artifactIdForInference, content);
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[InferTitle Check - ContentChange] Cannot infer title, missing artifact ID.');
          }
        }
      }
    }
  }, [user, currentArtifactId, title, userHasManuallySetTitle, debouncedLocalSave, inferTitle, isEditorProcessing]); // Added title, userHasManuallySetTitle, and isEditorProcessing

  // Memoize editor props (Ensure handleContentChange/handleTitleChange are stable via useCallback)
  const editorProps = useMemo(() => {
    return {
      initialContent: editorContent, // Pass the state set by loadArtifact
      onChange: handleContentChange, // Stable useCallback reference
      artifactId: currentArtifactId,
      userId: user?.id
    };
  }, [editorContent, handleContentChange, currentArtifactId, user?.id]); // Dependencies updated

  // Log artifact ID updates when it changes
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') console.log(`[ARTIFACT TRACKING] Current artifact ID changed to: ${currentArtifactId}`);
    if (process.env.NODE_ENV === 'development') console.log(`[ARTIFACT TRACKING] Artifact persistence state: ${isArtifactPersisted}`);
    
    // Check if there's any content in localStorage for this artifact
    try {
      const localData = localStorage.getItem(`artifact-data-${currentArtifactId}`);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (process.env.NODE_ENV === 'development') console.log(`[ARTIFACT TRACKING] Found localStorage data for ${currentArtifactId}:`, {
          title: parsed.title,
          contentLength: parsed.content.length
        });
      } else {
        if (process.env.NODE_ENV === 'development') console.log(`[ARTIFACT TRACKING] No localStorage data found for ${currentArtifactId}`);
      }
    } catch (e) {
      console.error('Error checking localStorage for artifact:', e);
    }
  }, [currentArtifactId, isArtifactPersisted]);

  // --- Drawer Toggle Handler ---
  const toggleDrawer = (open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
    if (
      event.type === 'keydown' &&
      ((event as React.KeyboardEvent).key === 'Tab' ||
        (event as React.KeyboardEvent).key === 'Shift')
    ) {
      return;
    }
    setIsDrawerOpen(open);
  };
  // --- END Drawer Handler ---

  // --- NEW: Helper function to dispatch notifications (can be reused if needed) ---
  const dispatchNotification = useCallback((message: string, type: 'info' | 'error' | 'success', duration?: number) => {
    const detail: { message: string; type: string; duration?: number } = { message, type };
    if (duration) {
      detail.duration = duration;
    }
    window.dispatchEvent(new CustomEvent('chat:showNotification', { detail }));
  }, []);
  // --- END Helper --- //

  // --- START: Toast Notification Effect (Modified for Inline Notification) ---
  useEffect(() => {
    const messages = currentConversation?.messages;
    if (!messages) return;

    const currentMessageCount = messages.length;
    const lastMessage = messages[currentMessageCount - 1];

    // Debugging logs
    if (process.env.NODE_ENV === 'development') {
      console.log('[Inline Notification Effect Check]', {
        showRightPanel,
        currentMessageCount,
        prevCount: prevMessagesCountRef.current,
        lastMessageRole: lastMessage?.role,
      });
    }

    // Check if the RIGHT panel is collapsed, messages exist, count increased, and last message is from AI
    if (
      !showRightPanel &&
      currentMessageCount > prevMessagesCountRef.current &&
      lastMessage?.role === 'assistant'
    ) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Inline Notification Effect] Conditions met (Right Panel Collapsed). Showing notification.');
      }

      const lastMessageContent = lastMessage.content;
      // Truncate long messages for the notification
      const notificationContent = lastMessageContent.length > 100
        ? lastMessageContent.substring(0, 97) + '...'
        : lastMessageContent;

      // Display the inline notification via the custom event
      // toast(toastContent); // REPLACED
      dispatchNotification(notificationContent, 'info');
    }

    // Update the ref with the current count for the next render
    prevMessagesCountRef.current = currentMessageCount;

  }, [currentConversation?.messages, showRightPanel, dispatchNotification]); // Added dispatchNotification dependency
  // --- End Inline Notification Effect ---

  // Function to handle layout changes in the vertical panel group
  const handleVerticalLayout = useCallback((sizes: number[]) => {
    if (sizes.length === 2) {
      const currentBottomSize = sizes[1];
      setBottomPanelSize(currentBottomSize); // Store the current size

      // Determine collapsed state with a small threshold
      const collapsed = currentBottomSize < 5; // Consider collapsed if less than 5%
      if (collapsed !== isBottomPanelCollapsed) {
        // --- Debug Log Start ---
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Layout Callback] Bottom panel collapsed state changing: ${isBottomPanelCollapsed} -> ${collapsed} (Size: ${currentBottomSize})`);
        }
        // --- Debug Log End ---
        setIsBottomPanelCollapsed(collapsed);
      }
    }
  }, [isBottomPanelCollapsed]);

  // Function to toggle the bottom panel
  const toggleBottomPanel = useCallback(() => {
    const panelGroup = verticalPanelGroupRef.current;
    if (!panelGroup) return;

    setIsBottomPanelAnimating(true); // Start animation indication

    if (isBottomPanelCollapsed) {
      // Expand: Use stored size or a default if necessary
      const targetSize = bottomPanelSize > 5 ? bottomPanelSize : 25; // Use stored or default 25%
      panelGroup.setLayout([100 - targetSize, targetSize]);
    } else {
      // Collapse: Set bottom panel to 0
      panelGroup.setLayout([100, 0]);
    }

    // Reset animation flag after transition likely finishes
    setTimeout(() => setIsBottomPanelAnimating(false), 300); // Adjust timing as needed

  }, [isBottomPanelCollapsed, bottomPanelSize]);

  // Listen for artifact selection events from FileExplorer
  useEffect(() => {
    const handleArtifactSelected = (event: CustomEvent) => {
      const { artifactId: selectedId } = event.detail;
      // --- DIAGNOSTIC LOG --- 
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Nav Check - artifactSelected Event] Received event`, {
          selectedId,
          currentArtifactId,
          userExists: !!user,
          shouldProceed: selectedId && user && selectedId !== currentArtifactId
        });
      }
      // --- END LOG --- 

      if (selectedId && user && selectedId !== currentArtifactId) {
        // --- DIAGNOSTIC LOG --- 
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Nav Check - artifactSelected Event] Condition PASSED. Proceeding to load ${selectedId}`);
        }
        // --- END LOG --- 

        // Flush any pending local save for the OLD artifact FIRST
        try {
          if (process.env.NODE_ENV === 'development') console.log(`[Nav Check - artifactSelected Event] Flushing potential pending save for ${currentArtifactId}...`);
          debouncedLocalSave.flush(); // <-- Changed from cancel()
          if (process.env.NODE_ENV === 'development') console.log(`[Nav Check - artifactSelected Event] Flush complete.`);
        } catch (flushError) {
          console.error("[Nav Check - artifactSelected Event] Error during debouncedLocalSave.flush():", flushError);
        }

        // Now check if sync is pending (could have become true after flush)
        if (isSyncPending && isMounted.current) { // Check isSyncPending *after* flush
           console.warn("[Nav Check - artifactSelected Event] Switching artifact with pending server changes. Attempting final sync...");
           try {
              latestSyncFn.current(); // Use the ID stored in pendingSyncArtifactId
              if (process.env.NODE_ENV === 'development') console.log(`[Nav Check - artifactSelected Event] latestSyncFn attempt complete.`);
           } catch (syncError) {
             console.error("[Nav Check - artifactSelected Event] Error during latestSyncFn():", syncError);
           }
        }

        if (process.env.NODE_ENV === 'development') console.log(`[Nav Check - artifactSelected Event] Calling loadArtifact(${selectedId})...`);
        loadArtifact(selectedId, user);
      }
    };
    window.addEventListener('artifactSelected', handleArtifactSelected as EventListener);
    return () => {
      window.removeEventListener('artifactSelected', handleArtifactSelected as EventListener);
    };
  }, [user, loadArtifact, currentArtifactId, isSyncPending, debouncedLocalSave]); // REMOVED AI context dependencies

  // Show a loading state only if Supabase user data is still loading
  if (isSupabaseLoading) {
    return (
      <div className="loading">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
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
        <div className="header-content flex items-center justify-between px-4">
          <div className="flex items-center">
              <IconButton
                 color="inherit"
                 aria-label="open drawer"
                 onClick={toggleDrawer(true)}
                 edge="start"
                 sx={{ mr: 2, ml: 3 }}
              >
                 <MenuIcon />
              </IconButton>
              <span className={`${newsreader.className} text-xl text-primary ml-2`}
              style={{ color: 'var(--title-color)', fontWeight: 'bold', fontSize: '24px' }}>tuon.io</span>
          </div>
          
          <div className="header-actions flex items-center">
            <button onClick={() => signOut()} className="sign-out-button mr-2">
              <span className="font-jetbrains-mono">Logout</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <Drawer
        anchor="left"
        open={isDrawerOpen}
        onClose={toggleDrawer(false)}
        PaperProps={{
          sx: {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: '"JetBrains Mono", monospace',
            borderRight: '1px solid var(--border-color)',
            padding: '12px 0',
            '& .MuiBackdrop-root': {
              backgroundColor: 'var(--background-50)'
            }
          }
        }}
        BackdropProps={{
          sx: {
            backgroundColor: 'var(--overlay-bg)',
          }
        }}
        className="file-explorer-drawer"
      >
        <Box
          sx={{ 
            width: 360, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: '"JetBrains Mono", monospace',
            paddingRight: '8px',
            paddingLeft: '12px',
            overflow: 'hidden'
          }}
          role="presentation"
        >
          <div className="px-2 py-2">
              <GlobalSearch />
          </div>
          <div className="flex-grow overflow-auto h-full">
              <FileExplorer />
          </div>
        </Box>
      </Drawer>

      <div className={`content-area ${!showRightPanel ? 'main-content-padded-bottom' : ''}`}>
        <PanelGroup 
          ref={panelGroupRef}
          autoSaveId="tuon-layout-main"
          direction="horizontal"
          onLayout={handlePanelResize}
          className="flex-grow min-w-0"
        >
          <Panel 
            id="content-panel" 
            order={1}
            minSize={30}
            className="animated-panel flex flex-col overflow-hidden"
          >
            <div className="main-content flex-grow flex flex-col overflow-hidden">
              <TitleBar 
                initialTitle={title} 
                onTitleChange={handleTitleChange} 
                saveStatus={getSaveStatus()}
                statusMessage={getSaveStatusMessage()}
                isPersisted={isArtifactPersisted}
                lastSynced={lastSuccessfulSyncTime ? lastSuccessfulSyncTime.toISOString() : null}
                onForceSync={forceSync}
              />
              <div className="flex-grow overflow-auto relative">
                  <Suspense fallback={<EditorLoading />}>
                    <Editor 
                      key={`editor-instance-${currentArtifactId}`}
                      {...editorProps}
                      onEditorReady={setEditorReference}
                      isEditorProcessing={isEditorProcessing}
                    />
                  </Suspense>
                  <EditorFAB 
                    artifactId={currentArtifactId}
                    userId={user?.id}
                  />
              </div>
            </div>
          </Panel>
          
          <PanelResizeHandle 
            id="right-resize-handle" 
            className="resize-handle relative"
          >
            <div className="resize-line"></div>
            <IconButton
              onClick={toggleRightPanel}
              size="small"
              className="toggle-button toggle-button-right"
              sx={{
                position: 'absolute',
                top: '50%',
                left: '-18px',
                transform: 'translateY(-50%)',
                backgroundColor: 'var(--muted)',
                color: 'var(--muted-foreground)',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                boxShadow: 'var(--shadow-sm)',
                '&:hover': {
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                },
                zIndex: 10
              }}
              title={showRightPanel ? "Collapse Right Pane" : "Expand Right Pane"}
            >
              {showRightPanel ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </IconButton>
          </PanelResizeHandle>
          <Panel 
            id="right-panel" 
            className={isRightPanelAnimating ? 'panel-animating' : ''}
            defaultSize={rightPanelSize}
            minSize={0}
            maxSize={40}
            order={2}
            collapsible={true}
            onCollapse={() => {
              if (showRightPanel) {
                if (process.env.NODE_ENV === 'development') console.log('Right panel collapsed via drag/API');
                setShowRightPanel(false);
              }
            }}
            onExpand={() => {
              if (!showRightPanel) {
                if (process.env.NODE_ENV === 'development') console.log('Right panel expanded via drag/API');
                setShowRightPanel(true);
              }
            }}
          >
            <RightPane />
          </Panel>
        </PanelGroup>

        {/* Conditionally render the Pinned Chat Input */}
        {!showRightPanel && (
          <div className="pinned-chat-input-container">
            {/* Render ChatInput directly here when panel is collapsed */}
            <ChatInput isPanelCollapsed={!showRightPanel} />
          </div>
        )}

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