'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Block } from "@blocknote/core";
import { MessageService } from '../lib/services/MessageService';
import { ConversationService } from '../lib/services/ConversationService';
import { UserService } from '../lib/services/UserService';
import { CreatorAgentService } from '../lib/services/CreatorAgentService';
import { useSupabase } from '../context/SupabaseContext';

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

// Define search result interface
export interface SearchResult {
  title: string;
  url: string;
  text: string;
  score?: number;
}

// Define search history item interface
export interface SearchHistoryItem {
  id: string;
  query: string;
  results: SearchResult[];
  timestamp: Date;
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
  markdown?: string; // Add the optional markdown string representation
}

// Define search options type
export interface SearchOptions {
  isSearch: boolean;
  searchQuery: string;
}

// Define AI context type
interface AIContextType {
  currentModel: AIModelType;
  setCurrentModel: (model: AIModelType) => void;
  isLoading: boolean;
  isLoadingConversations: boolean;  // Add loading state for conversations
  currentConversation: Conversation | null;
  conversationHistory: Conversation[];
  searchHistory: SearchHistoryItem[];
  setSearchHistory: React.Dispatch<React.SetStateAction<SearchHistoryItem[]>>;
  createNewConversation: (model?: AIModelType) => void;
  sendMessage: (content: string, imageDataUrl?: string | null, editorContext?: EditorContext, searchOptions?: SearchOptions) => Promise<void>;
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
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const { user: currentUser } = useSupabase();

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
    editorContext?: EditorContext,
    searchOptions?: SearchOptions
  ) => {
    if (!currentConversation) return;
    
    let currentUser: { id: string } | null = null;
    try {
      currentUser = await UserService.getCurrentUser();
    } catch (error) {
      console.error('Error fetching current user:', error);
      // Optionally, handle the case where the user isn't available
    }
    
    try {
      setIsLoading(true);
      
      // Clone current conversation to avoid mutation issues
      const updatedConversation = { ...currentConversation };
      
      // Prepare user message object
      const userMessage: Message = {
        role: 'user',
        content,
        contentType: imageDataUrl ? 'text-with-image' : 'text',
        imageUrl: undefined, // Initialize as undefined, will be updated after upload
      };
      
      // Add user message to local state
      updatedConversation.messages = [
        ...updatedConversation.messages,
        userMessage
      ];
      
      // Handle image upload if provided
      if (imageDataUrl && currentUser) {
        // Import image service dynamically (already done below, potentially redundant)
        // const { ImageService } = await import('../lib/services/ImageService'); 
        try {
          // Upload the image and get the path/URL
          const { ImageService } = await import('../lib/services/ImageService'); // Keep dynamic import here
          const imagePath = await ImageService.uploadImage(
            currentUser.id,
            imageDataUrl, 
            'conversation-images',
            currentConversation.id 
          );
          console.log('Image uploaded successfully:', imagePath);
          
          // Update the user message object with the image URL/path
          userMessage.imageUrl = imagePath;
          // Ensure the message in the array also gets updated (might need if array was deeply cloned)
          updatedConversation.messages[updatedConversation.messages.length - 1].imageUrl = imagePath;
        } catch (error) {
          console.error('Error uploading image:', error);
          // Handle image upload failure if necessary (e.g., remove image data or show error)
        }
      } else if (imageDataUrl && !currentUser) {
        console.error('Cannot upload image: No authenticated user');
        // Handle case where image is provided but user is not logged in
      }

      // --- Save User Message to DB ---
      if (currentUser) {
        try {
          await MessageService.createMessage(
            currentConversation.id,
            userMessage, // Use the prepared userMessage object
            currentUser.id
          );
          // Update conversation timestamp
          await ConversationService.updateConversationTimestamp(currentConversation.id);
        } catch (error) {
          console.error('Error saving user message to database:', error);
        }
      }
      // ------------------------------
      
      // Update conversation in state (local UI update)
      setCurrentConversation(updatedConversation);
      updateConversationInHistory(updatedConversation);
      
      // Handle explicit search requests from /search command
      let searchResults: SearchResult[] = [];
      let explicitSearch = false;
      if (searchOptions?.isSearch && searchOptions?.searchQuery) {
        explicitSearch = true;
        // Call performSearch and get results
        searchResults = await performSearch(searchOptions.searchQuery);
        
        // Add search results to search history
        const searchItem: SearchHistoryItem = {
          id: createId(),
          query: searchOptions.searchQuery,
          results: searchResults,
          timestamp: new Date()
        };
        setSearchHistory(prev => [searchItem, ...prev]);
      }
      
      // Determine intent - this will tell us whether to send to editor or conversation
      let intentAnalysis;
      try {
        const { IntentAgentService } = await import('../lib/services/IntentAgentService');
        intentAnalysis = await IntentAgentService.analyzeIntent(content, editorContext);
        console.log('Intent analysis:', intentAnalysis);
        
        // Check if intent analysis indicates a need for web search (and we haven't already done one)
        if (!explicitSearch && intentAnalysis.needsWebSearch && intentAnalysis.searchQuery) {
          console.log('Auto-detecting search need:', intentAnalysis.searchQuery);
          
          // Perform the search
          searchResults = await performSearch(intentAnalysis.searchQuery);
          
          // Add search results to search history
          if (searchResults.length > 0) {
            const searchItem: SearchHistoryItem = {
              id: createId(),
              query: intentAnalysis.searchQuery,
              results: searchResults,
              timestamp: new Date()
            };
            setSearchHistory(prev => [searchItem, ...prev]);
          }
        }
      } catch (error) {
        console.error('Error analyzing intent:', error);
        intentAnalysis = {
          destination: 'CONVERSATION',
          confidence: 1.0,
          reasoning: 'Error in intent analysis, defaulting to conversation'
        };
      }
      
      // Generate AI response using creator agent
      try {
        // Get recent conversation history for context (limit to 10 messages)
        const conversationContext = updatedConversation.messages
          .slice(-10)
          .map(msg => ({
            role: msg.role,
            content: msg.content
          }));
          
        // If we have search results, add them to conversation context
        if (searchResults.length > 0) {
          const { SearchService } = await import('../lib/services/SearchService');
          const formattedResults = SearchService.formatResults(searchResults);
          
          // Add search results as a system message in conversation context
          conversationContext.push({
            role: 'system',
            content: `Search results for "${searchOptions?.searchQuery || intentAnalysis?.searchQuery}":\n\n${formattedResults}`
          });
          
          // If this was an auto-detected search (not explicit /search command),
          // add a message to inform the user that a search was performed
          if (!explicitSearch && intentAnalysis?.needsWebSearch) {
            // Prepare system message object
            const systemSearchMessage: Message = {
              role: 'system',
              content: `I performed a web search for "${intentAnalysis.searchQuery}" to help answer your question.`,
            };
            
            // Add a system message to let the user know we performed a search (local state)
            updatedConversation.messages.push(systemSearchMessage);
            
            // --- Save System Search Message to DB (Optional) ---
            if (currentUser) {
              try {
                await MessageService.createMessage(
                  currentConversation.id,
                  systemSearchMessage,
                  currentUser.id
                );
                // Update conversation timestamp
                await ConversationService.updateConversationTimestamp(currentConversation.id);
              } catch (error) {
                console.error('Error saving system search message to database:', error);
              }
            }
            // -----------------------------------------------------
            
            // Update conversation in state (local UI update)
            setCurrentConversation({...updatedConversation}); // Spread to ensure re-render
            updateConversationInHistory({...updatedConversation});
          }
        }
          
        // Process with creator agent
        console.log('AIContext: Calling CreatorAgentService.processRequest');
        console.log('AIContext: editorContext received:', editorContext);
        
        const creatorResponse = await CreatorAgentService.processRequest(
          content,
          intentAnalysis,
          conversationContext,
          editorContext?.markdown
        );
        
        console.log('AIContext: Received response from CreatorAgentService:', creatorResponse);
        
        // Prepare AI response message object
        const assistantMessage: Message = {
          role: 'assistant',
          content: creatorResponse.chatContent,
          model: currentModel // Use the current model from state
        };
        
        // Add AI response to conversation (local state)
        updatedConversation.messages.push(assistantMessage);
        
        // --- Save Assistant Message to DB ---
        if (currentUser) {
          try {
            await MessageService.createMessage(
              currentConversation.id,
              assistantMessage,
              currentUser.id
            );
            // Update conversation timestamp
            await ConversationService.updateConversationTimestamp(currentConversation.id);
          } catch (error) {
            console.error('Error saving assistant message to database:', error);
          }
        }
        // ----------------------------------
        
        // Update conversation in state again (local UI update)
        setCurrentConversation({...updatedConversation}); // Spread to ensure re-render
        updateConversationInHistory({...updatedConversation});
        
        // Check if this is the first message exchange and infer a title if it is
        if (updatedConversation.messages.length === 2 && updatedConversation.title === 'New Conversation') {
          try {
            // Combine user message and AI response for better title inference
            const userMessage = updatedConversation.messages[0].content;
            const aiResponse = updatedConversation.messages[1].content;
            const combinedContent = `User: ${userMessage}\nAgent: ${aiResponse}`;
            
            // Call title inference API
            const response = await fetch('/api/infer-title', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                content: combinedContent,
                contextType: 'conversation',
                contextId: updatedConversation.id,
              }),
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.title) {
                // Update conversation title in state
                const titleUpdatedConversation = {
                  ...updatedConversation,
                  title: result.title
                };
                setCurrentConversation(titleUpdatedConversation);
                updateConversationInHistory(titleUpdatedConversation);
                
                // --- Save Updated Title to DB ---
                if (currentUser) { // Check if user context is available
                  try {
                    await ConversationService.updateConversationTitle(
                      updatedConversation.id, // Use the correct conversation ID
                      result.title
                    );
                  } catch(error) {
                    console.error('Error updating conversation title in database:', error);
                  }
                }
                // --------------------------------
              }
            }
          } catch (error) {
            console.error('Error inferring conversation title:', error);
            // Continue without title inference on error
          }
        }
        
        // --- Dispatch editor content --- 
        // Check if we have editor content (now a markdown string) and intent is EDITOR
        if (creatorResponse.editorContent && intentAnalysis.destination === 'EDITOR') {
          console.log('AIContext: Dispatching editor:setContent event with markdown string.');
          // Create a custom event to send the EDITOR content MARKDOWN STRING to the editor component
          const editorContentEvent = new CustomEvent('editor:setContent', {
            detail: {
              content: creatorResponse.editorContent // Pass the markdown string directly
            }
          });
          window.dispatchEvent(editorContentEvent);
        } else if (creatorResponse.editorContent) {
          console.log('AIContext: Editor content received but intent was not EDITOR. Discarding.', {
             intent: intentAnalysis.destination,
             content: creatorResponse.editorContent.substring(0, 100) + '...'
          });
        }
      } catch (error) {
        console.error('Error generating AI response:', error);
        
        // Prepare error message object
        const assistantErrorMessage: Message = {
          role: 'assistant',
          content: 'I apologize, but I encountered an error while processing your request. Please try again.',
          model: currentModel // Use the current model from state
        };
        
        // Add error message to conversation (local state)
        updatedConversation.messages.push(assistantErrorMessage);
        
        // --- Save Assistant Error Message to DB (Optional) ---
        if (currentUser) {
          try {
            await MessageService.createMessage(
              currentConversation.id,
              assistantErrorMessage,
              currentUser.id
            );
            // Update conversation timestamp
            await ConversationService.updateConversationTimestamp(currentConversation.id);
          } catch (error) {
            console.error('Error saving assistant error message to database:', error);
          }
        }
        // -----------------------------------------------------
        
        // Update conversation in state (local UI update)
        setCurrentConversation({...updatedConversation}); // Spread to ensure re-render
        updateConversationInHistory({...updatedConversation});
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Perform web search function
  const performSearch = async (query: string): Promise<SearchResult[]> => {
    try {
      console.log(`Performing search for: ${query}`);
      const { SearchService } = await import('../lib/services/SearchService');
      const results = await SearchService.search(query, 5);
      return results;
    } catch (error) {
      console.error('Error performing search:', error);
      return [];
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

  // Update conversation in history
  const updateConversationInHistory = (conversation: Conversation) => {
    setConversationHistory(prev => 
      prev.map(conv => conv.id === conversation.id ? conversation : conv)
    );
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
        searchHistory,
        setSearchHistory,
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