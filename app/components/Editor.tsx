'use client';

import React, { memo } from 'react';
import { type Block, type Selection, type BlockNoteEditor as BlockNoteEditorType } from "@blocknote/core";
import dynamic from 'next/dynamic';
import { isEqual } from 'lodash-es'; // Import isEqual
import LoopOutlinedIcon from '@mui/icons-material/LoopOutlined'; // NEW: Import LoopOutlinedIcon
import { BlockNoteView } from '@blocknote/mantine'; // Standard import
import AskAIButton from './AskAIButton'; // Standard import

// Dynamically import BlockNote components with SSR disabled
const BlockNoteEditor = dynamic(
  () => import('@blocknote/react').then((mod) => {
    // --- Re-enable Toolbar Imports --- 
    const {
      useCreateBlockNote,
      FormattingToolbarController, // RE-ENABLED
      FormattingToolbar,         // RE-ENABLED
      BlockTypeSelect,           // RE-ENABLED (standard button)
      BasicTextStyleButton,    // RE-ENABLED (standard button)
      TextAlignButton,         // RE-ENABLED (standard button)
      ColorStyleButton,        // RE-ENABLED (standard button)
      NestBlockButton,         // RE-ENABLED (standard button)
      UnnestBlockButton,       // RE-ENABLED (standard button)
      CreateLinkButton         // RE-ENABLED (standard button)
    } = mod;
    // --- END Re-enable ---
    
    // --- Return the actual component definition --- 
    return (props: any) => {
      // --- Hooks and logic go inside the component --- 
      const editor = useCreateBlockNote({
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
      
      // --- Ref to track programmatic changes ---
      const isProgrammaticChangeRef = React.useRef(false);
      
      // --- Call onEditorReady when editor is created --- 
      React.useEffect(() => {
        if (editor && props.onEditorReady) {
          props.onEditorReady(editor);
        }
      }, [editor, props.onEditorReady]);
      // --- END: Call onEditorReady --- 
      
      // --- Explicitly update editor content on initialContent change ---
      React.useEffect(() => {
        if (editor && props.initialContent) {
          const lengthDiffers = props.initialContent.length !== editor.document.length;
          if (lengthDiffers || (props.forceContentUpdate === true) || 
              (!lengthDiffers && !isEqual(props.initialContent[0], editor.document[0]))) {
            if (lengthDiffers || props.forceContentUpdate === true || 
                !isEqual(props.initialContent, editor.document)) {
              isProgrammaticChangeRef.current = true;
              editor.replaceBlocks(editor.document, props.initialContent);
            }
          }
        }
      }, [editor, props.initialContent, props.artifactId, props.forceContentUpdate]); 
      // --- END: Explicit update effect ---
      
      // --- Handle editor:setContent ---
      React.useEffect(() => {
        const handleSetContent = async (event: CustomEvent) => {
          if (event.detail && typeof event.detail.content === 'string') {
            const markdownString = event.detail.content;
            const sourceArtifactId = event.detail.artifactId;
            if (process.env.NODE_ENV === 'development') {
              console.log(`Editor: Received setContent event with artifactId: ${sourceArtifactId}`);
            }
            if (!markdownString) {
              editor.replaceBlocks(editor.document, []);
              if (props.onChange) props.onChange([], sourceArtifactId);
              return;
            }
            try {
              if (props.setAiStatus) props.setAiStatus({ isProcessing: true, message: 'Parsing content...' });
              const newBlocks = await editor.tryParseMarkdownToBlocks(markdownString);
              isProgrammaticChangeRef.current = true; // Set flag before replaceBlocks
              editor.replaceBlocks(editor.document, newBlocks);
              if (props.onChange) {
                props.onChange(newBlocks, sourceArtifactId);
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
      }, [editor, props.onChange, props.setAiStatus]); 
      // --- END Handle editor:setContent ---
      
      // --- Handle editor:applyModification ---
      const handleApplyModification = React.useCallback(async (event: CustomEvent) => {
        if (!editor) return;
        const detail = event.detail;
        if (detail.type === 'modification' && detail.action === 'replace' && detail.targetBlockIds && detail.newMarkdown) {
          const { targetBlockIds, newMarkdown } = detail;
          console.log(`Editor: Applying modification to blocks: ${targetBlockIds.join(', ')}`);
          if (props.setAiStatus) props.setAiStatus({ isProcessing: true, message: 'Applying changes...' });
          try {
            const newBlocks = await editor.tryParseMarkdownToBlocks(newMarkdown);

            // --- NEW: Recursive Block Search Function ---
            const findBlocksByIdRecursive = (
              blockIds: string[],
              blocksToSearch: Block[]
            ): Block[] => {
              let foundBlocks: Block[] = [];
              const remainingIds = new Set(blockIds); // Keep track of IDs still needed

              const search = (currentBlocks: Block[]) => {
                if (remainingIds.size === 0) return; // Stop if all found

                for (const block of currentBlocks) {
                  if (remainingIds.has(block.id)) {
                    foundBlocks.push(block);
                    remainingIds.delete(block.id); // Mark as found
                  }
                  if (block.children && block.children.length > 0 && remainingIds.size > 0) {
                    search(block.children); // Recursively search children
                  }
                  if (remainingIds.size === 0) break; // Stop early if all found
                }
              };

              search(blocksToSearch); // Start search from the provided blocks
              return foundBlocks;
            };
            // --- END NEW ---

            // --- MODIFIED: Use recursive search ---
            const targetBlocks = findBlocksByIdRecursive(targetBlockIds, editor.document);
            // --- END MODIFIED ---

            if (targetBlocks.length !== targetBlockIds.length) {
              // Find which IDs were missing
              const foundIds = new Set(targetBlocks.map(b => b.id));
              const missingIds = targetBlockIds.filter((id: string) => !foundIds.has(id));
              console.error(
                "Editor: Could not find all target blocks for replacement.",
                { targetBlockIds, foundBlockIds: Array.from(foundIds), missingIds }
              );
              throw new Error(`Target block(s) not found in current document: ${missingIds.join(', ')}`);
            }

            isProgrammaticChangeRef.current = true; // Set flag before replaceBlocks
            editor.replaceBlocks(targetBlocks, newBlocks);
            console.log('Editor: Modification applied successfully.');
            if (props.setAiStatus) setTimeout(() => props.setAiStatus({ isProcessing: false }), 1000);
            if (props.onChange) {
               setTimeout(() => {
                  if (editor) {
                       props.onChange(editor.document); // Trigger onChange with the updated document
                   }
               }, 100); // Small delay to ensure state updates propagate
            }
          } catch (error) {
            console.error('Editor: Error applying modification:', error);
            if (props.setAiStatus) props.setAiStatus({ isProcessing: false, message: 'Error applying changes' });
          }
        } else {
          console.warn('Editor: Received modification event with unhandled structure for Phase 1.', detail);
        }
      }, [editor, props.onChange, props.setAiStatus]); // Added props.setAiStatus
      
      React.useEffect(() => {
        window.addEventListener('editor:applyModification', handleApplyModification as unknown as EventListener);
        return () => window.removeEventListener('editor:applyModification', handleApplyModification as unknown as EventListener);
      }, [editor, handleApplyModification]);
      // --- END Handle editor:applyModification ---
      
      // --- Handle editor:requestContent ---
      React.useEffect(() => {
        const handleContentRequest = async () => {
          if (!editor) return;
          let markdownString: string | null = null;
          let errorMsg: string | null = null;
          let selectedBlockIds: string[] = [];
          const currentBlocks = props.currentContent || editor.document;
          try {
            markdownString = await editor.blocksToMarkdownLossy(currentBlocks);
            const currentSelection: any = editor.getSelection(); 
            if (currentSelection && currentSelection.blocks) {
                selectedBlockIds = currentSelection.blocks.map((block: Block) => block.id);
            } else if (currentSelection && !currentSelection.blocks && currentSelection.anchor) { 
                const anchorBlockId = currentSelection.anchor.blockId;
                const anchorBlock = editor.document.find((block: Block) => block.id === anchorBlockId);
                if (anchorBlock) {
                    selectedBlockIds = [anchorBlock.id];
                }
            }
            if (props.onContentAccessRequest) {
              props.onContentAccessRequest(currentBlocks);
            }
          } catch (error) {
            console.error('Editor (Inner): Error processing content request:', error);
            errorMsg = 'Failed to get editor content or selection';
          }
          const responseEvent = new CustomEvent('editor:contentResponse', {
            detail: { markdown: markdownString, selectedBlockIds, error: errorMsg }
          });
          window.dispatchEvent(responseEvent);
        };
        window.addEventListener('editor:requestContent', handleContentRequest as unknown as EventListener);
        return () => window.removeEventListener('editor:requestContent', handleContentRequest as unknown as EventListener);
      }, [editor, props.onContentAccessRequest, props.currentContent]);
      // --- END Handle editor:requestContent ---
      
      // --- onChange handler: Check programmatic change flag ---
      React.useEffect(() => {
        if (!props.onChange) return;
        const handleChange = () => {
          if (isProgrammaticChangeRef.current) {
            setTimeout(() => {
              isProgrammaticChangeRef.current = false;
            }, 0);
            return;
          }
          props.onChange(editor.document);
        };
        editor.onChange(handleChange);
        return () => {
          // Cleanup might go here if needed
        };
      }, [editor, props.onChange]);
      // --- END onChange handler ---
      
      // --- The actual JSX return - Modified to include Toolbar --- 
      return (
        // --- Wrap view with Toolbar Controller --- 
        <BlockNoteView 
          editor={editor} 
          theme={props.theme || "light"} 
          className="bn-editor"
          // Provide the toolbar via the controller
          formattingToolbar={false} // Disable default floating toolbar
        >
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                {/* Custom Ask AI Button - Moved to first position */}
                <AskAIButton key={"askAIButton"} editor={editor} /> 
                
                {/* Standard Buttons */}
                <BlockTypeSelect key={"blockTypeSelect"} />
                <BasicTextStyleButton basicTextStyle={"bold"} key={"boldStyleButton"} />
                <BasicTextStyleButton basicTextStyle={"italic"} key={"italicStyleButton"} />
                <BasicTextStyleButton basicTextStyle={"underline"} key={"underlineStyleButton"} />
                <BasicTextStyleButton basicTextStyle={"code"} key={"codeStyleButton"} />
                <TextAlignButton textAlignment={"left"} key={"textAlignLeftButton"} />
                <TextAlignButton textAlignment={"center"} key={"textAlignCenterButton"} />
                <TextAlignButton textAlignment={"right"} key={"textAlignRightButton"} />
                <ColorStyleButton key={"colorStyleButton"} />
                <NestBlockButton key={"nestBlockButton"} />
                <UnnestBlockButton key={"unnestBlockButton"} />
                <CreateLinkButton key={"createLinkButton"} />

              </FormattingToolbar>
            )}
          />
        </BlockNoteView>
        // --- END Toolbar Integration --- 
      );
      // --- END JSX Return --- 
    };
    // --- END Component Definition --- 
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
  forceContentUpdate?: boolean; 
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
  isEditorProcessing,
  forceContentUpdate
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
    // Only log in development mode and only when actually changing to a processing state
    if (process.env.NODE_ENV === 'development' && internalAiStatus.isProcessing) {
      console.log('[EditorComponent] Processing state:', internalAiStatus);
    }
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
        forceContentUpdate={forceContentUpdate}
      />
    </div>
  );
};

// Export the memoized component as the default
export default memo(EditorComponent); 