'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Block } from "@blocknote/core";

// Define supported AI models
export type AIModelType = 
  | 'gpt-4o'
  | 'gpt-o3-mini' 
  | 'gemini-2.0-flash'
  | 'gemini-2.5-pro-preview-03-25';

// Define message type
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;  // Now stores either full URL (legacy) or path in format 'bucket/userId/path/filename'
  contentType?: 'text' | 'image' | 'text-with-image';  // Define content type
  model?: AIModelType;  // Model used for this message
  artifactId?: string;  // Associated artifact ID
  metadata?: any;  // Performance metrics and other metadata
  rawResponse?: any;  // Raw API response data
  created_at?: Date;  // Timestamp from database
}

// Define conversation type
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: AIModelType;
  createdAt: Date;
  updatedAt: Date;
}

// Define editor context type for intent analysis
export interface EditorContext {
  currentFile?: string;
  selection?: string;
  cursorPosition?: number;
  editorContent?: Block[];  // Full document content from the editor
  selectedBlockIds?: string[]; // IDs of any selected blocks
}

// Define AI context type
interface AIContextType {
  currentModel: AIModelType;
  setCurrentModel: (model: AIModelType) => void;
  isLoading: boolean;
  isLoadingConversations: boolean;  // Add loading state for conversations
  currentConversation: Conversation | null;
  conversationHistory: Conversation[];
  createNewConversation: (model?: AIModelType) => void;
  sendMessage: (content: string, imageDataUrl?: string | null, editorContext?: EditorContext) => Promise<void>;
  selectConversation: (id: string) => void;
  switchModel: (model: AIModelType) => void;
  loadUserConversations: () => Promise<void>;
}

// Create the AI context
const AIContext = createContext<AIContextType | undefined>(undefined);

// AI provider props
interface AIProviderProps {
  children: ReactNode;
}

// Create unique ID
const createId = () => Math.random().toString(36).substring(2, 9);

// AI provider component
export function AIProvider({ children }: AIProviderProps) {
  // State for API clients
  const [openaiClient, setOpenaiClient] = useState<any>(null);
  const [genaiClient, setGenaiClient] = useState<any>(null);
  
  const [currentModel, setCurrentModel] = useState<AIModelType>('gpt-4o');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Helper function to get AI response based on model type
  const getAIResponse = async (conversation: Conversation, content: string, imageDataUrl?: string | null): Promise<string> => {
    let aiResponse: string = '';
    const startTime = Date.now();
    let responseMetadata;
    let rawResponse;
    
    try {
      // Process based on model type
      if (conversation.model.startsWith('gpt')) {
        // Prepare messages including system prompt if needed
        const messages = await Promise.all(conversation.messages.map(async ({ role, content, imageUrl }) => {
          if (imageUrl && role === 'user') {
            // Handle images for vision models - get authenticated URL if needed
            let processedImageUrl = imageUrl;
            
            // Check if this is a path format that needs conversion
            if (imageUrl.includes('/') && !imageUrl.startsWith('http')) {
              try {
                const { ImageService } = await import('../lib/services/ImageService');
                processedImageUrl = await ImageService.getAuthenticatedUrl(imageUrl);
              } catch (error) {
                console.error('Error getting authenticated URL for vision model:', error);
                // Fall back to the original URL
                processedImageUrl = imageUrl;
              }
            }
            
            return {
              role,
              content: [
                { type: 'text', text: content },
                { type: 'image_url', image_url: { url: processedImageUrl } }
              ]
            };
          }
          return { role, content };
        }));
        
        // OpenAI API call
        const response = await openaiClient.chat.completions.create({
          model: conversation.model,
          messages,
          temperature: 0.7,
        });
        
        aiResponse = response.choices[0]?.message?.content || 'No response from AI';
        rawResponse = response;
        
        // Extract metadata for tracking
        const { processApiResponse } = await import('../lib/utils/responseNormalization');
        const result = processApiResponse(conversation.model, response, startTime);
        responseMetadata = result.metadata;
      } else {
        // Format messages for Gemini
        const history = conversation.messages
          .filter(msg => !msg.imageUrl) // Skip messages with images for non-multimodal Gemini models
          .map(({ role, content }) => ({
            role: role === 'assistant' ? 'model' : 'user',
            parts: [{ text: content }],
          }));
        
        // Ensure history starts with a user message for Gemini API
        // The Gemini API requires the first message to have role 'user'
        const validHistory = history.length > 0 && history[0].role === 'model' 
          ? history.slice(1) // Skip the first message if it's a model message
          : history;
        
        // For multimodal requests
        let parts = [];
        
        if (imageDataUrl) {
          // Add image to parts for multimodal models
          const imageData = imageDataUrl.split(',')[1]; // Remove the data URL prefix
          parts = [
            { text: content },
            { inlineData: { mimeType: 'image/jpeg', data: imageData } }
          ];
        } else {
          parts = [{ text: content }];
        }
        
        // Handle different Gemini models
        const geminiModel = conversation.model;
        const model = genaiClient.getGenerativeModel({
          model: geminiModel,
          generationConfig: {
            temperature: 0.7,
          }
        });
        
        // Choose appropriate call based on chat history
        let response;
        if (validHistory.length > 0) {
          // With history
          const chat = model.startChat({ history: validHistory });
          response = await chat.sendMessage(parts);
        } else {
          // Without history (first message)
          response = await model.generateContent(parts);
        }
        
        aiResponse = response.response.text();
        rawResponse = response;
        
        // Extract metadata for tracking
        const { processApiResponse } = await import('../lib/utils/responseNormalization');
        const result = processApiResponse(conversation.model, response, startTime);
        responseMetadata = result.metadata;
      }
    } catch (error) {
      console.error(`${conversation.model} API error:`, error);
      
      // Track error metadata
      const { processApiError } = await import('../lib/utils/responseNormalization');
      responseMetadata = processApiError(conversation.model, error, startTime);
      
      aiResponse = `Error: Failed to get response from the AI model. Please check your API keys and try again.`;
    }
    
    // If we're in a database context, store the metadata
    // This will be implemented when we integrate with Supabase
    if (responseMetadata) {
      // Store this metadata with the message when we save to database
      console.log('Response metadata:', responseMetadata);
    }
    
    return aiResponse;
  };

  // Initialize API clients
  useEffect(() => {
    // Initialize API clients on the client side only
    if (typeof window !== 'undefined') {
      try {
        const openai = new OpenAI({
          apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || 'dummy-key',
          dangerouslyAllowBrowser: true,
        });
        setOpenaiClient(openai);
        
        const genAI = new GoogleGenerativeAI(
          process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'dummy-key'
        );
        setGenaiClient(genAI);
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing API clients:', error);
      }
    }
  }, []);

  // Load user conversations from Supabase
  const loadUserConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      const { UserService } = await import('../lib/services/UserService');
      const { ConversationService } = await import('../lib/services/ConversationService');
      
      // Check if user is authenticated
      const currentUser = await UserService.getCurrentUser();
      if (!currentUser) {
        console.log('No authenticated user found, using in-memory conversations only.');
        setIsLoadingConversations(false);
        return;
      }
      
      // Get user conversations from database
      const conversations = await ConversationService.getUserConversations(currentUser.id);
      
      if (conversations && conversations.length > 0) {
        setConversationHistory(conversations);
        
        // If we have no active conversation, set the most recent one
        if (!currentConversation) {
          const mostRecent = conversations[0]; // They're sorted by updated_at desc
          setCurrentConversation(mostRecent);
          setCurrentModel(mostRecent.model);
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [currentConversation]);

  // Load user conversations on first load
  useEffect(() => {
    if (isInitialized) {
      loadUserConversations();
    }
  }, [isInitialized, loadUserConversations]);

  // Create a new conversation
  const createNewConversation = async (model?: AIModelType) => {
    const newModel = model || currentModel;
    
    const newConversation: Conversation = {
      id: createId(),
      title: 'New Conversation',
      messages: [],
      model: newModel,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setConversationHistory(prev => [newConversation, ...prev]);
    setCurrentConversation(newConversation);
    
    try {
      // If user is authenticated, create conversation in database
      const { UserService } = await import('../lib/services/UserService');
      const { ConversationService } = await import('../lib/services/ConversationService');
      
      const currentUser = await UserService.getCurrentUser();
      if (currentUser) {
        // Create in database and update local ID
        const conversationId = await ConversationService.createConversation(
          currentUser.id,
          newConversation.title
        );
        
        // Update the ID in our local state
        newConversation.id = conversationId;
        setCurrentConversation({...newConversation});
        setConversationHistory(prev => 
          prev.map(conv => 
            conv.id === newConversation.id ? {...newConversation} : conv
          )
        );
      }
    } catch (error) {
      console.error('Error creating conversation in database:', error);
    }
  };

  // Send a message to the AI
  const sendMessage = async (
    content: string, 
    imageDataUrl?: string | null,
    editorContext?: EditorContext
  ) => {
    // Check if API clients 
    if (!openaiClient || !genaiClient) {
      console.error('API clients not initialized yet');
      return;
    }

    // Get database services
    const [UserService, MessageService, IntentAgentService, CreatorAgentService] = await Promise.all([
      import('../lib/services/UserService').then(mod => mod.UserService),
      import('../lib/services/MessageService').then(mod => mod.MessageService),
      import('../lib/services/IntentAgentService').then(mod => mod.IntentAgentService),
      import('../lib/services/CreatorAgentService').then(mod => mod.CreatorAgentService)
    ]);
    
    // Get current user
    const currentUser = await UserService.getCurrentUser();
    const userId = currentUser?.id;

    // Create a new conversation if one doesn't exist
    if (!currentConversation) {
      try {
        await createNewConversation();
        
        // Since createNewConversation is async and updates state,
        // we need to wait for the next render cycle
        setTimeout(() => {
          if (currentConversation) {
            sendMessage(content, imageDataUrl, editorContext);
          }
        }, 100);
        
        return;
      } catch (error) {
        console.error('Error in conversation creation:', error);
        return;
      }
    }
    
    // Add user message to existing conversation
    const userMessage: Message = imageDataUrl 
      ? { 
          role: 'user', 
          content, 
          imageUrl: imageDataUrl,
          contentType: content.trim() ? 'text-with-image' : 'image',
          model: currentConversation.model
        }
      : { role: 'user', content, contentType: 'text', model: currentConversation.model };
      
    const updatedConversation = {
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage],
      updatedAt: new Date(),
    };
    
    // Update state with user message
    setCurrentConversation(updatedConversation);
    setConversationHistory(prev => 
      prev.map(conv => conv.id === updatedConversation.id ? updatedConversation : conv)
    );
    
    setIsLoading(true);
    
    // Save user message to database if authenticated
    let userMessageId: string | undefined;
    if (userId) {
      try {
        userMessageId = await MessageService.createMessage(
          currentConversation.id,
          userMessage,
          userId
        );
      } catch (error) {
        console.error('Error saving user message:', error);
      }
    }
    
    try {
      // Track response timing
      const startTime = Date.now();
      
      // Analyze user intent first to determine if this should go to editor
      console.log('Analyzing user intent...');
      const intentAnalysis = await IntentAgentService.analyzeIntent(content, editorContext);
      console.log('Intent analysis result:', intentAnalysis);
      
      // Get AI response via the creator agent
      console.log('Processing request with creator agent...');
      const creatorResponse = await CreatorAgentService.processRequest(
        content,
        intentAnalysis,
        updatedConversation.messages.slice(-5), // Pass the last 5 messages for context
        editorContext?.editorContent // Pass editor content if available
      );
      console.log('Creator agent response:', creatorResponse);
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Add AI response to conversation
      const assistantMessage: Message = { 
        role: 'assistant', 
        content: creatorResponse.chatContent, // Use chat content from creator
        contentType: 'text',
        model: currentConversation.model,
        metadata: {
          response_time_ms: responseTime,
          intent_analysis: intentAnalysis, // Include intent analysis in metadata
          has_editor_content: !!creatorResponse.editorContent // Flag if there's editor content
        }
      };
      
      const finalConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, assistantMessage],
        updatedAt: new Date(),
      };
      
      // Update title if this is the first exchange
      if (finalConversation.messages.length === 2 && finalConversation.title === 'New Conversation') {
        finalConversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '') || 'Image Conversation';
        
        // Update title in database
        if (userId) {
          try {
            const { ConversationService } = await import('../lib/services/ConversationService');
            await ConversationService.updateConversationTitle(
              currentConversation.id,
              finalConversation.title
            );
          } catch (error) {
            console.error('Error updating conversation title:', error);
          }
        }
      }
      
      // Update state with assistant response
      setCurrentConversation(finalConversation);
      setConversationHistory(prev => 
        prev.map(conv => conv.id === finalConversation.id ? finalConversation : conv)
      );
      
      // Save assistant message to database if authenticated
      if (userId) {
        try {
          const assistantMessageId = await MessageService.createMessage(
            currentConversation.id,
            assistantMessage,
            userId
          );
        } catch (error) {
          console.error('Error saving assistant message:', error);
        }
      }
      
      // Handle routing based on intent analysis and creator agent response
      if (intentAnalysis.destination === 'EDITOR' && creatorResponse.editorContent) {
        // This is where we dispatch an event or call a function to update the editor
        console.log('EDITOR DESTINATION DETECTED: AI output will go to the editor');
        console.log('Editor metadata:', intentAnalysis.metadata);
        console.log('Editor content blocks:', creatorResponse.editorContent.length);
        
        // Determine operation type based on context
        let operationType = 'REPLACE'; // Default operation
        
        if (editorContext?.editorContent && editorContext.editorContent.length > 0) {
          // If we had existing content, this is likely a modification
          // The specific type of operation could be inferred from intent or metadata
          operationType = intentAnalysis.metadata?.editorAction || 'MODIFY';
        } else {
          // If there was no existing content, this is a creation operation
          operationType = 'CREATE';
        }
        
        // Emit a custom event that the editor component can listen for
        const editorUpdateEvent = new CustomEvent('editor:update', {
          detail: {
            blocks: creatorResponse.editorContent,
            metadata: intentAnalysis.metadata,
            operation: operationType,
            userInput: content, // Include the user's original request for context
            hadPriorContent: !!(editorContext?.editorContent && editorContext.editorContent.length > 0)
          }
        });
        window.dispatchEvent(editorUpdateEvent);
      } else {
        console.log('CONVERSATION DESTINATION DETECTED: AI output staying in conversation pane');
        // Normal conversation flow continues as is
      }
      
    } catch (error) {
      console.error('Error in sendMessage:', error);
      
      // Add error message to conversation
      const errorMessage: Message = { 
        role: 'assistant', 
        content: `Error: Could not get a response from the AI model. Please check your API keys and try again.`,
        contentType: 'text',
        model: currentConversation.model
      };
      
      const errorConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, errorMessage],
        updatedAt: new Date(),
      };
      
      setCurrentConversation(errorConversation);
      setConversationHistory(prev => 
        prev.map(conv => conv.id === errorConversation.id ? errorConversation : conv)
      );
      
      // Save error message to database if authenticated
      if (userId) {
        try {
          const { MessageService } = await import('../lib/services/MessageService');
          const errorMessageId = await MessageService.createMessage(
            currentConversation.id,
            errorMessage,
            userId
          );
        } catch (dbError) {
          console.error('Error saving error message:', dbError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Select a conversation from history
  const selectConversation = async (id: string) => {
    const conversation = conversationHistory.find(conv => conv.id === id);
    if (conversation) {
      setCurrentConversation(conversation);
      setCurrentModel(conversation.model);
    }
  };

  // Switch model for the current conversation
  const switchModel = async (model: AIModelType) => {
    setCurrentModel(model);
    
    // Update the current conversation's model if one exists
    if (currentConversation) {
      const updatedConversation = {
        ...currentConversation,
        model: model,
        updatedAt: new Date()
      };
      
      setCurrentConversation(updatedConversation);
      setConversationHistory(prev => 
        prev.map(conv => conv.id === currentConversation.id ? updatedConversation : conv)
      );
    }
  };

  return (
    <AIContext.Provider 
      value={{
        currentModel,
        setCurrentModel,
        isLoading,
        isLoadingConversations,
        currentConversation,
        conversationHistory,
        createNewConversation,
        sendMessage,
        selectConversation,
        switchModel,
        loadUserConversations
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

// Custom hook to use AI context
export function useAI() {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
} 