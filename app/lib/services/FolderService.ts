// Path: app/lib/services/FolderService.ts

import { supabase } from '../supabase';
import { ArtifactService } from './ArtifactService'; // Needed for checking artifacts in folder

// Custom error for folder operations
export class FolderOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FolderOperationError';
    Object.setPrototypeOf(this, FolderOperationError.prototype);
  }
}

// Interface for Folder data used within the application
export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null; // Changed from parent_folder_id for consistency
  createdAt: Date;
  updatedAt: Date;
}

// Interface matching the database schema for folders
export interface DBFolder {
  folder_id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Service for handling folder operations related to artifacts
 */
export class FolderService {
  /**
   * Create a new folder for a user
   * @param userId The user ID
   * @param name The folder name
   * @param parentId Optional ID of the parent folder for nesting
   * @returns The created folder object
   * @throws FolderOperationError if creation fails or parent doesn't exist/belong to user
   */
  static async createFolder(userId: string, name: string, parentId?: string | null): Promise<Folder> {
    if (!userId || !name?.trim()) {
      console.error('FolderService.createFolder: Missing userId or name');
      throw new FolderOperationError('User ID and folder name are required.');
    }

    const trimmedName = name.trim();
    console.log(`FolderService.createFolder: Creating folder "${trimmedName}" for user ${userId}` + (parentId ? ` inside folder ${parentId}` : ' at root level'));

    // If parentId is provided, verify it exists and belongs to the user
    if (parentId) {
      const { data: parentFolder, error: parentError } = await supabase
        .from('folders')
        .select('folder_id')
        .eq('folder_id', parentId)
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle to differentiate not found from other errors

      if (parentError) {
        console.error(`FolderService.createFolder: Error verifying parent folder ${parentId}`, parentError);
        throw new FolderOperationError(`Failed to verify parent folder: ${parentError.message}`);
      }
      if (!parentFolder) {
        console.error(`FolderService.createFolder: Parent folder ${parentId} not found or not owned by user ${userId}`);
        throw new FolderOperationError('Parent folder not found or access denied.');
      }
    }

    const { data, error } = await supabase
      .from('folders')
      .insert({
        user_id: userId,
        name: trimmedName,
        parent_folder_id: parentId || null // Use null if parentId is undefined or null
      })
      .select('*') // Select all columns of the new folder
      .single();

    if (error) {
      console.error(`FolderService.createFolder: Error creating folder "${trimmedName}"`, error);
      // TODO: Check for specific errors like duplicate name within the same parent?
      throw new FolderOperationError(`Failed to create folder: ${error.message}`);
    }

    if (!data) {
        console.error(`FolderService.createFolder: Folder created but no data returned for "${trimmedName}"`);
        throw new FolderOperationError('Folder created but failed to retrieve its data.');
    }

    console.log(`FolderService.createFolder: Successfully created folder with ID: ${data.folder_id}`);
    return this.mapDbToFolder(data); // Return the full folder object
  }

  /**
   * Get a specific folder by its ID
   * @param folderId The folder ID
   * @param userId The user ID (for RLS)
   * @returns The folder data or null if not found/accessible
   */
  static async getFolder(folderId: string, userId: string): Promise<Folder | null> {
    if (!folderId || !userId) {
      console.warn('FolderService.getFolder: Missing folderId or userId');
      return null;
    }

    // console.log(`FolderService.getFolder: Fetching folder ${folderId} for user ${userId}`);

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('folder_id', folderId)
      .eq('user_id', userId) // RLS should handle this, but explicit check is safer
      .single();

    if (error) {
      // @ts-ignore Supabase error type might not be perfectly typed here
      if (error.code !== 'PGRST116') { // Don't log 'not found' as an error
        console.error(`FolderService.getFolder: Error fetching folder ${folderId}:`, error);
      }
      return null;
    }

    if (!data) {
      return null;
    }

    // console.log(`FolderService.getFolder: Successfully fetched folder ${data.folder_id}`);
    return this.mapDbToFolder(data);
  }

  /**
   * Get all folders for a specific user (flat list)
   * @param userId The user ID
   * @returns Array of all folders owned by the user, ordered by name
   */
  static async getUserFolders(userId: string): Promise<Folder[]> {
    if (!userId) {
      console.warn('FolderService.getUserFolders: No user ID provided');
      return [];
    }

    // console.log(`FolderService.getUserFolders: Fetching all folders for user ${userId}`);

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }); // Order alphabetically by name

    if (error) {
      console.error(`FolderService.getUserFolders: Error fetching folders for user ${userId}:`, error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // console.log(`FolderService.getUserFolders: Found ${data.length} folders for user ${userId}`);
    return data.map(this.mapDbToFolder);
  }

  /**
   * Update a folder's name
   * @param folderId The ID of the folder to update
   * @param name The new name for the folder
   * @param userId The user ID (for verification)
   * @returns The updated folder object
   * @throws FolderOperationError if update fails or folder not found/owned by user
   */
  static async updateFolderName(folderId: string, name: string, userId: string): Promise<Folder> {
    if (!folderId || !name?.trim() || !userId) {
      console.error('FolderService.updateFolderName: Missing folderId, name, or userId');
      throw new FolderOperationError('Folder ID, new name, and user ID are required.');
    }

    const trimmedName = name.trim();
    console.log(`FolderService.updateFolderName: Updating folder ${folderId} for user ${userId} to name "${trimmedName}"`);

    const { data, error } = await supabase
      .from('folders')
      .update({
        name: trimmedName,
        // updated_at is handled by trigger now
      })
      .eq('folder_id', folderId)
      .eq('user_id', userId) // RLS handles this, but explicit check is safer
      .select('*') // Return the updated folder data
      .single(); // Expect exactly one row to be updated

    if (error) {
        console.error(`FolderService.updateFolderName: Error updating folder ${folderId}:`, error);
        // @ts-ignore
        if (error.code === 'PGRST116') { // Resource not found / RLS check failed
             throw new FolderOperationError('Folder not found or access denied.');
        }
        throw new FolderOperationError(`Failed to update folder name: ${error.message}`);
    }
     if (!data) {
        // This case should ideally be caught by the error above with .single()
        throw new FolderOperationError('Folder not found or access denied after update attempt.');
     }

    console.log(`FolderService.updateFolderName: Successfully updated folder ${folderId}`);
    return this.mapDbToFolder(data);
  }

  /**
   * Move a folder to a new parent (or to the root level).
   * Performs checks to prevent nesting a folder within itself or its descendants.
   * @param folderId The ID of the folder to move
   * @param newParentId The ID of the new parent folder, or null to move to root
   * @param userId The user ID (for verification)
   * @returns The updated folder object
   * @throws FolderOperationError if move fails, folder/parent not found/owned, or invalid move
   */
  static async moveFolder(folderId: string, newParentId: string | null, userId: string): Promise<Folder> {
    if (!folderId || !userId) {
        throw new FolderOperationError('Folder ID and User ID are required to move a folder.');
    }
    if (folderId === newParentId) {
        throw new FolderOperationError('Cannot move a folder into itself.');
    }

    console.log(`FolderService.moveFolder: Attempting move ${folderId} for user ${userId} -> ${newParentId || 'root'}`);

    // 1. Verify the folder to move exists and belongs to the user
    const { data: folderToMove, error: folderError } = await supabase
        .from('folders')
        .select('folder_id, parent_folder_id')
        .eq('folder_id', folderId)
        .eq('user_id', userId)
        .single();

    if (folderError || !folderToMove) {
         console.error(`FolderService.moveFolder: Error finding folder ${folderId} or access denied`, folderError);
         throw new FolderOperationError('Folder to move not found or access denied.');
    }
    // If already in the target location, do nothing
    if (folderToMove.parent_folder_id === newParentId || (!folderToMove.parent_folder_id && !newParentId)) {
        console.log(`FolderService.moveFolder: Folder ${folderId} is already in the target location.`);
        // Re-fetch the full folder data to return
        const currentFolder = await this.getFolder(folderId, userId);
        if (!currentFolder) throw new FolderOperationError('Failed to retrieve current folder data after no-op move.');
        return currentFolder;
    }

    // 2. Verify the target parent folder exists and belongs to the user (if not moving to root)
    if (newParentId) {
        const { data: parentFolder, error: parentError } = await supabase
            .from('folders')
            .select('folder_id')
            .eq('folder_id', newParentId)
            .eq('user_id', userId)
            .maybeSingle();
        if (parentError || !parentFolder) {
            console.error(`FolderService.moveFolder: Error finding target parent ${newParentId} or access denied`, parentError);
            throw new FolderOperationError('Target parent folder not found or access denied.');
        }

        // 3. Check for cyclical nesting: Cannot move a folder into its own descendant
        const descendantIds = await this.getDescendantFolderIds(folderId, userId);
        if (descendantIds.has(newParentId)) {
             console.error(`FolderService.moveFolder: Cannot move folder ${folderId} into its descendant ${newParentId}`);
             throw new FolderOperationError('Invalid move: Cannot move a folder into one of its own subfolders.');
        }
    }

    // 4. Perform the update
    const { data, error } = await supabase
      .from('folders')
      .update({
        parent_folder_id: newParentId // Set the new parent
        // updated_at is handled by trigger
      })
      .eq('folder_id', folderId)
      .eq('user_id', userId)
      .select('*') // Return the updated folder data
      .single();

    if (error) {
        console.error(`FolderService.moveFolder: Error updating parent for folder ${folderId}:`, error);
        throw new FolderOperationError(`Failed to move folder: ${error.message}`);
    }
    if (!data) {
        // Should be caught by error but good practice
        throw new FolderOperationError('Failed to retrieve folder data after move.');
    }

    console.log(`FolderService.moveFolder: Successfully moved folder ${folderId} to parent ${newParentId || 'root'}`);
    return this.mapDbToFolder(data);
  }


  /**
   * Delete a folder. Prevents deletion if the folder contains any subfolders or artifacts.
   * @param folderId The ID of the folder to delete
   * @param userId The user ID (for verification)
   * @returns Success status (boolean)
   * @throws FolderOperationError if deletion fails, folder not found/owned, or folder is not empty
   */
  static async deleteFolder(folderId: string, userId: string): Promise<boolean> {
    if (!folderId || !userId) {
      console.error('FolderService.deleteFolder: Missing folderId or userId');
      throw new FolderOperationError('Folder ID and user ID are required.');
    }

    console.log(`FolderService.deleteFolder: Attempting to delete folder ${folderId} for user ${userId}`);

    // 1. Verify folder exists and belongs to user (also needed for subsequent checks)
     const { data: folderData, error: fetchError } = await supabase
        .from('folders')
        .select('folder_id')
        .eq('folder_id', folderId)
        .eq('user_id', userId)
        .maybeSingle();

     if (fetchError) {
        console.error(`FolderService.deleteFolder: Error checking folder ${folderId} existence/ownership`, fetchError);
        throw new FolderOperationError(`Failed to verify folder: ${fetchError.message}`);
     }
     if (!folderData) {
         throw new FolderOperationError('Folder not found or access denied.');
     }

    // 2. Check for child folders
    const { count: subfolderCount, error: subfolderError } = await supabase
      .from('folders')
      .select('*', { count: 'exact', head: true })
      .eq('parent_folder_id', folderId)
      .eq('user_id', userId); // Ensure we only count user's subfolders

    if (subfolderError) {
       console.error(`FolderService.deleteFolder: Error checking subfolders in folder ${folderId}:`, subfolderError);
       throw new FolderOperationError(`Failed to check for subfolders: ${subfolderError.message}`);
    }
    if (subfolderCount && subfolderCount > 0) {
        console.warn(`FolderService.deleteFolder: Folder ${folderId} contains ${subfolderCount} subfolder(s). Deletion aborted.`);
        throw new FolderOperationError(`Folder is not empty. Cannot delete folder with subfolders.`);
    }

    // 3. Check for artifacts in the folder
    const { count: artifactCount, error: artifactError } = await supabase
        .from('artifacts')
        .select('*', { count: 'exact', head: true })
        .eq('folder_id', folderId)
        .eq('user_id', userId); // Check user_id on artifacts too for safety

     if (artifactError) {
       console.error(`FolderService.deleteFolder: Error checking artifacts in folder ${folderId}:`, artifactError);
       throw new FolderOperationError(`Failed to check for artifacts: ${artifactError.message}`);
     }
     if (artifactCount && artifactCount > 0) {
        console.warn(`FolderService.deleteFolder: Folder ${folderId} contains ${artifactCount} artifact(s). Deletion aborted.`);
        throw new FolderOperationError(`Folder is not empty. Cannot delete folder with artifacts.`);
     }

    // 4. Perform the deletion if checks pass
    const { error: deleteError } = await supabase
      .from('folders')
      .delete()
      .eq('folder_id', folderId)
      .eq('user_id', userId); // RLS handles this, explicit check safer

    if (deleteError) {
      console.error(`FolderService.deleteFolder: Error deleting folder ${folderId}:`, deleteError);
      throw new FolderOperationError(`Failed to delete folder: ${deleteError.message}`);
    }

    // Supabase delete doesn't error if the row wasn't found (due to RLS or already deleted)
    // The initial check ensures we only proceed if it exists and is owned.

    console.log(`FolderService.deleteFolder: Successfully deleted empty folder ${folderId}`);
    return true;
  }

  /**
   * Helper to recursively get all descendant folder IDs for a given folder.
   * Used to prevent cyclical nesting in moveFolder.
   * @param folderId The starting folder ID
   * @param userId The user ID
   * @returns A Set containing all descendant folder IDs
   */
  private static async getDescendantFolderIds(folderId: string, userId: string): Promise<Set<string>> {
    const descendantIds = new Set<string>();
    let foldersToCheck = [folderId];

    while (foldersToCheck.length > 0) {
        const currentBatch = foldersToCheck;
        foldersToCheck = []; // Prepare for next level

        const { data: children, error } = await supabase
            .from('folders')
            .select('folder_id')
            .in('parent_folder_id', currentBatch)
            .eq('user_id', userId);

        if (error) {
            console.error(`FolderService.getDescendantFolderIds: Error fetching children for batch`, error);
            // Depending on requirements, might throw an error or just return current results
            break;
        }

        if (children && children.length > 0) {
            for (const child of children) {
                if (!descendantIds.has(child.folder_id)) {
                    descendantIds.add(child.folder_id);
                    foldersToCheck.push(child.folder_id);
                }
            }
        }
    }
    return descendantIds;
  }


  /**
   * Helper to convert DB folder format to application format
   * @param dbFolder The folder object from Supabase
   * @returns The folder object in application format
   */
  private static mapDbToFolder(dbFolder: DBFolder): Folder {
    return {
      id: dbFolder.folder_id,
      userId: dbFolder.user_id,
      name: dbFolder.name,
      parentId: dbFolder.parent_folder_id, // Keep as parentId for app consistency
      createdAt: new Date(dbFolder.created_at),
      updatedAt: new Date(dbFolder.updated_at)
    };
  }
}