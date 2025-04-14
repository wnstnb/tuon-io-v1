import { supabase } from '../supabase';

/**
 * Service for handling image uploads and processing
 */
export class ImageService {
  /**
   * Convert a data URL to a file
   * @param dataUrl The data URL string
   * @param filename Optional filename
   * @returns File object
   */
  static dataURLtoFile(dataUrl: string, filename = 'image.jpg'): File {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const extension = mime.split('/')[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    // Use the mime type to determine a better extension if possible
    const finalFilename = filename.includes('.')
      ? filename
      : `${filename}.${extension}`;
      
    return new File([u8arr], finalFilename, { type: mime });
  }

  /**
   * Upload an image to Supabase Storage
   * @param userId User ID
   * @param file File to upload
   * @param bucket Bucket name ('conversation-images' or 'artifact-images')
   * @param path Optional additional path components
   * @returns URL of the uploaded image
   */
  static async uploadImage(
    userId: string,
    file: File | string,
    bucket: 'conversation-images' | 'artifact-images',
    path = ''
  ): Promise<string> {
    // Convert data URL to file if string is provided
    const imageFile = typeof file === 'string' 
      ? this.dataURLtoFile(file) 
      : file;
    
    // Generate a unique filename
    const timestamp = new Date().getTime();
    const fileExtension = imageFile.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
    
    // Build the full path
    const fullPath = path 
      ? `${userId}/${path}/${filename}` 
      : `${userId}/${filename}`;

    // Upload the file
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .upload(fullPath, imageFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading image:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    // Just return the bucket and path, not the full URL
    // This will be used later to create authenticated URLs
    return `${bucket}/${fullPath}`;
  }

  /**
   * Get authenticated URL for an image
   * @param storedPath The stored path in format 'bucket/path'
   * @param useEdgeFunction Whether to use the edge function instead of direct authenticated URL
   * @returns Authenticated URL with expiration
   */
  static async getAuthenticatedUrl(storedPath: string, useEdgeFunction = false): Promise<string> {
    try {
      console.log('Getting authenticated URL for path:', storedPath);

      // If edge function is enabled, use it instead
      if (useEdgeFunction) {
        // NOTE: Keep edge function logic if it's intended to be used elsewhere,
        // but for direct editor display, signed URLs are preferred over authenticated URLs.
        return this.getEdgeFunctionImageUrl(storedPath);
      }

      // Extract bucket and path from storedPath
      const [bucket, ...pathParts] = storedPath.split('/');
      const path = pathParts.join('/');

      console.log('Extracted bucket:', bucket, 'and path:', path);

      // ** ALWAYS Use createSignedUrl for reliable display in <img> tags **
      const expiresIn = 3600; // 1 hour expiration
      console.log(`Creating signed URL with expiration: ${expiresIn} seconds`);

      const { data, error } = await supabase
        .storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error || !data) {
        throw new Error(`Failed to create signed URL: ${error?.message || 'No data returned'}`);
      }

      console.log('Created signed URL:', data.signedUrl);
      return data.signedUrl;

      // --- REMOVE THE OLD AUTHENTICATED URL LOGIC ---
      /*
      // Use the authenticated endpoint instead of signed URLs
      // This will require the user's session token for access
      const projectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID ||
                      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1] || '';

      if (!projectId) {
        throw new Error('Could not determine Supabase project ID');
      }

      console.log('Using project ID:', projectId);

      // Get the auth token if available
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        console.warn('No authentication token available, using signed URL as fallback');
        // Fall back to signed URL if no token is available
        const { data, error } = await supabase
          .storage
          .from(bucket)
          .createSignedUrl(path, 3600);

        if (error || !data) {
          throw new Error(`Failed to create signed URL: ${error?.message || 'No data returned'}`);
        }

        console.log('Created signed URL:', data.signedUrl);
        return data.signedUrl;
      }

      // Format the authenticated URL
      const authenticatedUrl = `https://${projectId}.supabase.co/storage/v1/object/authenticated/${bucket}/${path}`;
      console.log('Created authenticated URL:', authenticatedUrl);
      return authenticatedUrl;
      */
      // --- END OF REMOVED LOGIC ---

    } catch (error) {
      console.error('Error creating authenticated/signed URL:', error);
      throw error;
    }
  }

  /**
   * Get URL for image served via Edge Function
   * @param storedPath The stored path in format 'bucket/path'
   * @returns URL to the edge function that will serve the image
   */
  static async getEdgeFunctionImageUrl(storedPath: string): Promise<string> {
    try {
      console.log('Getting edge function URL for path:', storedPath);
      
      // Get the Supabase project URL
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined');
      }
      
      // Encode the path to be used as a query parameter
      const encodedPath = encodeURIComponent(storedPath);
      
      // Format the edge function URL
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/serve-image-from-s3?path=${encodedPath}`;
      console.log('Created edge function URL:', edgeFunctionUrl);
      
      return edgeFunctionUrl;
    } catch (error) {
      console.error('Error creating edge function URL:', error);
      throw error;
    }
  }

  /**
   * Create a temporary public signed URL for an image.
   * NOTE: Ensure the bucket ('conversation-images', 'artifact-images') has appropriate RLS policies
   * allowing signed URL access if needed, or is configured for public access via signed URLs.
   * 
   * @param storedPath The stored path in format 'bucket/path'
   * @param expiresInSeconds The number of seconds the URL should be valid for (e.g., 60)
   * @returns Publicly accessible signed URL with expiration
   */
  static async createSignedPublicUrl(storedPath: string, expiresInSeconds = 60): Promise<string> {
    try {
      console.log(`Creating signed public URL for path: ${storedPath}, expires in: ${expiresInSeconds}s`);
      
      // Extract bucket and path from storedPath
      const [bucket, ...pathParts] = storedPath.split('/');
      const path = pathParts.join('/');
      
      if (!bucket || !path) {
          throw new Error('Invalid storedPath format. Expected "bucket/path".');
      }

      // Create the signed URL
      const { data, error } = await supabase
        .storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      
      if (error || !data) {
        throw new Error(`Failed to create signed URL: ${error?.message || 'No data returned'}`);
      }
      
      console.log('Created signed public URL:', data.signedUrl);
      return data.signedUrl;

    } catch (error) {
      console.error('Error creating signed public URL:', error);
      throw error;
    }
  }

  /**
   * Upload a conversation image
   * @param userId User ID
   * @param conversationId Conversation ID
   * @param image Image file or data URL
   * @returns Storage path of the uploaded image (e.g., bucket/userId/conversationId/filename.jpg)
   */
  static async uploadConversationImage(
    userId: string,
    conversationId: string,
    image: File | string
  ): Promise<string> {
    return this.uploadImage(userId, image, 'conversation-images', conversationId);
  }

  /**
   * Upload an artifact image
   * @param userId User ID
   * @param artifactId Artifact ID
   * @param image Image file or data URL
   * @returns Public URL of the uploaded image
   */
  static async uploadArtifactImage(
    userId: string,
    artifactId: string,
    image: File | string
  ): Promise<string> {
    return this.uploadImage(userId, image, 'artifact-images', artifactId);
  }

  /**
   * Upload an artifact view image
   * @param userId User ID
   * @param artifactId Artifact ID
   * @param image Image file or data URL
   * @returns Storage path of the uploaded image
   */
  static async uploadArtifactViewImage(
    userId: string,
    artifactId: string,
    image: File | string
  ): Promise<string> {
    return this.uploadImage(userId, image, 'artifact-images', `${artifactId}/views`);
  }

  /**
   * Delete an image from storage
   * @param bucket The bucket name
   * @param path The path of the image to delete
   * @returns Success status
   */
  static async deleteImage(
    bucket: 'conversation-images' | 'artifact-images',
    path: string
  ): Promise<boolean> {
    const { error } = await supabase
      .storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error('Error deleting image:', error);
      return false;
    }

    return true;
  }
} 