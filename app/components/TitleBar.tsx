'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tooltip, IconButton, TextField, InputAdornment, CircularProgress } from '@mui/material';
import { Save, Check, CloudSync, ErrorOutline, Pending, Edit, HelpOutline, AutoAwesome } from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

interface TitleBarProps {
  initialTitle?: string;
  onTitleChange?: (title: string) => void;
  saveStatus: 'idle' | 'syncing' | 'synced' | 'pending' | 'error';
  statusMessage?: string;
  isPersisted: boolean;
  lastSynced?: string | null;
  onForceSync?: () => void;
  onSuggestTitle?: () => Promise<void>;
  isSuggestingTitle?: boolean;
}

export default function TitleBar({ 
  initialTitle = 'Untitled Artifact', 
  onTitleChange, 
  saveStatus, 
  statusMessage, 
  isPersisted, 
  lastSynced, 
  onForceSync, 
  onSuggestTitle,
  isSuggestingTitle
}: TitleBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentTitle(initialTitle);
    setIsEditing(false); 
  }, [initialTitle]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleTitleChangeLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTitle(e.target.value);
  };

  const handleSave = () => {
    if (onTitleChange) {
      onTitleChange(currentTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setCurrentTitle(initialTitle);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const getStatusIcon = () => {
    switch (saveStatus) {
      case 'syncing':
        return <CloudSync fontSize="small" className="animate-pulse text-blue-500" />;
      case 'pending':
        return <Pending fontSize="small" className="text-yellow-500" />;
      case 'synced':
        return <Check fontSize="small" className="text-green-500" />;
      case 'error':
        return <ErrorOutline fontSize="small" className="text-red-500" />;
      case 'idle':
        return <Save fontSize="small" className="text-gray-400" />;
      default:
        return <HelpOutline fontSize="small" className="text-gray-400" />;
    }
  };

  const displayStatusMessage = statusMessage || saveStatus;
  const lastSyncedTime = lastSynced ? dayjs(lastSynced).fromNow() : 'never';
  const fullStatusMessage = isPersisted ? 
    `${displayStatusMessage} (Last synced: ${lastSyncedTime})` : 
    `${displayStatusMessage} (Not synced yet)`;

  const showSuggestButton = currentTitle === 'Untitled Artifact' && !!onSuggestTitle;

  return (
    <div className="title-bar flex items-center justify-between pl-4 pr-2 py-1 bg-background-secondary border-b border-border">
      <div className="flex items-center flex-grow min-w-0 mr-2">
        {isEditing ? (
          <TextField
            variant="standard"
            value={currentTitle}
            onChange={handleTitleChangeLocal}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
            fullWidth
            className="title-input mr-2"
            InputProps={{
              disableUnderline: true,
              style: { 
                fontSize: '1.125rem',
                fontWeight: 500, 
                color: 'var(--foreground)'
              },
            }}
            sx={{ '.MuiInput-input': { padding: 0 } }}
          />
        ) : (
          <div className="flex items-center min-w-0">
            <Tooltip title="Click to edit title">
              <span 
                onClick={handleEditClick} 
                className="text-lg font-medium truncate cursor-pointer hover:bg-muted/50 rounded px-1 mr-1"
              >
                {currentTitle}
              </span>
            </Tooltip>
            {!isEditing && (
              <Tooltip title="Edit Title">
                <IconButton 
                  size="small" 
                  onClick={handleEditClick} 
                  sx={{ ml: 0.5, color: 'var(--muted-foreground)' }}
                >
                  <Edit fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
            {showSuggestButton && (
              <Tooltip title="Suggest Title using AI">
                <span>
                  <IconButton 
                    size="small" 
                    onClick={onSuggestTitle} 
                    disabled={isSuggestingTitle} 
                    sx={{ ml: 0.5, color: 'var(--muted-foreground)' }}
                  >
                    {isSuggestingTitle ? <CircularProgress size={16} /> : <AutoAwesome fontSize="inherit" />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center space-x-1">
        <Tooltip title={fullStatusMessage}>
          <span className={`save-status-indicator flex items-center text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground cursor-help`}>
             {getStatusIcon()}
          </span>
        </Tooltip>
      </div>
    </div>
  );
} 