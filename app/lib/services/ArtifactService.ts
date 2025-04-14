import { supabase } from '../supabase';
import { ImageService } from './ImageService';
import { Block } from '@blocknote/core';

// Custom error for artifact not found scenarios
export class ArtifactNotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ArtifactNotFoundError';
    // Set the prototype explicitly for correct instanceof checks
    Object.setPrototypeOf(this, ArtifactNotFoundError.prototype);
  }
}

export interface Artifact {
  id: string;
  title: string;
  content: Block[];
  userId: string;
  folderId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DBartifact {
  artifact_id: string;
  user_id: string;
  title: string;
  content: any;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Service for handling artifact operations
 */
export class ArtifactService {
  /**
   * Create a new artifact
   * @param userId The user ID
   * @param title The artifact title
   * @param content Initial content (optional)
   * @param folderId Optional ID of the folder to place the artifact in
   * @returns The created artifact ID
   */
  static async createArtifact(
    userId: string,
    title: string,
    content: Block[] = [],
    folderId?: string | null
  ): Promise<string> {
    if (!userId) {
      console.error('Cannot create artifact: No user ID provided');
      throw new Error('User ID is required to create an artifact');
    }
    
    console.log(`Creating new artifact for user: ${userId}` + (folderId ? ` in folder ${folderId}` : ''));

    // Always generate a clean title for storage and comparison
    const cleanTitle = title || 'Untitled Artifact';

    // --- REMOVE/COMMENT OUT existing artifact check --- //
    /*
    // Check if the user already has a recent artifact with this exact title
    const { data: existingArtifacts, error: queryError } = await supabase
      .from('artifacts')
      .select('artifact_id, title, updated_at, content')
      .eq('user_id', userId)
      .eq('title', cleanTitle)
      .order('updated_at', { ascending: false })
      .limit(5); // Check the most recent 5 matching artifacts
    
    if (queryError) {
      console.error('Error checking for existing artifacts:', queryError);
    }

    // If an artifact with this title exists, consider using that instead
    if (existingArtifacts && existingArtifacts.length > 0) {
      console.log(`Found ${existingArtifacts.length} existing artifact(s) with title "${cleanTitle}"`);
      
      // Find an artifact that was updated recently (last 24 hours)
      const recentCutoff = new Date();
      recentCutoff.setHours(recentCutoff.getHours() - 24);
      
      const recentArtifact = existingArtifacts.find(artifact => {
        const updatedAt = new Date(artifact.updated_at);
        return updatedAt > recentCutoff;
      });
      
      if (recentArtifact) {
        console.log(`Found recent artifact with title "${cleanTitle}" from ${recentArtifact.updated_at}`);
        
        // Check if content is empty or simple - if so, reuse existing artifact
        const isEmpty = !content || content.length === 0 || 
                       (content.length === 1 && (!content[0].content || Array.isArray(content[0].content) && content[0].content.length === 0));
        
        if (isEmpty) {
          console.log('Content is empty, returning existing artifact ID:', recentArtifact.artifact_id);
          return recentArtifact.artifact_id;
        }
        
        // Check if this is potentially a duplicate save request
        if (JSON.stringify(content) === JSON.stringify(recentArtifact.content)) {
          console.log('Content matches existing artifact, returning existing ID:', recentArtifact.artifact_id);
          return recentArtifact.artifact_id;
        }
      }
      
      // If we get here, we need a new artifact with a unique title
      const timestamp = new Date().toISOString().substring(0, 19).replace('T', ' ');
      title = `${cleanTitle} (${timestamp})`;
      console.log(`Using unique title for new artifact: ${title}`);
    }
    */
    // --- END REMOVAL ---
    
    // Process content to handle any embedded images
    const processedContent = await this.processContentImages(userId, content);
    
    const { data, error } = await supabase
      .from('artifacts')
      .insert({
        user_id: userId,
        title: title,
        content: processedContent,
        folder_id: folderId || null
      })
      .select('artifact_id')
      .single();

    if (error) {
      console.error('Error creating artifact:', error);
      console.error(`User ID: ${userId}, Title: ${title}`);
      throw new Error(`Failed to create artifact: ${error.message}`);
    }

    console.log(`Successfully created artifact with ID: ${data.artifact_id}`);
    return data.artifact_id;
  }

  /**
   * Get an artifact by ID
   * @param artifactId The artifact ID
   * @returns The artifact data
   */
  static async getArtifact(artifactId: string): Promise<Artifact | null> {
    if (!artifactId) {
      console.warn('Cannot fetch artifact: No artifact ID provided');
      return null;
    }
    
    console.log(`Fetching artifact with ID: ${artifactId}`);
    
    const { data, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('artifact_id', artifactId)
      .single();

    if (error) {
      console.error(`Error fetching artifact ${artifactId}:`, error);
      return null;
    }

    if (!data) {
      console.warn(`No artifact found with ID: ${artifactId}`);
      return null;
    }

    console.log(`Successfully fetched artifact: ${data.artifact_id} (title: ${data.title})`);
    
    // Convert from DB format to app format
    return {
      id: data.artifact_id,
      title: data.title,
      content: data.content || [],
      userId: data.user_id,
      folderId: data.folder_id,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  /**
   * Get all artifacts for a user, optionally filtering by folder
   * @param userId The user ID
   * @param folderId Optional: Folder ID to filter by. Use `null` to get unfiled artifacts. Omit/undefined for all.
   * @returns Array of artifacts
   */
  static async getUserArtifacts(
      userId: string,
      folderId?: string | null
  ): Promise<Artifact[]> {
    if (!userId) {
        console.warn('ArtifactService.getUserArtifacts: No userId provided');
        return [];
    }

    let query = supabase
      .from('artifacts')
      .select('*')
      .eq('user_id', userId);

    // Apply folder filter if provided
    if (folderId === null) {
      // User specifically asked for unfiled artifacts
      query = query.is('folder_id', null);
      console.log(`ArtifactService.getUserArtifacts: Fetching unfiled artifacts for user ${userId}`);
    } else if (typeof folderId === 'string') {
      // User asked for artifacts in a specific folder
      query = query.eq('folder_id', folderId);
      console.log(`ArtifactService.getUserArtifacts: Fetching artifacts in folder ${folderId} for user ${userId}`);
    } else {
      // No folderId or undefined - fetch all artifacts for the user
       console.log(`ArtifactService.getUserArtifacts: Fetching all artifacts for user ${userId}`);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user artifacts:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }
    console.log(`ArtifactService.getUserArtifacts: Found ${data.length} artifacts matching criteria.`);

    // Convert from DB format to app format
    return data.map((artifact: DBartifact) => ({
      id: artifact.artifact_id,
      title: artifact.title,
      content: artifact.content || [],
      userId: artifact.user_id,
      folderId: artifact.folder_id,
      createdAt: new Date(artifact.created_at),
      updatedAt: new Date(artifact.updated_at)
    }));
  }

  /**
   * Update an artifact's content and optionally its title
   * @param artifactId The artifact ID
   * @param content The new content
   * @param userId The user ID (for image processing and ownership check)
   * @param title The new title (optional)
   * @returns Success status
   */
  static async updateArtifactContent(
    artifactId: string,
    content: Block[],
    userId: string,
    title?: string // Added optional title parameter
  ): Promise<boolean> {
    // Don't attempt update with empty input
    if (!artifactId || !content || !userId) {
      console.warn('Missing required parameters for updateArtifactContent');
      return false;
    }
    // --- Log received content --- //
    console.log(`ArtifactService.updateArtifactContent: Received update for ${artifactId}`, { title, blockCount: content?.length ?? 0, firstBlock: JSON.stringify(content?.[0]) });

    // Generate a unique operation ID to track this specific update attempt
    const operationId = Math.random().toString(36).substring(2, 15);
    // console.log(`[${operationId}] Starting update for artifact ${artifactId}`);

    try {
      // First, check if the artifact exists and belongs to this user
      const { data: existingArtifact, error: fetchError } = await supabase
        .from('artifacts')
        .select('artifact_id, content, title, updated_at') // Select title as well
        .eq('artifact_id', artifactId)
        .eq('user_id', userId)
        .single();
      
      if (fetchError) {
        // Check if the error is specifically because the artifact wasn't found (PGRST116 from .single())
        // @ts-ignore Supabase error type might not be perfectly typed here
        if (fetchError.code === 'PGRST116') {
          throw new ArtifactNotFoundError(`[${operationId}] Artifact ${artifactId} not found or not owned by user ${userId} during content update.`);
        } else {
          // Log other fetch errors and return false
          console.error(`[${operationId}] Error verifying artifact ownership:`, fetchError);
          console.error(`[${operationId}] Artifact ID: ${artifactId}, User ID: ${userId}`);
          return false;
        }
      }
      // Handle case where fetchError is null but existingArtifact is somehow falsy (shouldn't happen with .single() but good practice)
      if (!existingArtifact) {
         throw new ArtifactNotFoundError(`[${operationId}] Artifact ${artifactId} not found (no data returned) for user ${userId} during content update.`);
      }
      
      // Rate limit: Check if this artifact was updated very recently
      const lastUpdateTime = new Date(existingArtifact.updated_at).getTime();
      const currentTime = Date.now();
      const minimumUpdateInterval = 2000; // 2 seconds minimum between updates
      
      if (currentTime - lastUpdateTime < minimumUpdateInterval) {
        // console.log(`[${operationId}] Update skipped - too soon after last update (${currentTime - lastUpdateTime}ms)`);
        return true; // Return success since we're just throttling
      }
      
      // More robust content comparison
      let contentChanged = false;
      
      // First do a quick string comparison
      const newContentStr = JSON.stringify(content);
      const existingContentStr = JSON.stringify(existingArtifact.content);
      
      if (newContentStr !== existingContentStr) {
        // For a more detailed check, we could implement specific Block comparison logic here
        // For now, just use string comparison
        contentChanged = true;
      }
      
      const titleChanged = title !== undefined && title !== existingArtifact.title;

      if (!contentChanged && !titleChanged) {
        // console.log(`[${operationId}] No changes detected (content or title), skipping update`);
        return true; // Consider it a successful update since the state is already what we want
      }
      
      // Prepare data for update
      const updateData: Partial<DBartifact> = {};
      if (contentChanged) {
        console.log(`[${operationId}] Content changed, attempting update...`);
        // --- RE-ENABLE image processing --- //
        const processedContent = await this.processContentImages(userId, content, artifactId);
        updateData.content = processedContent;
        // --- Log processed content --- //
        console.log(`[${operationId}] Content after processContentImages:`, { blockCount: processedContent?.length ?? 0, firstBlock: JSON.stringify(processedContent?.[0]) });
        // updateData.content = content; // REMOVE direct save of raw content
      }
      if (titleChanged) {
        // console.log(`[${operationId}] Title changed to: \"${title}\"`);
        updateData.title = title; // Add title to update data if changed
      }
      updateData.updated_at = new Date().toISOString(); // Always update the timestamp

      // console.log(`[${operationId}] Updating artifact with data:`, JSON.stringify(Object.keys(updateData)));
      
      const { error: updateError } = await supabase
        .from('artifacts')
        .update(updateData) // Use the prepared update data
        .eq('artifact_id', artifactId)
        .eq('user_id', userId);

      if (updateError) {
        // console.error(`[${operationId}] Error updating artifact content/title:`, updateError);
        // --- Log full error --- //
        console.error(`[${operationId}] Error during supabase.update for artifact ${artifactId}:`, JSON.stringify(updateError, null, 2));
        return false;
      }

      // console.log(`[${operationId}] Successfully updated artifact:`, artifactId);
      return true;
    } catch (error) {
      // Re-throw ArtifactNotFoundError, otherwise log and return false
      if (error instanceof ArtifactNotFoundError) {
        throw error;
      }
      console.error(`[${operationId}] Unexpected error in updateArtifactContent:`, error);
      return false;
    }
  }

  /**
   * Update an artifact's title
   * @param artifactId The artifact ID
   * @param title The new title
   * @param userId Optional user ID for artifact creation
   * @param providedClient Optional authenticated Supabase client
   * @returns Success status
   * @throws ArtifactNotFoundError if the artifact is not found
   */
  static async updateArtifactTitle(
    artifactId: string,
    title: string,
    userId?: string, // Added optional userId parameter for artifact creation
    providedClient?: any // Optional authenticated Supabase client
  ): Promise<boolean> {
    if (!artifactId || !title) {
      console.warn('Missing required parameters for updateArtifactTitle');
      return false;
    }

    // Generate a unique operation ID to track this update
    const operationId = Math.random().toString(36).substring(2, 15);
    // console.log(`[${operationId}] Starting title update for artifact ${artifactId}`);

    try {
      // Use the provided client or fall back to the default one
      const client = providedClient || supabase;
      
      // First, verify the artifact exists and get current title
      const { data: existingArtifact, error: fetchError } = await client
        .from('artifacts')
        .select('title, user_id')
        .eq('artifact_id', artifactId)
        .single();
      
      // If there was any fetch error (including PGRST116), check if it's 'not found'
      if (fetchError) {
        // @ts-ignore Supabase error type might not be perfectly typed here
        if (fetchError.code === 'PGRST116') {
          throw new ArtifactNotFoundError(`[${operationId}] Artifact ${artifactId} not found during title update verification.`);
        } else {
          // Log other fetch errors and return false
          console.error(`[${operationId}] Error verifying artifact exists before title update:`, fetchError);
          return false;
        }
      }
      // Handle case where fetchError is null but existingArtifact is somehow falsy
      if (!existingArtifact) {
         throw new ArtifactNotFoundError(`[${operationId}] Artifact ${artifactId} not found (no data returned) during title update verification.`);
      }
      
      // Capture the artifact's user_id if available but not provided
      if (existingArtifact && !userId && existingArtifact.user_id) {
        userId = existingArtifact.user_id;
      }
      
      // Skip update if title hasn't changed
      if (existingArtifact && existingArtifact.title === title) {
        // console.log(`[${operationId}] Title hasn't changed, skipping update`);
        return true;
      }
      
      // Update with timestamp to ensure we know which update is most recent
      const updateTimestamp = new Date().toISOString();
      
      const { error } = await client
        .from('artifacts')
        .update({ 
          title,
          updated_at: updateTimestamp
        })
        .eq('artifact_id', artifactId);

      if (error) {
        // console.error(`[${operationId}] Error updating artifact title:`, error);
        return false;
      }

      // console.log(`[${operationId}] Successfully updated title for artifact:`, artifactId);
      return true;
    } catch (error) {
      // Re-throw ArtifactNotFoundError, otherwise log and return false
      if (error instanceof ArtifactNotFoundError) {
        throw error;
      }
      console.error(`[${operationId}] Exception in updateArtifactTitle:`, error);
      return false;
    }
  }

  /**
   * Delete an artifact
   * @param artifactId The artifact ID
   * @returns Success status
   */
  static async deleteArtifact(artifactId: string): Promise<boolean> {
    // Note: This doesn't automatically clean up storage. 
    // For a production app, you'd want to implement a storage cleanup process.
    const { error } = await supabase
      .from('artifacts')
      .delete()
      .eq('artifact_id', artifactId);

    if (error) {
      console.error('Error deleting artifact:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplicate an existing artifact
   * @param artifactId The ID of the artifact to duplicate
   * @returns The new artifact ID
   */
  static async duplicateArtifact(artifactId: string): Promise<string> {
    // Get the original artifact, including its folder_id
    const { data: originalDbArtifact, error: fetchError } = await supabase
        .from('artifacts')
        .select('*') // Select all fields
        .eq('artifact_id', artifactId)
        .single();

    if (fetchError || !originalDbArtifact) {
      console.error(`Cannot duplicate artifact: Original artifact ${artifactId} not found or error fetching.`, fetchError);
      throw new Error('Original artifact not found');
    }
    
    // Map to Artifact type to easily access properties like userId and content
    const originalArtifact: Artifact = {
        id: originalDbArtifact.artifact_id,
        title: originalDbArtifact.title,
        content: originalDbArtifact.content || [],
        userId: originalDbArtifact.user_id,
        folderId: originalDbArtifact.folder_id, // Capture folderId
        createdAt: new Date(originalDbArtifact.created_at),
        updatedAt: new Date(originalDbArtifact.updated_at)
    };
    
    // Create a duplicate title
    const duplicateTitle = `${originalArtifact.title} (Copy)`;
    
    // Create a new artifact with the same content, user, and *folder*, but a different title
    // Note: createArtifact handles image processing if needed
    const newArtifactId = await this.createArtifact(
      originalArtifact.userId,
      duplicateTitle,
      originalArtifact.content,
      originalArtifact.folderId // Pass the original folderId
    );
    
    console.log(`ArtifactService.duplicateArtifact: Duplicated ${artifactId} to ${newArtifactId} in folder ${originalArtifact.folderId || 'root'}`);
    return newArtifactId;
  }

  /**
   * Process content blocks to upload any embedded images to Supabase Storage
   * @param userId User ID
   * @param content Content blocks
   * @param artifactId Optional artifact ID for organizing uploads
   * @returns Processed content blocks with updated image URLs
   */
  private static async processContentImages(
    userId: string,
    content: Block[],
    artifactId?: string
  ): Promise<Block[]> {
    // Make a deep copy to avoid mutating the original
    const processedContent: Block[] = JSON.parse(JSON.stringify(content));
    
    // Helper function to process a block recursively
    const processBlock = async (block: any) => {
      // Handle image blocks
      if (block.type === 'image' && block.props?.url) {
        // Check if it's a data URL (needs to be uploaded)
        if (block.props.url.startsWith('data:')) {
          try {
            // Upload the image to Supabase
            const imageUrl = artifactId
              ? await ImageService.uploadArtifactImage(userId, artifactId, block.props.url)
              : await ImageService.uploadImage(userId, block.props.url, 'artifact-images');
            
            // Update the URL in the block
            block.props.url = imageUrl;
          } catch (error) {
            console.error('Error processing embedded image:', error);
          }
        }
      }
      
      // Recursively process children if they exist
      if (block.children && Array.isArray(block.children)) {
        for (const childBlock of block.children) {
          await processBlock(childBlock);
        }
      }
    };
    
    // Process each top-level block
    for (const block of processedContent) {
      await processBlock(block);
    }
    
    return processedContent;
  }

  /**
   * Create a new artifact with a specified ID
   * @param artifactId The client-generated artifact ID
   * @param userId The user ID
   * @param title The artifact title
   * @param content Initial content (optional)
   * @param folderId Optional ID of the folder to place the artifact in
   * @param providedClient Optional Supabase client with authentication context
   * @returns Success status
   */
  static async createArtifactWithId(
    artifactId: string,
    userId: string,
    title: string,
    content: Block[] = [],
    folderId?: string | null, // Added folderId parameter
    providedClient?: any // Optional authenticated Supabase client
  ): Promise<boolean> {
    if (!artifactId || !userId) {
      console.error('Cannot create artifact: Missing ID or user ID');
      return false;
    }
    
    console.log(`Creating new artifact with specific ID: ${artifactId} for user: ${userId}` + (folderId ? ` in folder ${folderId}` : ''));

    try {
      // Use the provided client or fall back to the default client
      const client = providedClient || supabase;
      
      // Check if artifact with this ID already exists
      const { data: existingArtifact, error: checkError } = await client
        .from('artifacts')
        .select('artifact_id')
        .eq('artifact_id', artifactId)
        .maybeSingle(); // Use maybeSingle to handle not found gracefully

      if (checkError) {
          console.error(`Error checking for existing artifact ${artifactId}:`, checkError);
          // Decide if this should prevent creation or not. Let's assume we proceed if check fails.
      }
      
      if (existingArtifact) {
        console.log(`Artifact ID ${artifactId} already exists, skipping creation`);
        // Optionally: Update the existing artifact's folder ID if provided?
        // For now, just return true as it exists.
        return true; // Consider it a success because the ID exists
      }

       // Optional: Verify folderId exists and belongs to the user if provided
       if (folderId) {
           // Add check similar to FolderService.createFolder if needed
            console.log(`Target folder ID provided: ${folderId}`);
       }
      
      // Process content to handle any embedded images
      const processedContent = await this.processContentImages(userId, content, artifactId);
      
      // Create artifact with specified ID and folder
      const { error } = await client
        .from('artifacts')
        .insert({
          artifact_id: artifactId,
          user_id: userId,
          title: title || 'Untitled Artifact',
          content: processedContent,
          folder_id: folderId || null // Set folder_id
        });

      if (error) {
        console.error('Error creating artifact with specified ID:', error);
        return false;
      }

      console.log(`Successfully created artifact with ID: ${artifactId}`);
      return true;
    } catch (err) {
      console.error('Exception creating artifact with specified ID:', err);
      return false;
    }
  }

  /**
   * Search for artifacts by query
   * @param query The search query
   * @param userId Optional user ID to limit search to a specific user
   * @returns Array of artifacts matching the search query
   */
  static async searchArtifacts(
    query: string,
    userId?: string
  ): Promise<{id: string, title: string, preview: string}[]> {
    if (!query.trim()) {
      return [];
    }

    try {
      // Build the query
      let supabaseQuery = supabase
        .from('artifacts')
        .select('artifact_id, title, content, user_id')
        .order('updated_at', { ascending: false })
        .limit(10);
      
      // Filter by user ID if provided
      if (userId) {
        supabaseQuery = supabaseQuery.eq('user_id', userId);
      }
      
      // Add search condition - search only in title
      supabaseQuery = supabaseQuery.ilike('title', `%${query}%`);
      
      const { data, error } = await supabaseQuery;
      
      if (error) {
        console.error('Error searching artifacts:', error);
        return [];
      }
      
      if (!data || data.length === 0) {
        return [];
      }
      
      // Process results to extract preview text from content
      return data.map(artifact => {
        let preview = '';
        
        // Try to extract some text from the content for preview
        if (artifact.content && Array.isArray(artifact.content)) {
          // Look for text content in the blocks
          for (const block of artifact.content) {
            if (block.content && Array.isArray(block.content)) {
              // Traverse content to find text
              for (const item of block.content) {
                if (item.type === 'text' && item.text) {
                  preview = item.text;
                  break;
                }
              }
            }
            
            if (preview) break; // Stop once we have a preview
          }
        }
        
        return {
          id: artifact.artifact_id,
          title: artifact.title || 'Untitled Artifact',
          preview: preview.slice(0, 100) + (preview.length > 100 ? '...' : '') || 'No preview available'
        };
      });
    } catch (error) {
      console.error('Error in searchArtifacts:', error);
      return [];
    }
  }

  /**
   * Get the 5 most recently updated artifacts for a user.
   * @param userId The user ID
   * @returns Array of the 5 most recent artifacts
   */
  static async getRecentArtifacts(
    userId: string
  ): Promise<{id: string, title: string, preview: string}[]> {
    if (!userId) {
      console.warn('ArtifactService.getRecentArtifacts: No userId provided');
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('artifacts')
        .select('artifact_id, title, content') // Select necessary fields
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(5); // Limit to 5 results

      if (error) {
        console.error('Error fetching recent artifacts:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Process results to extract preview text (similar to searchArtifacts)
      return data.map(artifact => {
        let preview = '';
        if (artifact.content && Array.isArray(artifact.content)) {
          for (const block of artifact.content) {
            if (block.content && Array.isArray(block.content)) {
              for (const item of block.content) {
                if (item.type === 'text' && item.text) {
                  preview = item.text;
                  break;
                }
              }
            }
            if (preview) break;
          }
        }
        return {
          id: artifact.artifact_id,
          title: artifact.title || 'Untitled Artifact',
          preview: preview.slice(0, 100) + (preview.length > 100 ? '...' : '') || 'No preview available'
        };
      });
    } catch (error) {
      console.error('Error in getRecentArtifacts:', error);
      return [];
    }
  }

  /**
   * Move an artifact to a different folder (or unfile it).
   * @param artifactId The ID of the artifact to move
   * @param newFolderId The ID of the target folder, or null to unfile (move to root)
   * @param userId The user ID (for verification)
   * @returns The updated artifact object
   * @throws Error if move fails, artifact/folder not found, or access denied
   */
   static async moveArtifact(artifactId: string, newFolderId: string | null, userId: string): Promise<Artifact> {
       if (!artifactId || !userId) {
           throw new Error('Artifact ID and User ID are required to move an artifact.');
       }

       console.log(`ArtifactService.moveArtifact: Attempting move ${artifactId} for user ${userId} -> folder ${newFolderId || 'root'}`);

       // 1. Verify the artifact exists and belongs to the user
       const { data: artifactToMove, error: artifactError } = await supabase
           .from('artifacts')
           .select('artifact_id, folder_id') // Select current folder_id
           .eq('artifact_id', artifactId)
           .eq('user_id', userId)
           .single();

       if (artifactError || !artifactToMove) {
            console.error(`ArtifactService.moveArtifact: Error finding artifact ${artifactId} or access denied`, artifactError);
            throw new Error('Artifact to move not found or access denied.');
       }

       // If already in the target folder, do nothing
       if (artifactToMove.folder_id === newFolderId || (!artifactToMove.folder_id && !newFolderId)) {
           console.log(`ArtifactService.moveArtifact: Artifact ${artifactId} is already in folder ${newFolderId || 'root'}.`);
            const currentArtifact = await this.getArtifact(artifactId); // Re-fetch full data
            if (!currentArtifact) throw new Error('Failed to retrieve artifact data after no-op move.');
            return currentArtifact;
       }

       // 2. Verify the target folder exists and belongs to the user (if not moving to root)
       if (newFolderId) {
           const { data: parentFolder, error: parentError } = await supabase
               .from('folders')
               .select('folder_id')
               .eq('folder_id', newFolderId)
               .eq('user_id', userId)
               .maybeSingle();
           if (parentError || !parentFolder) {
               console.error(`ArtifactService.moveArtifact: Error finding target folder ${newFolderId} or access denied`, parentError);
               throw new Error('Target folder not found or access denied.');
           }
       }

       // 3. Perform the update
       const { data, error: updateError } = await supabase
         .from('artifacts')
         .update({
           folder_id: newFolderId // Set the new folder_id
           // updated_at timestamp is likely already handled by artifact content updates,
           // but you could explicitly update it here too if moving should change it.
           // updated_at: new Date().toISOString()
         })
         .eq('artifact_id', artifactId)
         .eq('user_id', userId)
         .select('*') // Return the full updated artifact data
         .single();

       if (updateError) {
           console.error(`ArtifactService.moveArtifact: Error updating folder for artifact ${artifactId}:`, updateError);
           throw new Error(`Failed to move artifact: ${updateError.message}`);
       }
       if (!data) {
           // Should be caught by error but good practice
           throw new Error('Failed to retrieve artifact data after move.');
       }

       console.log(`ArtifactService.moveArtifact: Successfully moved artifact ${artifactId} to folder ${newFolderId || 'root'}`);
       // Map the updated DB data back to the Artifact interface format
       return {
            id: data.artifact_id,
            title: data.title,
            content: data.content || [],
            userId: data.user_id,
            folderId: data.folder_id, // Ensure mapping includes folderId
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at)
       };
   }
} 