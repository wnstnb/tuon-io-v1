'use client';

import React, { useState, useCallback, useRef } from 'react';
import { type Block, type BlockNoteEditor } from '@blocknote/core';
// import { useComponentsContext } from '@blocknote/react'; // REMOVED
import { Sparkles, Send, CornerDownLeft } from 'lucide-react'; 
import { useAI } from '../context/AIContext';

interface AskAIButtonProps {
  editor: BlockNoteEditor;
}

// Basic styles to mimic toolbar buttons (refine with CSS classes)
const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  margin: '0 2px',
  border: 'none',
  borderRadius: '4px',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--bn-color-text-secondary)' // Example color
};

const hoverStyle: React.CSSProperties = {
  background: 'var(--bn-color-background-hover)' // Example color
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  marginRight: '4px',
  fontSize: '13px',
  backgroundColor: 'var(--input-bg)',
  color: 'var(--text-color)',
  width: '200px'
};

export default function AskAIButton({ editor }: AskAIButtonProps) {
  // const Components = useComponentsContext(); // REMOVED
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState('');
  const { isLoading, processEditorSelectionAction } = useAI(); 
  const [isHoveringAI, setIsHoveringAI] = useState(false); // Renamed for clarity
  const [isHoveringFollowUp, setIsHoveringFollowUp] = useState(false); // State for new button
  const [isSendHovering, setIsSendHovering] = useState(false); // For send button hover
  const selectedBlocksRef = useRef<Block[] | null>(null); // Ref to store selection

  const handleAskAIButtonClick = useCallback(() => {
    if (!showInput) {
      // Capture selection *before* showing input and potentially losing focus
      const selection = editor.getSelection();
      selectedBlocksRef.current = selection?.blocks || null;
      setInstruction(''); // Clear previous instruction
    } else {
      // Clear stored selection if closing input
      selectedBlocksRef.current = null;
    }
    setShowInput(prev => !prev);
  }, [editor, showInput]);

  const handleFollowUpClick = useCallback(async () => {
    const selection = editor.getSelection();
    const selectedBlocks = selection?.blocks;

    if (selectedBlocks && selectedBlocks.length > 0) {
      try {
        // Convert selected blocks to Markdown
        const markdownText = await editor.blocksToMarkdownLossy(selectedBlocks);

        // Dispatch custom event with the markdown text
        const followUpEvent = new CustomEvent('editor:followUpText', {
          detail: { text: markdownText }
        });
        window.dispatchEvent(followUpEvent);

        // Optional: Close AI input if open, clear selection ref
        setShowInput(false);
        setInstruction('');
        selectedBlocksRef.current = null;

        // Optional: Dispatch a notification event (using the system you built in ChatInput)
        window.dispatchEvent(new CustomEvent('chat:showNotification', {
          detail: { message: 'Text added for follow-up.', type: 'success', duration: 2000 }
        }));

      } catch (error) {
        console.error("Error converting blocks to markdown or dispatching event:", error);
         // Optional: Notify user of error
         window.dispatchEvent(new CustomEvent('chat:showNotification', {
          detail: { message: 'Failed to add text for follow-up.', type: 'error' }
        }));
      }
    } else {
      // Optional: Notify user that text needs to be selected
      window.dispatchEvent(new CustomEvent('chat:showNotification', {
        detail: { message: 'Please select text to follow up on.', type: 'info' }
      }));
    }
  }, [editor]);

  const handleSendClick = useCallback(async () => {
    // Use stored selection from the ref
    const targetBlocks = selectedBlocksRef.current;

    if (!instruction.trim() || isLoading) return;

    // Check if we have stored blocks
    if (targetBlocks && targetBlocks.length > 0) {
      const selectedBlockIds = targetBlocks.map((block: Block) => block.id);
      try {
        // --- NEW: Get full document context ---
        const fullDocumentBlocks = editor.document;
        const fullContextMarkdown = await editor.blocksToMarkdownLossy(fullDocumentBlocks);
        // --- END NEW ---
        
        // --- MODIFIED: Call processEditorSelectionAction with full context ---
        await processEditorSelectionAction(
          instruction,
          selectedBlockIds,
          fullContextMarkdown // Pass full document markdown as context
        );
        // --- END MODIFIED ---
        
        setInstruction('');
        setShowInput(false);
        selectedBlocksRef.current = null; // Clear ref after successful send
        
      } catch (error) {
        console.error("Error getting full document context or processing action:", error);
        // Handle error (e.g., show toast)
      }
    } else {
      console.log('Ask AI Send: No blocks selected.');
      setShowInput(false); 
    }
  }, [editor, instruction, isLoading, processEditorSelectionAction]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInstruction(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendClick();
    } else if (e.key === 'Escape') {
      setShowInput(false);
      setInstruction('');
      selectedBlocksRef.current = null; // Clear ref on escape
    }
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // --- Use standard HTML buttons --- 
  const aiButton = (
    <button
      type="button"
      key={'askAIButton'}
      title={'Ask AI about selection'} 
      onClick={handleAskAIButtonClick}
      style={{ 
        ...buttonStyle, 
        ...(isHoveringAI ? hoverStyle : {}) 
      }}
      onMouseEnter={() => setIsHoveringAI(true)}
      onMouseLeave={() => setIsHoveringAI(false)}
    >
      <Sparkles size={18} />
    </button>
  );

  // --- NEW: Follow Up Button ---
  const followUpButton = (
    <button
      type="button"
      key={'followUpButton'}
      title={'Add selection for chat follow-up'}
      onClick={handleFollowUpClick}
      style={{
        ...buttonStyle,
        ...(isHoveringFollowUp ? hoverStyle : {})
      }}
      onMouseEnter={() => setIsHoveringFollowUp(true)}
      onMouseLeave={() => setIsHoveringFollowUp(false)}
    >
      <CornerDownLeft size={18} />
    </button>
  );
  // --- END NEW ---

  const inputArea = showInput ? (
    <div 
      style={{ display: 'flex', alignItems: 'center', marginLeft: '4px' }} 
      onClick={stopPropagation} 
      onMouseDown={stopPropagation} 
    >
      <input
        type="text"
        placeholder="Instruction for AI..." 
        value={instruction}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        disabled={isLoading}
        style={inputStyle}
        autoFocus 
      />
      <button
        type="button"
        key={'sendAIInstruction'}
        title={'Send instruction'}
        onClick={handleSendClick}
        disabled={!instruction.trim() || isLoading}
        style={{
          ...buttonStyle,
          ...(isSendHovering ? hoverStyle : {})
        }}
        onMouseEnter={() => setIsSendHovering(true)}
        onMouseLeave={() => setIsSendHovering(false)}
      >
        <Send size={18} />
      </button>
    </div>
  ) : null;

  return (
    <>
      {aiButton}
      {followUpButton}
      {inputArea}
    </>
  );
} 