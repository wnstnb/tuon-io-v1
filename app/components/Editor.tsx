'use client';

import React, { memo } from 'react';
import { type Block, type Selection, type BlockNoteEditor as BlockNoteEditorType } from "@blocknote/core";
import dynamic from 'next/dynamic';
import { isEqual } from 'lodash-es'; // Import isEqual
import LoopOutlinedIcon from '@mui/icons-material/LoopOutlined'; // NEW: Import LoopOutlinedIcon

// Dynamically import BlockNote components with SSR disabled
const BlockNoteEditor = dynamic(
  () => import('@blocknote/react').then((mod) => {
    return {
      default: (props: any) => {
        const { useCreateBlockNote, useBlockNoteEditor } = mod;
        const { BlockNoteView } = require('@blocknote/mantine');
        
        // Ref to track previous artifact ID
        const prevArtifactIdRef = React.useRef(props.artifactId);
        // --- NEW: Ref to track programmatic changes ---
        const isProgrammaticChangeRef = React.useRef(false);
        // --- END NEW ---

        // Create editor with image upload support
        const editor = useCreateBlockNote({
          // Set initial content once, effect handles updates on artifact change
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
        
        // --- NEW: Call onEditorReady when editor is created --- //
        React.useEffect(() => {
          if (editor && props.onEditorReady) {
            props.onEditorReady(editor);
          }
        }, [editor, props.onEditorReady]);
        // --- END: Call onEditorReady --- //

        // --- NEW: Explicitly update editor content on initialContent change ---
        React.useEffect(() => {
          if (editor && props.initialContent) {
            // --- DEBUG LOG: Check content before isEqual ---
            console.log(`[DEBUG Editor Effect] Artifact: ${props.artifactId}. Comparing props.initialContent (Blocks: ${props.initialContent?.length}) vs editor.document (Blocks: ${editor.document?.length}).`);
            // console.log('[DEBUG Editor Effect] props.initialContent:', JSON.stringify(props.initialContent?.slice(0,1)));
            // console.log('[DEBUG Editor Effect] editor.document:', JSON.stringify(editor.document?.slice(0,1)));
            // --- END DEBUG LOG ---

            // Check if the incoming content is different from the current editor document
            // Use isEqual for deep comparison of block arrays
            if (!isEqual(props.initialContent, editor.document)) {
              console.log(`Editor: Detected change in initialContent for artifact ${props.artifactId}. Replacing blocks.`);
              // --- NEW: Set flag before programmatic change ---
              isProgrammaticChangeRef.current = true;
              // --- END NEW ---
              editor.replaceBlocks(editor.document, props.initialContent);
            }
          }
          // Dependency: Run when editor instance exists or initialContent prop changes.
        }, [editor, props.initialContent, props.artifactId]); 
        // --- END: Explicit update effect ---

        // Handle editor:setContent
        React.useEffect(() => {
          const handleSetContent = async (event: CustomEvent) => {
            if (event.detail && typeof event.detail.content === 'string') {
              const markdownString = event.detail.content;
              // Extract the artifactId from the event if provided
              const sourceArtifactId = event.detail.artifactId;
              console.log(`Editor: Received setContent event with artifactId: ${sourceArtifactId}`);
              
              if (!markdownString) {
                editor.replaceBlocks(editor.document, []);
                if (props.onChange) props.onChange([], sourceArtifactId); // Pass artifactId to onChange
                return;
              }
              try {
                // Use props.setAiStatus if available
                if (props.setAiStatus) props.setAiStatus({ isProcessing: true, message: 'Parsing content...' });
                const newBlocks = await editor.tryParseMarkdownToBlocks(markdownString);
                editor.replaceBlocks(editor.document, newBlocks);
                // Use props.onChange if available
                if (props.onChange) {
                  props.onChange(newBlocks, sourceArtifactId); // Pass artifactId to onChange
                }
                if (props.setAiStatus) setTimeout(() => props.setAiStatus({ isProcessing: false }), 1500);
              } catch (error) {
                console.error('Editor (Inner): Error parsing markdown:', error);
                if (props.setAiStatus) props.setAiStatus({ isProcessing: false, message: 'Error parsing content' });
              }
            }
          };
          window.addEventListener('editor:setContent', handleSetContent as unknown as EventListener);
          return () => window.removeEventListener('editor:setContent', handleSetContent as unknown as EventListener);
        // Add necessary props to dependency array
        }, [editor, props.onChange, props.setAiStatus]); 

        // *** NEW: Handle editor:applyModification ***
        const handleApplyModification = React.useCallback(async (event: CustomEvent) => {
          if (!editor) return;

          const detail = event.detail;

          // Phase 1: Handle single/contiguous modification
          if (detail.type === 'modification' && detail.action === 'replace' && detail.targetBlockIds && detail.newMarkdown) {
            const { targetBlockIds, newMarkdown } = detail;
            console.log(`Editor: Applying modification to blocks: ${targetBlockIds.join(', ')}`);
            if (props.setAiStatus) props.setAiStatus({ isProcessing: true, message: 'Applying changes...' });

            try {
              const newBlocks = await editor.tryParseMarkdownToBlocks(newMarkdown);

              // Find target blocks in the current document
              const targetBlocks: Block[] = targetBlockIds
                .map((id: string) => editor.document.find((block: Block) => block.id === id))
                .filter((block: Block | undefined): block is Block => block !== undefined);

              if (targetBlocks.length !== targetBlockIds.length) {
                console.error("Editor: Could not find all target blocks for replacement.", { targetBlockIds, foundBlocks: targetBlocks.map(b => b.id) });
                throw new Error("Target block(s) not found in current document.");
              }
              
              // TODO: Optionally add contiguity check here for Phase 1 if strictness needed

              editor.replaceBlocks(targetBlocks, newBlocks);

              console.log('Editor: Modification applied successfully.');
              if (props.setAiStatus) setTimeout(() => props.setAiStatus({ isProcessing: false }), 1000);

              // Trigger onChange after modification if needed (consider debouncing/throttling)
              if (props.onChange) {
                 // Give editor state a moment to settle before reporting change
                 setTimeout(() => {
                    if (editor) { // Check editor still exists
                         props.onChange(editor.document);
                     }
                 }, 100);
              }

            } catch (error) {
              console.error('Editor: Error applying modification:', error);
              if (props.setAiStatus) props.setAiStatus({ isProcessing: false, message: 'Error applying changes' });
            }
          } else {
            // Handle Phase 2 multi_modification or other types in the future
            console.warn('Editor: Received modification event with unhandled structure for Phase 1.', detail);
          }
        }, [editor, props.onChange, props.setAiStatus]); // Dependencies for the handler

        // Add the new listener for modifications
        React.useEffect(() => {
          window.addEventListener('editor:applyModification', handleApplyModification as unknown as EventListener);
          return () => window.removeEventListener('editor:applyModification', handleApplyModification as unknown as EventListener);
        }, [editor, handleApplyModification]); // Add handler to dependencies

        // Handle editor:requestContent - MODIFIED to include selection IDs
        React.useEffect(() => {
          const handleContentRequest = async () => {
            if (!editor) return; // Ensure editor exists

            let markdownString: string | null = null;
            let errorMsg: string | null = null;
            let selectedBlockIds: string[] = [];

            const currentBlocks = props.currentContent || editor.document;

            try {
              // Get markdown
              markdownString = await editor.blocksToMarkdownLossy(currentBlocks);

              // Get selected block IDs
              // Cast to 'any' to bypass Selection generic type error temporarily
              const currentSelection: any = editor.getSelection(); 
              if (currentSelection && currentSelection.blocks) {
                  // If blocks are selected (highlighted)
                  selectedBlockIds = currentSelection.blocks.map((block: Block) => block.id);
              // Check if selection is collapsed (cursor) and anchor exists
              } else if (currentSelection && !currentSelection.blocks && currentSelection.anchor) { 
                  const anchorBlockId = currentSelection.anchor.blockId;
                  // If it's just a cursor (collapsed selection), find the block containing the cursor
                  const anchorBlock = editor.document.find((block: Block) => block.id === anchorBlockId);
                  if (anchorBlock) {
                      selectedBlockIds = [anchorBlock.id];
                  }
              }
              
              // Use props.onContentAccessRequest if available (existing logic)
              if (props.onContentAccessRequest) {
                props.onContentAccessRequest(currentBlocks);
              }
            } catch (error) {
              console.error('Editor (Inner): Error processing content request:', error);
              errorMsg = 'Failed to get editor content or selection';
            }

            // Include selectedBlockIds in the response detail
            const responseEvent = new CustomEvent('editor:contentResponse', {
              detail: { markdown: markdownString, selectedBlockIds, error: errorMsg }
            });
            window.dispatchEvent(responseEvent);
          };
          window.addEventListener('editor:requestContent', handleContentRequest as unknown as EventListener);
          return () => window.removeEventListener('editor:requestContent', handleContentRequest as unknown as EventListener);
        }, [editor, props.onContentAccessRequest, props.currentContent]); // Dependencies for the handler

        // *** MODIFIED onChange handler: Check programmatic change flag ***
        React.useEffect(() => {
          if (!props.onChange) return;

          const handleChange = () => {
            // --- NEW: Check programmatic change flag ---
            if (isProgrammaticChangeRef.current) {
              console.log("Editor onChange: Ignored programmatic change.");
              // Reset the flag AFTER the current event stack clears
              setTimeout(() => {
                isProgrammaticChangeRef.current = false;
              }, 0);
              return; // Do not call props.onChange
            }
            // --- END NEW ---
            
            // If it's a user change, proceed as before
            console.log("Editor onChange: Processing user change.");
            props.onChange(editor.document); 
          };

          editor.onChange(handleChange);

          // Cleanup (Note: BlockNote might not have a public API to remove onChange listeners)
          // The key prop should handle component recreation on artifactId change.
          return () => {
            // Attempt cleanup if API becomes available or needed
          };
        }, [editor, props.onChange]); // Dependencies remain the same

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
  onChange?: (content: Block[], sourceArtifactId?: string) => void;
  artifactId?: string;
  userId?: string;
  onContentAccessRequest?: (content: Block[]) => void;
  setAiStatus?: (status: { isProcessing: boolean; message?: string }) => void; 
  currentContent?: Block[]; 
  onEditorReady?: (editor: BlockNoteEditorType) => void;
  isEditorProcessing?: boolean; 
}

// Rename the original function component
const EditorComponent = ({ 
  initialContent, 
  onChange, 
  artifactId, 
  userId, 
  onContentAccessRequest,
  setAiStatus, 
  currentContent,
  onEditorReady,
  isEditorProcessing
}: EditorProps) => {
  // State to track content updates from AI (might be needed for keying/remounting)
  const [aiContent, setAiContent] = React.useState<Block[] | null>(null);
  // State to track current editor content (needed for onContentAccessRequest)
  // Let's rename internal state to avoid confusion with prop name
  const [internalCurrentContent, setInternalCurrentContent] = React.useState<Block[]>(initialContent || []);
  // State to show status indicator for AI operations
  const [internalAiStatus, setInternalAiStatus] = React.useState<{
    isProcessing: boolean;
    operation?: string;
    message?: string;
  }>({ isProcessing: false });

  // --- NEW: Add logging for internalAiStatus changes ---
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') console.log('[EditorComponent] internalAiStatus changed:', internalAiStatus);
  }, [internalAiStatus]);
  // --- END NEW LOGGING ---

  // Update internalCurrentContent when initialContent changes (e.g., loading from DB)
  React.useEffect(() => {
    setInternalCurrentContent(initialContent || []);
  }, [initialContent]);

  // Debugging log
  /* React.useEffect(() => {
    console.log(`Editor (Outer) received new initialContent for artifact: ${artifactId}`);
  }, [initialContent, artifactId]); */
  
  // Simplified initial content logic for passing down
  const safeInitialContent = React.useMemo(() => {
    // AI content still takes precedence if it exists (e.g., from setContent event)
    if (aiContent) {
      return aiContent;
    }
    return initialContent;
  }, [initialContent, aiContent]);

  // Reset AI content when artifact changes (still seems relevant)
  React.useEffect(() => {
    setAiContent(null);
  }, [artifactId]);

  return (
    <div className="editor-container relative h-full">
      {/* Use internalAiStatus.isProcessing to control the overlay */}
      {internalAiStatus.isProcessing && (
        <div className="editor-processing-overlay">
          {/* Render the spinning LoopOutlinedIcon */}
          <LoopOutlinedIcon className="spinner" sx={{ fontSize: 40 }} />
        </div>
      )}
      <ThemeAwareEditor 
        initialContent={safeInitialContent}
        onChange={(blocks) => {
          // When editor changes, update currentContent and call parent onChange
          setAiContent(null); // User edited, clear AI content override
          setInternalCurrentContent(blocks); // Update internal state
          if (onChange) {
            onChange(blocks); // Call parent handler with no artifactId (user edit)
          }
        }}
        setAiStatus={setInternalAiStatus} 
        currentContent={internalCurrentContent} 
        onContentAccessRequest={onContentAccessRequest}
        EditorComponent={BlockNoteEditor}
        artifactId={artifactId}
        userId={userId}
        onEditorReady={onEditorReady}
      />
    </div>
  );
};

// Export the memoized component as the default
export default memo(EditorComponent); 