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
        
        // Create editor with image upload support
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
          // Add file upload handler for images
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
        
        // Handle editor:setContent
        React.useEffect(() => {
          const handleSetContent = async (event: CustomEvent) => {
            if (event.detail && typeof event.detail.content === 'string') {
              const markdownString = event.detail.content;
              if (!markdownString) {
                editor.replaceBlocks(editor.document, []);
                if (props.onChange) props.onChange([]); // Notify parent of clear
                return;
              }
              try {
                // Use props.setAiStatus if available
                if (props.setAiStatus) props.setAiStatus({ isProcessing: true, message: 'Parsing content...' });
                const newBlocks = await editor.tryParseMarkdownToBlocks(markdownString);
                editor.replaceBlocks(editor.document, newBlocks);
                // Use props.onChange if available
                if (props.onChange) {
                  props.onChange(newBlocks); // Notify parent of update
                }
                if (props.setAiStatus) setTimeout(() => props.setAiStatus({ isProcessing: false }), 1000);
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

        // Handle editor:requestContent
        React.useEffect(() => {
          const handleContentRequest = async () => {
            let markdownString: string | null = null;
            let errorMsg: string | null = null;
            // Use props.currentContent if available
            const currentBlocks = props.currentContent || editor.document;
            try {
              markdownString = await editor.blocksToMarkdownLossy(currentBlocks);
              // Use props.onContentAccessRequest if available
              if (props.onContentAccessRequest) {
                props.onContentAccessRequest(currentBlocks);
              }
            } catch (error) {
              console.error('Editor (Inner): Error converting blocks to markdown:', error);
              errorMsg = 'Failed to get markdown content';
            }
            const responseEvent = new CustomEvent('editor:contentResponse', {
              detail: { markdown: markdownString, error: errorMsg }
            });
            window.dispatchEvent(responseEvent);
          };
          window.addEventListener('editor:requestContent', handleContentRequest as unknown as EventListener);
          return () => window.removeEventListener('editor:requestContent', handleContentRequest as unknown as EventListener);
        // Add necessary props to dependency array
        }, [editor, props.onContentAccessRequest, props.currentContent]); 

        // Regular onChange handler (already uses props correctly)
        React.useEffect(() => {
          if (!props.onChange) return;
          let debounceTimeout: NodeJS.Timeout | null = null;
          const debounceDelay = 3000;
          const debouncedOnChange = () => {
            const blocks = editor.document;
            props.onChange(blocks);
          };
          const handleChange = () => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(debouncedOnChange, debounceDelay);
          };
          editor.onChange(handleChange);
          return () => { if (debounceTimeout) clearTimeout(debounceTimeout); };
        }, [editor, props.onChange]);

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
  onChange?: (content: Block[]) => void;
  artifactId?: string;
  userId?: string;
  onContentAccessRequest?: (content: Block[]) => void;
}

export default function Editor({ initialContent, onChange, artifactId, userId, onContentAccessRequest }: EditorProps) {
  // State to track content updates from AI (might be needed for keying/remounting)
  const [aiContent, setAiContent] = React.useState<Block[] | null>(null);
  // State to track current editor content (needed for onContentAccessRequest)
  const [currentContent, setCurrentContent] = React.useState<Block[]>(initialContent || []);
  // State to show status indicator for AI operations 
  const [aiStatus, setAiStatus] = React.useState<{
    isProcessing: boolean;
    operation?: string;
    message?: string;
  }>({ isProcessing: false });
  
  // Update currentContent when initialContent changes (e.g., loading from DB)
  React.useEffect(() => {
    setCurrentContent(initialContent || []);
  }, [initialContent]);

  // Debugging log
  React.useEffect(() => {
    console.log(`Editor (Outer) received new initialContent for artifact: ${artifactId}`);
  }, [initialContent, artifactId]);
  
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
    <div className="editor-container">
      {aiStatus.isProcessing && (
        <div className="ai-status-indicator">
          <span className="ai-status-icon">🔄</span>
          <span className="ai-status-message">{aiStatus.message}</span>
        </div>
      )}
      <ThemeAwareEditor 
        // Key logic remains important 
        key={`editor-${artifactId}-${safeInitialContent ? 'has-content' : 'empty'}`}
        initialContent={safeInitialContent}
        // Pass down necessary state and functions
        onChange={(blocks) => {
          // When editor changes, update currentContent and call parent onChange
          setAiContent(null); // User edited, clear AI content override
          setCurrentContent(blocks);
          if (onChange) {
            onChange(blocks);
          }
        }}
        setAiStatus={setAiStatus} // Pass the setter down
        currentContent={currentContent} // Pass current blocks down
        onContentAccessRequest={onContentAccessRequest} // Pass down
        EditorComponent={BlockNoteEditor}
        artifactId={artifactId}
        userId={userId}
      />
    </div>
  );
} 