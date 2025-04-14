import { supabase } from '../supabase';
import { Message, AIModelType } from '../../context/AIContext';
import { ImageService } from './ImageService';

export interface DBMessage {
  message_id: string;
  conversation_id: string;
  artifact_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  content_type: 'text' | 'image' | 'text-with-image';
  image_url?: string;
  metadata?: any;
  raw_response?: any;
  metadata_version?: string;
  created_at: string;
}

/**
 * Service for handling message operations
 */
export class MessageService {
  /**
   * Create a new message
   * @param conversationId The conversation ID
   * @param message The message object
   * @param userId The user ID (REMOVED - no longer needed here for upload)
   * @returns The created message ID
   */
  static async createMessage(
    conversationId: string,
    message: Omit<Message, 'id'>,
    userId?: string // Kept for potential future use, but upload logic removed
  ): Promise<string> {
    // REMOVED: Redundant image upload logic
    // The imageUrl provided in the 'message' object should already be the correct
    // storage path from the upload performed in AIContext.sendMessage.
    /*
    let imageUrl = message.imageUrl;
    if (message.imageUrl && userId) {
      try {
        imageUrl = await ImageService.uploadConversationImage(
          userId,
          conversationId,
          message.imageUrl
        );
      } catch (error) {
        console.error('Error uploading image for message:', error);
        // Decide how to handle this error - maybe throw it?
        // For now, it might proceed without the correct URL if upload fails here.
      }
    }
    */
    
    // Prepare the message data using the imageUrl directly from the input message object
    const messageData = {
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      model: message.model,
      content_type: message.contentType || 'text',
      image_url: message.imageUrl, // Use the path directly from the input
      artifact_id: message.artifactId,
      metadata: message.metadata || {},
      raw_response: message.rawResponse,
      metadata_version: message.metadata ? '1.0' : undefined
    };
    
    // Insert the message
    const { data, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select('message_id')
      .single();

    if (error) {
      console.error('Error creating message:', error);
      throw new Error(`Failed to create message: ${error.message}`);
    }

    return data.message_id;
  }

  /**
   * Get all messages for a conversation
   * @param conversationId The conversation ID
   * @returns Array of messages
   */
  static async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Convert from DB format to app format
    return data.map((msg: DBMessage) => ({
      role: msg.role,
      content: msg.content,
      contentType: msg.content_type,
      imageUrl: msg.image_url,
      model: msg.model as AIModelType | undefined,
      artifactId: msg.artifact_id,
      metadata: msg.metadata,
      rawResponse: msg.raw_response,
      created_at: new Date(msg.created_at)
    }));
  }

  /**
   * Get messages associated with an artifact
   * @param artifactId The artifact ID
   * @returns Array of messages
   */
  static async getMessagesByArtifactId(artifactId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('artifact_id', artifactId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching artifact messages:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Convert from DB format to app format
    return data.map((msg: DBMessage) => ({
      role: msg.role,
      content: msg.content,
      contentType: msg.content_type,
      imageUrl: msg.image_url,
      model: msg.model as AIModelType | undefined,
      artifactId: msg.artifact_id,
      metadata: msg.metadata,
      rawResponse: msg.raw_response,
      created_at: new Date(msg.created_at)
    }));
  }
  
  /**
   * Associate a message with an artifact
   * @param messageId The message ID
   * @param artifactId The artifact ID
   * @returns Success status
   */
  static async associateMessageWithArtifact(
    messageId: string,
    artifactId: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('messages')
      .update({ artifact_id: artifactId })
      .eq('message_id', messageId);

    if (error) {
      console.error('Error associating message with artifact:', error);
      return false;
    }

    return true;
  }

  /**
   * Store API response metadata
   * @param messageId The message ID
   * @param metadata The metadata object
   * @param rawResponse The raw API response
   * @returns Success status
   */
  static async storeResponseMetadata(
    messageId: string,
    metadata: any,
    rawResponse?: any
  ): Promise<boolean> {
    const updateData: any = {
      metadata: metadata,
      metadata_version: '1.0'
    };
    
    if (rawResponse) {
      updateData.raw_response = rawResponse;
    }
    
    const { error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('message_id', messageId);

    if (error) {
      console.error('Error storing response metadata:', error);
      return false;
    }

    return true;
  }
} 