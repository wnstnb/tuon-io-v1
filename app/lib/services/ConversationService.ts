import { supabase } from '../supabase';
import { Conversation, Message } from '../../context/AIContext';
import { MessageService } from './MessageService';

export interface DBConversation {
  conversation_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  artifact_id?: string | null;
}

/**
 * Service for handling conversation operations
 */
export class ConversationService {
  /**
   * Create a new conversation
   * @param userId The user ID
   * @param title The conversation title
   * @param artifactId Optional ID of the artifact linked to this conversation
   * @param conversationId Optional ID of the conversation
   * @returns The new conversation ID
   */
  static async createConversation(
    userId: string,
    title: string,
    artifactId?: string,
    conversationId?: string
  ): Promise<string> {
    // Generate ID if not provided
    const idToInsert = conversationId || crypto.randomUUID();

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        conversation_id: idToInsert,
        user_id: userId,
        title: title || 'New Conversation',
        artifact_id: artifactId
      })
      .select('conversation_id')
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    return idToInsert;
  }

  /**
   * Get a conversation by ID
   * @param conversationId The conversation ID
   * @returns The conversation data with messages
   */
  static async getConversation(
    conversationId: string
  ): Promise<Conversation | null> {
    // Get the conversation details
    const { data: conversationData, error: conversationError } = await supabase
      .from('conversations')
      .select('*')
      .eq('conversation_id', conversationId)
      .single();

    if (conversationError) {
      console.error('Error fetching conversation:', conversationError);
      return null;
    }

    if (!conversationData) {
      return null;
    }

    // Get all messages for this conversation
    const messages = await MessageService.getMessagesByConversationId(conversationId);

    // Convert from DB format to app format
    return {
      id: conversationData.conversation_id,
      title: conversationData.title,
      messages: messages,
      model: messages.length > 0 && messages[0].model 
        ? messages[0].model 
        : 'gpt-4o', // Default model if no messages
      createdAt: new Date(conversationData.created_at),
      updatedAt: new Date(conversationData.updated_at)
    };
  }

  /**
   * Get all conversations for a user (Metadata ONLY)
   * @param userId The user ID
   * @returns Array of conversations without messages
   */
  static async getUserConversations(userId: string): Promise<Omit<Conversation, 'messages'>[]> {
    // Get all conversations for this user
    const { data: conversationsData, error: conversationsError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (conversationsError) {
      console.error('Error fetching conversations:', conversationsError);
      return [];
    }

    if (!conversationsData || conversationsData.length === 0) {
      return [];
    }

    // Convert DB data to Conversation objects (without messages)
    return conversationsData.map(conv => ({
      id: conv.conversation_id,
      title: conv.title,
      // messages: [], // REMOVED: Do not include messages here
      model: 'gpt-4o', // Default model, consider fetching last used model if needed
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at),
      artifactId: conv.artifact_id || undefined
    }));

    /* REMOVED EAGER LOADING BLOCK
    // Process each conversation to include messages
    const conversations: Conversation[] = [];
    
    for (const conv of conversationsData) {
      const messages = await MessageService.getMessagesByConversationId(conv.conversation_id);
      
      conversations.push({
        id: conv.conversation_id,
        title: conv.title,
        messages: messages,
        model: messages.length > 0 && messages[0].model 
          ? messages[0].model 
          : 'gpt-4o',
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at)
      });
    }

    return conversations;
    */
  }

  /**
   * Update a conversation's title
   * @param conversationId The conversation ID
   * @param title The new title
   * @returns Success status
   */
  static async updateConversationTitle(
    conversationId: string,
    title: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('Error updating conversation title:', error);
      return false;
    }

    return true;
  }

  /**
   * Updates the updated_at timestamp for a conversation
   * @param conversationId The conversation ID
   * @returns Success status
   */
  static async updateConversationTimestamp(conversationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('Error updating conversation timestamp:', error);
      return false;
    }

    return true;
  }

  /**
   * Delete a conversation and its messages
   * @param conversationId The conversation ID
   * @returns Success status
   */
  static async deleteConversation(conversationId: string): Promise<boolean> {
    // Messages will be automatically deleted due to CASCADE constraint
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }

    return true;
  }
} 