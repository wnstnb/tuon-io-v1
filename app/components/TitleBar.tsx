'use client';

import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';

interface TitleBarProps {
  initialTitle?: string;
  onTitleChange?: (title: string) => void;
  saveStatus: 'idle' | 'syncing' | 'synced' | 'pending' | 'error';
  statusMessage: string;
  isPersisted: boolean;
  lastSynced: string | null;
  onForceSync: () => void;
}

export default function TitleBar({ initialTitle = 'Untitled Artifact', onTitleChange, saveStatus, statusMessage, isPersisted, lastSynced, onForceSync }: TitleBarProps) {
  const [title, setTitle] = useState(initialTitle);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (onTitleChange) {
      onTitleChange(title);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      if (onTitleChange) {
        onTitleChange(title);
      }
    }
  };

  return (
    <div className="title-bar">
      {isEditing ? (
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="title-input"
        />
      ) : (
        <h2 
          className="title-display" 
          onClick={() => setIsEditing(true)}
        >
          {title}
        </h2>
      )}
      <div className="save-status-container">
        <button 
          onClick={onForceSync} 
          className={`manual-save-button ${isPersisted ? '' : 'disabled'}`}
          disabled={!isPersisted}
          title="Save changes"
          aria-label="Save changes"
        >
          <Save size={16} />
        </button>
        <span className={`save-status-indicator ${saveStatus}`} title={statusMessage}>
          {statusMessage}
        </span>
      </div>
    </div>
  );
} 