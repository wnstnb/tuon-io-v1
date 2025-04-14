'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Block } from "@blocknote/core";
import { MessageService } from '../lib/services/MessageService';
import { ConversationService } from '../lib/services/ConversationService';
import { UserService } from '../lib/services/UserService';
import { CreatorAgentService, IntentAnalysisResult } from '../lib/services/CreatorAgentService';
import { useSupabase } from '../context/SupabaseContext';
import { useRouter } from 'next/navigation';
import { ArtifactService } from '../lib/services/ArtifactService';

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
  messages?: Message[]; // Make messages optional
  model: AIModelType;
  createdAt: Date;
  updatedAt: Date;
  artifactId?: string; // <-- ADDED: Link to artifact
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
  createNewConversation: (
    model?: AIModelType, 
    artifactIdToLink?: string, 
    forceNavigation?: boolean
  ) => void;
  sendMessage: (content: string, imageDataUrl?: string | null, editorContext?: EditorContext, searchOptions?: SearchOptions) => Promise<void>;
  selectConversation: (id: string) => void;
  switchModel: (model: AIModelType) => void;
  loadUserConversations: () => Promise<void>;
  updateEditorContext: (context?: EditorContext) => void;
  getCurrentEditorContext: () => EditorContext | undefined;
  findConversationByArtifactId: (artifactId: string) => Conversation | undefined;
}

// Create the AI context
const AIContext = createContext<AIContextType | undefined>(undefined);

// AI provider props
interface AIProviderProps {
  children: ReactNode;
}

// Create unique ID
const createId = () => Math.random().toString(36).substring(2, 9);

// --- NEW: Utility Function to Strip Markdown Code Blocks ---
const stripMarkdownCodeBlock = (text: string): string => {
  if (typeof text !== 'string') return text; // Return as-is if not a string

  const trimmedText = text.trim();
  // Regex to match ``` optionally followed by a language identifier and newline,
  // capturing the content inside, and ending with ```
  const codeBlockRegex = /^```(?:\\w*\\n)?([\\s\\S]*?)\\n?```$/;
  const match = trimmedText.match(codeBlockRegex);

  if (match && match[1]) {
    // Return the captured group (the content inside the code block)
    return match[1].trim(); // Trim the inner content as well
  }

  // If no code block detected, return the original trimmed text
  return trimmedText;
};
// --- END Utility Function ---

// AI provider component
export function AIProvider({ children }: AIProviderProps) {
  // State for API clients
  const [openaiClient, setOpenaiClient] = useState<any>(null);
  const [genaiClient, setGenaiClient] = useState<any>(null);
  const router = useRouter();
  
  const [currentModel, setCurrentModel] = useState<AIModelType>('gpt-4o');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const { user: currentUser } = useSupabase();
  const [editorContextRef, setEditorContextRef] = useState<EditorContext | undefined>(undefined);

  // --- Utility Function to Update Editor Context ---
  const updateEditorContext = useCallback((context?: EditorContext) => {
    setEditorContextRef(context);
  }, []);

  // --- Utility Function to Get Current Editor Context ---
   const getCurrentEditorContext = useCallback((): EditorContext | undefined => {
     return editorContextRef;
   }, [editorContextRef]);

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
        const messages = conversation.messages ? await Promise.all(conversation.messages.map(async ({ role, content, imageUrl }) => {
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
        })) : [];
        
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
        const history = (conversation.messages || [])
          .filter(msg => !msg.imageUrl) // Skip messages with images for non-multimodal Gemini models
          .map((msg: Message) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
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
    // Guard against running if already loading
    if (isLoadingConversations) {
      console.log('loadUserConversations skipped: Already loading.');
      return;
    }
    console.log('Attempting to load user conversations...');
    setIsLoadingConversations(true);
    let fetchedConversations: Omit<Conversation, 'messages'>[] = [];
    try {
      // Check if user is authenticated
      const currentUser = await UserService.getCurrentUser();
      if (!currentUser) {
        console.log('No authenticated user found, using in-memory conversations only.');
        setIsLoadingConversations(false);
        return;
      }
      
      // Get user conversations (metadata only) from database
      const conversationsMetadata = await ConversationService.getUserConversations(currentUser.id);
      console.log(`Fetched ${conversationsMetadata.length} conversation metadata items.`);

      if (conversationsMetadata && conversationsMetadata.length > 0) {
        // Map metadata to Conversation objects (initially without messages)
        // Ensure artifactId is mapped correctly
        const conversations = conversationsMetadata.map(meta => ({
           ...meta,
           messages: undefined,
           // artifactId: meta.artifactId // This should already be included by ConversationService
         }));
        fetchedConversations = conversations; // Store fetched conversations
        setConversationHistory(conversations);
        console.log('Conversation history set with metadata.');

        // If we have no active conversation, set the most recent one (metadata only for now)
        // Consider artifactId in URL when selecting initial conversation
        if (!currentConversation) {
          const urlArtifactId = new URLSearchParams(window.location.search).get('artifactId');
          let conversationToSelect: Conversation | undefined = undefined;

          if (urlArtifactId) {
             console.log(`URL has artifactId: ${urlArtifactId}, trying to find matching conversation.`);
             // Find the conversation linked to the artifact in the URL
             conversationToSelect = conversations.find(c => c.artifactId === urlArtifactId);
             if (conversationToSelect) {
                 console.log(`Found conversation ${conversationToSelect.id} linked to artifact ${urlArtifactId}.`);
             }
          }

          // If no matching conversation found for URL artifact, or no URL artifact, select most recent
          if (!conversationToSelect) {
             conversationToSelect = conversations[0];
             console.log(`No matching conversation for URL artifact or no URL artifact. Selecting most recent conversation: ${conversationToSelect.id}`);
          }

          // Set the selected conversation (triggers message loading via useEffect)
          setCurrentConversation(conversationToSelect); // Messages will be loaded by useEffect below
          setCurrentModel(conversationToSelect.model);
          console.log(`Set current conversation to ${conversationToSelect.id}.`);
        } else {
           console.log(`Current conversation already exists (ID: ${currentConversation.id}), not changing.`);
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoadingConversations(false);
      console.log('Finished loading user conversations.');
    }
  }, []);

  // Load user conversations on first load
  useEffect(() => {
    // Only need to check if initialized, the load function handles its own loading state
    if (isInitialized) { 
      loadUserConversations();
    }
    // Remove isLoadingConversations dependency to prevent loop
  }, [isInitialized, loadUserConversations]); 

  // --- REVISED useEffect Hook for Lazy Loading Messages ---
  useEffect(() => {
    let isMounted = true; // Prevent state update on unmounted component

    const fetchAndSetMessages = async (id: string) => {
      // Double-check messages haven't been loaded between effect trigger and async execution
      // Also check isLoading state to prevent potential simultaneous fetches
      if (isLoading || currentConversation?.id !== id || typeof currentConversation?.messages !== 'undefined') {
          return;
      }

      console.log(`Lazy loading messages for conversation: ${id}`);
      setIsLoading(true);
      let fetchedMessages: Message[] | null = null; // Use null to indicate fetch hasn't completed successfully

      try {
        fetchedMessages = await MessageService.getMessagesByConversationId(id);
      } catch (error) {
        console.error('Error lazy loading messages:', error);
        // Set to empty array on error to prevent re-fetching
        fetchedMessages = [];
      } finally {
        if (isMounted) {
          // Only update state if fetch completed (or errored) and ID still matches
          if (fetchedMessages !== null) { // Ensures fetchedMessages is Message[] or []
             const finalMessages: Message[] = fetchedMessages; // Explicitly type as Message[]
             setCurrentConversation(prevConv => {
                // Ensure we are still updating the correct conversation
                if (prevConv && prevConv.id === id) {
                    // Use the explicitly typed variable
                    return { ...prevConv, messages: finalMessages }; 
                }
                return prevConv; // Otherwise no change
             });
          }
          setIsLoading(false);
        }
      }
    };

    // Check if we need to fetch: ID exists and messages is specifically undefined
    if (currentConversation?.id && typeof currentConversation.messages === 'undefined') {
      fetchAndSetMessages(currentConversation.id);
    }

    // Cleanup function
    return () => {
      isMounted = false;
    };
    // Dependencies: Trigger when ID changes, or when messages change (from undefined to defined)
  }, [currentConversation?.id, currentConversation?.messages]); 
  // --- End REVISED useEffect Hook ---

  // --- NEW: Helper to find conversation by artifactId ---
  const findConversationByArtifactId = useCallback((artifactId: string): Conversation | undefined => {
    if (!artifactId) return undefined;
    // Search the current history
    const found = conversationHistory.find(conv => conv.artifactId === artifactId);
    console.log(`findConversationByArtifactId searched for ${artifactId}, found: ${found?.id}`);
    return found;
  }, [conversationHistory]);
  // --- END Helper ---

  // Create a new conversation
  const createNewConversation = async (
    model?: AIModelType, 
    artifactIdToLink?: string, 
    forceNavigation: boolean = false
  ) => {
    console.log(`AIContext: createNewConversation called. Linking to artifact: ${artifactIdToLink}, Force Navigation: ${forceNavigation}`); // Log entry + new flag
    const newModel = model || currentModel;
    let finalArtifactId = artifactIdToLink;
    let artifactJustCreated = false;

    // Ensure user is available
    const user = await UserService.getCurrentUser();
    if (!user) {
       console.error("Cannot create conversation or artifact: User not logged in.");
       alert("You must be logged in to create conversations and artifacts.");
       return;
    }

    // If no artifactId is provided, create a new one
    if (!finalArtifactId) {
      try {
        console.log("No artifactId provided, creating a new artifact...");
        finalArtifactId = await ArtifactService.createArtifact(user.id, 'Untitled Artifact');
        if (!finalArtifactId) {
           throw new Error("ArtifactService.createArtifact returned undefined ID");
        }
        console.log(`New artifact created with ID: ${finalArtifactId}`);
        artifactJustCreated = true; // Flag that we created it
      } catch (error) {
        console.error('Error creating linked artifact:', error);
        alert('Failed to create the associated artifact. Cannot create conversation.');
        return; // Stop if artifact creation fails
      }
    }

    // --- ADD LOG: Check the determined artifact ID --- //
    console.log(`AIContext: createNewConversation determined finalArtifactId: ${finalArtifactId}. artifactJustCreated: ${artifactJustCreated}`);

    // --- NEW: Generate Conversation ID Client-Side --- //
    const newConversationId = crypto.randomUUID();
    console.log(`Generated new conversation ID client-side: ${newConversationId}`);
    // --- END NEW ---

    // --- REMOVED tempId variable --- //
    const newConversation: Conversation = {
      id: newConversationId, // Use generated ID directly
      title: 'New Conversation',
      messages: [],
      model: newModel,
      createdAt: new Date(),
      updatedAt: new Date(),
      artifactId: finalArtifactId, // Link the artifact
    };

    // Add to local state immediately with the final ID
    console.log(`AIContext: About to set history and currentConversation (ID: ${newConversationId})`); // Log before state update
    setConversationHistory(prev => [newConversation, ...prev]);
    setCurrentConversation(newConversation);
    console.log(`AIContext: Finished setting currentConversation (ID: ${newConversationId}). Object:`, newConversation); // Log after state update

    try {
      // --- NEW: Ensure artifact exists in DB BEFORE creating conversation --- //
      if (finalArtifactId) { // Should always have an ID here now
        console.log(`Ensuring artifact ${finalArtifactId} exists in DB...`);
        // We assume createArtifactWithId is designed to handle potential duplicates gracefully
        // or we handle potential errors appropriately.
        await ArtifactService.createArtifactWithId(
          finalArtifactId, 
          user.id, 
          'Untitled Artifact', // Default title for now
          [] // Default empty content for now
        );
        // TODO: Add more robust error handling or check if artifact truly exists if needed
        console.log(`Artifact ${finalArtifactId} should now exist in DB.`);
      } else {
          // This case should ideally not be reached if logic is correct elsewhere
          throw new Error("finalArtifactId was unexpectedly null before creating conversation.");
      }
      // --- END Ensure Artifact --- //

      // Create conversation in database, passing the generated ID
      // Note: We don't strictly need the returned ID anymore, but we await completion.
      await ConversationService.createConversation(
        user.id,
        newConversation.title,
        finalArtifactId, // Pass the artifact ID to the service
        newConversationId // Pass the generated conversation ID
      );

      // --- REMOVED State update logic after DB call (no longer needed) ---
      // newConversation.id = conversationId;
      // setCurrentConversation({ ...newConversation }); 
      // setConversationHistory(prev => ... );
      // --- END REMOVED --- 

      console.log(`Conversation (ID: ${newConversationId}) saved to DB and linked to Artifact (ID: ${finalArtifactId})`);

      // If we just created the artifact OR navigation is forced, navigate to it ONLY if necessary
      if ((artifactJustCreated || forceNavigation) && finalArtifactId) {
        const currentUrlArtifactId = new URLSearchParams(window.location.search).get('artifactId');
        if (finalArtifactId !== currentUrlArtifactId) {
            console.log(`Navigating to artifact: ${finalArtifactId}. Reason: ${forceNavigation ? 'Forced by caller' : 'Artifact just created'}`);
            router.push(`/editor?artifactId=${finalArtifactId}`);
        } else {
             console.log(`Already on the correct artifact URL (${finalArtifactId}), skipping navigation.`);
        }
      }

    } catch (error) {
      console.error('Error creating conversation in database:', error);
      // TODO: Handle DB creation error (e.g., remove conversation from local state?)
      alert('Failed to save the new conversation.');
    }
  };

  // Send a message to the AI
  const sendMessage = async (
    content: string, 
    imageDataUrl?: string | null,
    editorContext?: EditorContext,
    searchOptions?: SearchOptions
  ) => {
    // Add detailed logging about the current conversation and its artifact ID
    console.log(`[AIContext] sendMessage called with current conversation ID: ${currentConversation?.id}`);
    console.log(`[AIContext] Current conversation artifact ID: ${currentConversation?.artifactId}`);
    if (editorContext) {
      console.log(`[AIContext] Editor context provided: ${JSON.stringify({
        currentFile: editorContext.currentFile,
        hasSelection: !!editorContext.selection,
        hasCursorPosition: !!editorContext.cursorPosition,
        hasEditorContent: !!editorContext.editorContent,
        selectedBlockCount: editorContext.selectedBlockIds?.length || 0
      })}`);
    }
    
    // Check 1: No current conversation?
    console.log('AIContext: sendMessage called. Current conversation:', currentConversation?.id, currentConversation); // Log conversation state
    if (!currentConversation) {
      console.error('AIContext: sendMessage aborted, no current conversation.');
      return;
    }

    let currentUser: { id: string } | null = null;
    try {
      currentUser = await UserService.getCurrentUser();
    } catch (error) {
      console.error('Error fetching current user:', error);
      // Optionally, handle the case where the user isn't available
    }
    console.log('AIContext: Fetched user:', currentUser?.id);

    try {
      setIsLoading(true); // Should show loading state
      
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
        ...(updatedConversation.messages || []),
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
      
      // Prepare context for AI history (history *without* the current user message)
      // Use slice(0, -1) on the updated message list
      const conversationContext = updatedConversation.messages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content,
        imageUrl: msg.imageUrl // Include path if needed by CreatorAgentService history processing
      }));

      // --- Intent Analysis (Uses editorContext, not history) ---
      let intentAnalysis: IntentAnalysisResult; // Define type explicitly
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
        // Ensure fallback matches the defined type
        intentAnalysis = {
           destination: 'CONVERSATION' as const, // Use 'as const' or cast
           confidence: 1.0,
           reasoning: 'Intent analysis failed, defaulting to conversation',
           // Initialize other potential fields from IntentAnalysisResult if they exist
           needsWebSearch: false, 
           searchQuery: undefined
        };
      }
      
      // --- Search Results Handling --- 
      // If search results exist, add them to conversationContext *before* calling CreatorAgentService
      let searchResultsAddedToContext = false; // Flag to track if context was modified
      if (searchResults.length > 0) {
          const { SearchService } = await import('../lib/services/SearchService');
          const formattedResults = SearchService.formatResults(searchResults);
          // NOTE: Directly pushing modifies the array used by the CreatorAgentService call below
          conversationContext.push({ 
              role: 'system',
              content: `Search results for "${searchOptions?.searchQuery || intentAnalysis?.searchQuery}":\n\n${formattedResults}`,
              imageUrl: undefined // Ensure consistent object structure
          });
          searchResultsAddedToContext = true;
          
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

      // *** DIAGNOSTIC LOG: Check context being passed ***
      console.log(`AIContext: Preparing ${conversationContext.length} history messages for CreatorAgentService (Search results added: ${searchResultsAddedToContext}). Last 3:`, JSON.stringify(conversationContext.slice(-3).map(m => ({ role: m.role, hasImage: !!m.imageUrl, content: m.content.substring(0, 50) + '...' })), null, 2)); 

      // Get the imageUrl from the userMessage we potentially updated after upload
      const finalUserMessageImageUrl = updatedConversation.messages[updatedConversation.messages.length - 1]?.imageUrl;

      const creatorResponse = await CreatorAgentService.processRequest(
        content,
        intentAnalysis, // Now guaranteed to be of type IntentAnalysisResult
        conversationContext,
        finalUserMessageImageUrl,
        editorContext?.markdown,
        updatedConversation.model
      );
      
      console.log('AIContext: Received response from CreatorAgentService:', creatorResponse);
      
      // Prepare AI response message object
      const assistantMessage: Message = {
        role: 'assistant',
        content: creatorResponse.chatContent,
        model: updatedConversation.model // Use the current model from state
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
      
      // --- MODIFIED: Dispatch editor content or modification --- 
      // Assume creatorResponse now potentially has a 'type' field
      // Use type casting to bypass linter errors until backend types are updated
      const responseType = (creatorResponse as any).type;

      // --- DIAGNOSTIC LOGGING ---
      console.log(`[AIContext Debug] Received responseType: ${responseType}, Destination: ${intentAnalysis.destination}`);
      if ((creatorResponse as any).newMarkdown) {
        console.log('[AIContext Debug] Raw newMarkdown from AI:', JSON.stringify((creatorResponse as any).newMarkdown));
      }
      // --- END DIAGNOSTIC LOGGING ---

      if (responseType === 'modification' && intentAnalysis.destination === 'EDITOR') {
        // Phase 1: Dispatch modification event
        console.log('[AIContext] Dispatching editor:applyModification event.'); // Added prefix for clarity
        // --- MODIFIED: Strip potential code block ---
        const rawMarkdown = (creatorResponse as any).newMarkdown;
        const cleanedMarkdown = stripMarkdownCodeBlock(rawMarkdown);
        // --- DIAGNOSTIC LOGGING ---
        console.log('[AIContext Debug] Cleaned newMarkdown:', JSON.stringify(cleanedMarkdown));
        if (rawMarkdown === cleanedMarkdown) {
          console.warn('[AIContext Debug] stripMarkdownCodeBlock did not change the content.');
        }
        // --- END DIAGNOSTIC LOGGING ---
        // --- END MODIFICATION ---
        const modificationEvent = new CustomEvent('editor:applyModification', {
          detail: {
            type: 'modification',
            action: (creatorResponse as any).action,
            targetBlockIds: (creatorResponse as any).targetBlockIds,
            newMarkdown: cleanedMarkdown // Use the cleaned markdown
          }
        });
        window.dispatchEvent(modificationEvent);

      } else if (responseType === 'full_replace' && intentAnalysis.destination === 'EDITOR') {
        // Dispatch existing full content replacement event
        console.log('[AIContext] Dispatching editor:setContent event with full markdown string.'); // Added prefix
        const editorContentEvent = new CustomEvent('editor:setContent', {
          detail: {
            content: (creatorResponse as any).content,
            artifactId: currentConversation?.artifactId // Include the artifact ID from the current conversation
          }
        });
        console.log(`[AIContext] Including artifact ID: ${currentConversation?.artifactId} with editor content event`); // Log the artifact ID
        window.dispatchEvent(editorContentEvent);

      } else if (creatorResponse.editorContent && intentAnalysis.destination === 'EDITOR') {
        // Fallback for older backend responses or unexpected structures
        console.warn('[AIContext] Received editorContent without type, dispatching as full replace.'); // Added prefix
        
        // --- REVISED: Always attempt strip if destination is EDITOR and type is missing ---
        let finalContent = creatorResponse.editorContent;
        console.log('[AIContext Debug] Intent destination is EDITOR and type is missing, attempting to strip code block from editorContent as fallback.');
        finalContent = stripMarkdownCodeBlock(creatorResponse.editorContent);
        if (finalContent !== creatorResponse.editorContent) {
           console.log('[AIContext Debug] Fallback stripping successful.');
        } else {
           console.warn('[AIContext Debug] Fallback stripping did not change content.');
        }
        // --- END REVISED Check ---
        
        const editorContentEvent = new CustomEvent('editor:setContent', {
          detail: {
            content: finalContent, // Use potentially cleaned content
            artifactId: currentConversation?.artifactId // Include the artifact ID from the current conversation
          }
        });
        console.log(`[AIContext] Including artifact ID: ${currentConversation?.artifactId} with editor content event (fallback)`); // Log the artifact ID
        window.dispatchEvent(editorContentEvent);

      } else if (creatorResponse.editorContent) {
         // Editor content received but intent was not EDITOR (existing logic)
         console.log('AIContext: Editor content received but intent was not EDITOR. Discarding.', {
           intent: intentAnalysis.destination,
           content: creatorResponse.editorContent.substring(0, 100) + '...'
        });
      }
      // --- END Dispatch Logic ---

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

  // Modify selectConversation to just set the metadata, useEffect will load messages
  const selectConversation = async (id: string) => {
    const conversation = conversationHistory.find(conv => conv.id === id);
    if (conversation && conversation.id !== currentConversation?.id) { // Only switch if different
      console.log(`Selecting conversation: ${id}. Messages will lazy load.`);
      // Set the conversation (metadata + potentially undefined messages)
      // The useEffect hook above will trigger the message loading
      setCurrentConversation(conversation);
      setCurrentModel(conversation.model);

      // NEW: Navigate to linked artifact if it exists AND URL is different
      if (conversation.artifactId) {
        const currentUrlArtifactId = new URLSearchParams(window.location.search).get('artifactId');
        if (conversation.artifactId !== currentUrlArtifactId) {
            console.log(`Conversation has linked artifactId: ${conversation.artifactId}. Navigating...`);
            router.push(`/editor?artifactId=${conversation.artifactId}`);
        } else {
             console.log(`Already on the correct artifact URL (${conversation.artifactId}), skipping navigation.`);
        }
      } else {
        // Optional: Handle conversations without artifacts? Maybe navigate away from editor?
        console.log(`Conversation ${id} has no linked artifact.`);
      }
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
        loadUserConversations,
        updateEditorContext,
        getCurrentEditorContext,
        findConversationByArtifactId
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