import { supabase } from '../supabase';
import { ImageService } from './ImageService';
import { Block } from '@blocknote/core';

export interface ArtifactView {
  id: string;
  artifactId: string;
  userId: string;
  title: string;
  imageUrl?: string;
  comment?: string;
  createdAt: Date;
}

export interface DBArtifactView {
  view_id: string;
  artifact_id: string;
  user_id: string;
  title: string;
  image_url?: string;
  comment?: string;
  created_at: string;
}

/**
 * Service for handling artifact view operations
 */
export class ArtifactViewService {
  /**
   * Create a new artifact view
   * @param artifactId The artifact ID
   * @param userId The user ID
   * @param title The view title
   * @param imageDataUrl The image data URL
   * @param comment Optional comment about the view
   * @returns The created view ID
   */
  static async createArtifactView(
    artifactId: string,
    userId: string,
    title: string,
    imageDataUrl?: string,
    comment?: string
  ): Promise<string> {
    if (!artifactId || !userId) {
      console.error('Cannot create artifact view: Missing required parameters');
      throw new Error('Artifact ID and User ID are required to create a view');
    }
    
    console.log(`Creating new view for artifact: ${artifactId}`);

    // Process image if provided
    let imageUrl: string | undefined;
    if (imageDataUrl) {
      try {
        // Upload the image to storage
        imageUrl = await ImageService.uploadArtifactViewImage(
          userId,
          artifactId,
          imageDataUrl
        );
        console.log(`Uploaded view image with path: ${imageUrl}`);
      } catch (error) {
        console.error('Error uploading view image:', error);
      }
    }
    
    // Insert the view record
    const { data, error } = await supabase
      .from('artifact_views')
      .insert({
        artifact_id: artifactId,
        user_id: userId,
        title: title || 'Untitled View',
        image_url: imageUrl,
        comment: comment
      })
      .select('view_id')
      .single();

    if (error) {
      console.error('Error creating artifact view:', error);
      throw new Error(`Failed to create artifact view: ${error.message}`);
    }

    console.log(`Successfully created artifact view with ID: ${data.view_id}`);
    return data.view_id;
  }

  /**
   * Get all views for an artifact
   * @param artifactId The artifact ID
   * @returns Array of artifact views
   */
  static async getArtifactViews(artifactId: string): Promise<ArtifactView[]> {
    if (!artifactId) {
      console.warn('Cannot fetch artifact views: No artifact ID provided');
      return [];
    }
    
    const { data, error } = await supabase
      .from('artifact_views')
      .select('*')
      .eq('artifact_id', artifactId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching views for artifact ${artifactId}:`, error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Convert from DB format to app format
    return data.map((view: DBArtifactView) => ({
      id: view.view_id,
      artifactId: view.artifact_id,
      userId: view.user_id,
      title: view.title,
      imageUrl: view.image_url,
      comment: view.comment,
      createdAt: new Date(view.created_at)
    }));
  }

  /**
   * Get a specific view by ID
   * @param viewId The view ID
   * @returns The view data or null if not found
   */
  static async getArtifactView(viewId: string): Promise<ArtifactView | null> {
    if (!viewId) {
      console.warn('Cannot fetch artifact view: No view ID provided');
      return null;
    }
    
    const { data, error } = await supabase
      .from('artifact_views')
      .select('*')
      .eq('view_id', viewId)
      .single();

    if (error) {
      console.error(`Error fetching view ${viewId}:`, error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Convert from DB format to app format
    return {
      id: data.view_id,
      artifactId: data.artifact_id,
      userId: data.user_id,
      title: data.title,
      imageUrl: data.image_url,
      comment: data.comment,
      createdAt: new Date(data.created_at)
    };
  }

  /**
   * Delete an artifact view
   * @param viewId The view ID
   * @returns Success status
   */
  static async deleteArtifactView(viewId: string): Promise<boolean> {
    // First get the view to get the image URL
    const view = await this.getArtifactView(viewId);
    
    if (!view) {
      console.warn(`Cannot delete view ${viewId}: Not found`);
      return false;
    }
    
    // Delete the database record
    const { error } = await supabase
      .from('artifact_views')
      .delete()
      .eq('view_id', viewId);

    if (error) {
      console.error(`Error deleting view ${viewId}:`, error);
      return false;
    }
    
    // If the view had an image, delete that too
    if (view.imageUrl) {
      try {
        // Extract bucket and path from the imageUrl string
        const [bucket, ...pathParts] = view.imageUrl.split('/');
        const path = pathParts.join('/');
        
        await ImageService.deleteImage(
          'artifact-images' as 'conversation-images' | 'artifact-images',
          path
        );
        
        console.log(`Deleted view image: ${view.imageUrl}`);
      } catch (error) {
        console.error('Error deleting view image:', error);
        // Still return true since the view record was deleted
      }
    }

    return true;
  }

  /**
   * Update an artifact view's title or comment
   * @param viewId The view ID
   * @param updates The fields to update
   * @returns Success status
   */
  static async updateArtifactView(
    viewId: string,
    updates: { title?: string; comment?: string }
  ): Promise<boolean> {
    if (!viewId || !updates) {
      return false;
    }
    
    const { error } = await supabase
      .from('artifact_views')
      .update(updates)
      .eq('view_id', viewId);

    if (error) {
      console.error(`Error updating view ${viewId}:`, error);
      return false;
    }

    return true;
  }
} 