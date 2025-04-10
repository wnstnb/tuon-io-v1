'use client';

import React, { useState } from 'react';
import { Plus, X, FilePlus, Copy, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ArtifactService } from '../lib/services/ArtifactService';

interface EditorFABProps {
  artifactId?: string;
  userId?: string;
  onDelete?: () => void;
}

export default function EditorFAB({ artifactId, userId, onDelete }: EditorFABProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const router = useRouter();

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleNewArtifact = async () => {
    if (!userId) {
      alert('You must be logged in to create a new artifact');
      return;
    }

    try {
      const newArtifactId = await ArtifactService.createArtifact(userId, 'Untitled Artifact');
      if (newArtifactId) {
        router.push(`/editor?artifactId=${newArtifactId}`);
      }
    } catch (error) {
      console.error('Error creating new artifact:', error);
      alert('Failed to create new artifact');
    } finally {
      setIsExpanded(false);
    }
  };

  const handleDuplicateArtifact = async () => {
    if (!userId || !artifactId) {
      alert('Cannot duplicate: No artifact is currently open');
      return;
    }

    try {
      const newArtifactId = await ArtifactService.duplicateArtifact(artifactId);
      if (newArtifactId) {
        router.push(`/editor?artifactId=${newArtifactId}`);
      }
    } catch (error) {
      console.error('Error duplicating artifact:', error);
      alert('Failed to duplicate artifact');
    } finally {
      setIsExpanded(false);
    }
  };

  const handleDeleteArtifact = async () => {
    if (!artifactId) {
      alert('No artifact selected');
      return;
    }

    if (!confirm('Are you sure you want to delete this artifact?')) return;

    try {
      const success = await ArtifactService.deleteArtifact(artifactId);
      if (success) {
        if (onDelete) {
          onDelete();
        } else {
          // Navigate away if no custom handler
          const url = new URL(window.location.href);
          url.searchParams.delete('artifactId');
          router.push(url.toString());
        }
      }
    } catch (error) {
      console.error('Error deleting artifact:', error);
      alert('Failed to delete artifact');
    } finally {
      setIsExpanded(false);
    }
  };

  return (
    <div className={`fab-container ${isExpanded ? 'expanded' : ''}`}>
      <button 
        className={`fab-main ${isExpanded ? 'open' : ''}`} 
        onClick={toggleExpand}
        aria-label={isExpanded ? "Close menu" : "Open menu"}
      >
        <Plus className="icon-open" size={24} />
        <X className="icon-close" size={24} />
      </button>
      
      <div className="fab-actions">
        <button 
          className="fab-action new" 
          onClick={handleNewArtifact}
          aria-label="Create new artifact"
        >
          <FilePlus size={20} />
          <span className="fab-tooltip">New Artifact</span>
        </button>
        
        <button 
          className="fab-action duplicate" 
          onClick={handleDuplicateArtifact}
          aria-label="Duplicate artifact"
          disabled={!artifactId}
        >
          <Copy size={20} />
          <span className="fab-tooltip">Duplicate</span>
        </button>
        
        <button 
          className="fab-action trash" 
          onClick={handleDeleteArtifact}
          aria-label="Delete artifact"
          disabled={!artifactId}
        >
          <Trash2 size={20} />
          <span className="fab-tooltip">Delete</span>
        </button>
      </div>
    </div>
  );
} 