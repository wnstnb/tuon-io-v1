'use client';

import React, { useEffect, useState } from 'react';
import { useAI, type Conversation, type Message } from '../context/AIContext';
import { useSupabase } from '../context/SupabaseContext';
import { MessageSquare, Plus, Loader2, Trash2, Edit2, Check, X, Sparkles } from 'lucide-react';
import { Tooltip, IconButton, CircularProgress } from '@mui/material';
import { AIService } from '../lib/services/AIService';
import { extractTextFromMessages } from '../lib/utils/textExtraction';

export default function ChatHistory() {
  const { 
    conversationHistory, 
    selectConversation, 
    createNewConversation, 
    currentConversation, 
    isLoadingConversations,
    updateConversationMetadata
  } = useAI();
  const { user } = useSupabase();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [suggestingTitleId, setSuggestingTitleId] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    setEditText(conversationHistory.find(c => c.id === id)?.title || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!user) return;
    const trimmedText = editText.trim();
    if (trimmedText) {
      await updateConversationMetadata(id, { title: trimmedText });
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (event.key === 'Enter') {
      handleSaveEdit(id);
    } else if (event.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleSuggestConversationTitle = async (conversation: Conversation) => {
    if (!conversation || !conversation.id || !conversation.messages || suggestingTitleId === conversation.id) {
      return;
    }

    if (process.env.NODE_ENV === 'development') console.log(`[handleSuggestConversationTitle] Triggered for conversation ${conversation.id}`);
    setSuggestingTitleId(conversation.id);

    const textContent = extractTextFromMessages(conversation.messages);

    try {
      const inferredTitle = await AIService.inferTitle('conversation', conversation.id, textContent);

      if (inferredTitle) {
        if (process.env.NODE_ENV === 'development') console.log(`[handleSuggestConversationTitle] Success for ${conversation.id}. Applying title: "${inferredTitle}"`);
        await updateConversationMetadata(conversation.id, { title: inferredTitle });
        if (editingId === conversation.id) {
          setEditingId(null);
        }
      } else {
        if (process.env.NODE_ENV === 'development') console.warn(`[handleSuggestConversationTitle] Inference returned null for ${conversation.id}.`);
      }
    } catch (error) {
      console.error(`[handleSuggestConversationTitle] Error calling AIService.inferTitle for ${conversation.id}:`, error);
    } finally {
      setSuggestingTitleId(null);
    }
  };

  return (
    <div className="chat-history">
      <button 
        className="new-chat-button"
        onClick={() => createNewConversation()}
      >
        <Plus size={16} />
        <span>New Chat</span>
      </button>
      
      <div className="history-list">
        {isLoadingConversations ? (
          <div className="empty-history">
            <Loader2 size={24} className="spinner" />
            <p>Loading conversations...</p>
          </div>
        ) : conversationHistory.length === 0 ? (
          <div className="empty-history">
            <p>No conversations yet</p>
          </div>
        ) : (
          conversationHistory.map((conversation) => (
            <button
              key={conversation.id}
              className={`history-item ${currentConversation?.id === conversation.id ? 'active' : ''}`}
              onClick={() => handleSelectConversation(conversation.id)}
            >
              <MessageSquare size={16} className="text-muted-foreground" />
              <div className="conversation-info">
                {editingId === conversation.id ? (
                   <div className="flex items-center w-full">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, conversation.id)}
                        autoFocus
                        className="flex-grow p-1 border rounded-md mr-1 bg-input text-foreground"
                      />
                      <IconButton size="small" onClick={(e) => {e.stopPropagation(); handleSaveEdit(conversation.id);}} sx={{ p: '2px' }}>
                        <Check size={14} className="text-green-600" />
                      </IconButton>
                      <IconButton size="small" onClick={(e) => {e.stopPropagation(); handleCancelEdit();}} sx={{ p: '2px' }}>
                        <X size={14} className="text-red-600" />
                      </IconButton>
                   </div>
                ) : (
                  <>
                     <span 
                       className="conversation-title truncate flex-grow mr-1"
                     >
                       {conversation.title}
                     </span>
                     <div className="flex items-center conversation-actions ml-auto flex-shrink-0">
                       {conversation.title === 'New Conversation' && (
                         <Tooltip title="Suggest Title using AI">
                           <span> 
                             <IconButton 
                               size="small"
                               onClick={(e) => { 
                                 e.stopPropagation();
                                 handleSuggestConversationTitle(conversation); 
                               }}
                               disabled={suggestingTitleId === conversation.id}
                               sx={{ padding: '2px', color: 'var(--muted-foreground)' }} 
                             >
                               {suggestingTitleId === conversation.id ? 
                                 <CircularProgress size={14} color="inherit" /> : 
                                 <Sparkles size={14} /> 
                               }
                             </IconButton>
                           </span>
                         </Tooltip>
                       )}
                       <Tooltip title="Rename Conversation">
                         <IconButton 
                           size="small"
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             setEditingId(conversation.id); 
                             setEditText(conversation.title);
                           }}
                           sx={{ padding: '2px', color: 'var(--muted-foreground)' }}
                         >
                           <Edit2 size={14} />
                         </IconButton>
                       </Tooltip>
                       <Tooltip title="Delete Conversation">
                         <IconButton 
                           size="small"
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             alert('Delete functionality TBC');
                           }}
                           sx={{ padding: '2px', color: 'var(--muted-foreground)' }}
                         >
                           <Trash2 size={14} />
                         </IconButton>
                       </Tooltip>
                     </div>
                  </>
                )}
              </div>
              <span className="conversation-date text-muted-foreground">{formatDate(conversation.updatedAt)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
} 