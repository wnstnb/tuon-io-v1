'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { File, Loader2, Trash2, RefreshCw, Check, Clipboard, X } from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';
import { ArtifactService, type Artifact } from '../lib/services/ArtifactService';

interface FileExplorerProps {
  currentArtifactId?: string;
}

export default function FileExplorer({ currentArtifactId }: FileExplorerProps) {
  const { user } = useSupabase();
  const router = useRouter();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());

  // Load artifacts when component mounts or user changes
  const loadArtifacts = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const userArtifacts = await ArtifactService.getUserArtifacts(user.id);
      setArtifacts(userArtifacts);
    } catch (error) {
      console.error('Error loading artifacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update selected artifact when currentArtifactId changes
  useEffect(() => {
    if (currentArtifactId) {
      setSelectedArtifactId(currentArtifactId);
      
      // Refresh the artifacts list when currentArtifactId changes
      // This ensures newly created artifacts appear in the list
      loadArtifacts();
    }
  }, [currentArtifactId, user]);

  // Load artifacts on initial component mount
  useEffect(() => {
    loadArtifacts();
    
    // Refresh artifacts when the window gets focus
    // This helps keep the list up-to-date when coming back to the tab
    const handleFocus = () => {
      loadArtifacts();
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const handleArtifactClick = (artifactId: string) => {
    if (isMultiSelectMode) {
      // In multiselect mode, toggle selection
      const newSelectedArtifacts = new Set(selectedArtifacts);
      if (newSelectedArtifacts.has(artifactId)) {
        newSelectedArtifacts.delete(artifactId);
      } else {
        newSelectedArtifacts.add(artifactId);
      }
      setSelectedArtifacts(newSelectedArtifacts);
    } else {
      // In normal mode, navigate to the artifact
      console.log(`Navigating to artifact: ${artifactId}`);
      // Use replace instead of push to ensure a clean navigation
      router.replace(`/editor?artifactId=${artifactId}`);
      
      // Also update the local selection state
      setSelectedArtifactId(artifactId);
    }
  };

  const toggleMultiSelectMode = () => {
    if (isMultiSelectMode) {
      // Exit multiselect mode and clear selections
      setIsMultiSelectMode(false);
      setSelectedArtifacts(new Set());
    } else {
      // Enter multiselect mode
      setIsMultiSelectMode(true);
    }
  };

  const handleSelectAll = () => {
    if (selectedArtifacts.size === artifacts.length) {
      // If all are selected, deselect all
      setSelectedArtifacts(new Set());
    } else {
      // Otherwise, select all
      setSelectedArtifacts(new Set(artifacts.map(artifact => artifact.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedArtifacts.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedArtifacts.size} selected artifact(s)?`)) return;
    
    const deletePromises: Promise<boolean>[] = [];
    const artifactIds = Array.from(selectedArtifacts);
    
    // Start all delete operations in parallel
    artifactIds.forEach(id => {
      deletePromises.push(ArtifactService.deleteArtifact(id));
    });
    
    // Wait for all deletes to complete
    try {
      const results = await Promise.all(deletePromises);
      const successCount = results.filter(Boolean).length;
      
      // Update the artifacts list to remove the deleted artifacts
      setArtifacts(artifacts.filter(a => !selectedArtifacts.has(a.id)));
      
      // Clear the selection
      setSelectedArtifacts(new Set());
      
      // Exit multiselect mode if all items were deleted
      if (artifacts.length === successCount) {
        setIsMultiSelectMode(false);
      }
      
      // If currently selected artifact was in the deleted set, clear the URL
      if (currentArtifactId && selectedArtifacts.has(currentArtifactId)) {
        const url = new URL(window.location.href);
        url.searchParams.delete('artifactId');
        router.push(url.toString());
      }
      
      alert(`Successfully deleted ${successCount} artifact(s).`);
    } catch (error) {
      console.error('Error deleting artifacts:', error);
      alert('An error occurred while deleting artifacts.');
    }
  };

  const handleDeleteArtifact = async (artifactId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the parent click handler
    
    if (!confirm('Are you sure you want to delete this artifact?')) return;
    
    try {
      const success = await ArtifactService.deleteArtifact(artifactId);
      if (success) {
        // Update the local state to remove the deleted artifact
        setArtifacts(artifacts.filter(a => a.id !== artifactId));
        
        // If we deleted the currently selected artifact, redirect to a new one
        if (artifactId === currentArtifactId) {
          const url = new URL(window.location.href);
          url.searchParams.delete('artifactId');
          router.push(url.toString());
        }
      }
    } catch (error) {
      console.error('Error deleting artifact:', error);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <h3 className="file-explorer-title">Your Artifacts</h3>
        <div className="file-explorer-actions">
          <button 
            className="refresh-button" 
            onClick={loadArtifacts}
            aria-label="Refresh artifacts list"
          >
            <RefreshCw size={14} />
          </button>
          <button
            className={`multiselect-button ${isMultiSelectMode ? 'active' : ''}`}
            onClick={toggleMultiSelectMode}
            aria-label={isMultiSelectMode ? "Exit multiselect mode" : "Enter multiselect mode"}
          >
            {isMultiSelectMode ? <X size={14} /> : <Clipboard size={14} />}
          </button>
        </div>
      </div>
      
      {isMultiSelectMode && (
        <div className="multiselect-actions">
          <button 
            className="select-all-button"
            onClick={handleSelectAll}
          >
            {selectedArtifacts.size === artifacts.length ? 'Deselect All' : 'Select All'}
          </button>
          <button 
            className="delete-selected-button"
            onClick={handleDeleteSelected}
            disabled={selectedArtifacts.size === 0}
          >
            <Trash2 size={14} />
            Delete Selected ({selectedArtifacts.size})
          </button>
        </div>
      )}
      
      {isLoading ? (
        <div className="loading-container">
          <Loader2 size={24} className="spinner" />
          <p>Loading artifacts...</p>
        </div>
      ) : artifacts.length === 0 ? (
        <div className="empty-artifacts">
          <p>No artifacts found</p>
          <p className="hint">Create a new artifact to get started</p>
        </div>
      ) : (
        <div className="artifacts-list">
          {artifacts.map((artifact) => (
            <div 
              key={artifact.id}
              onClick={() => handleArtifactClick(artifact.id)}
              className={`artifact-item ${selectedArtifactId === artifact.id && !isMultiSelectMode ? 'selected' : ''} ${isMultiSelectMode && selectedArtifacts.has(artifact.id) ? 'multi-selected' : ''}`}
            >
              {isMultiSelectMode && (
                <div className="select-checkbox">
                  {selectedArtifacts.has(artifact.id) && <Check size={14} />}
                </div>
              )}
              <div className="artifact-icon">
                <File size={16} />
              </div>
              <div className="artifact-info">
                <div className="artifact-title">{artifact.title}</div>
                <div className="artifact-date">{formatDate(artifact.updatedAt)}</div>
              </div>
              {!isMultiSelectMode && (
                <button 
                  className="delete-button"
                  onClick={(e) => handleDeleteArtifact(artifact.id, e)}
                  aria-label="Delete artifact"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 