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
import { supabase } from '../lib/supabase';

// Define supported AI models
export type AIModelType = 
  | 'gpt-4o'
  | 'gpt-4.1-2025-04-14'
  | 'gpt-o3-mini' 
  | 'gemini-2.0-flash'
  | 'gemini-2.5-pro-preview-03-25'
  | 'gemini-2.5-flash-preview-04-17';

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

// Define search type (can be shared)
type SearchType = 'web' | 'exaAnswer';

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
  sendMessage: (
    content: string, 
    imageDataUrl?: string | null, 
    editorContext?: EditorContext, 
    searchType?: SearchType,
    isChatPanelCollapsed?: boolean
  ) => Promise<void>;
  selectConversation: (id: string) => void;
  switchModel: (model: AIModelType) => void;
  loadUserConversations: () => Promise<void>;
  updateEditorContext: (context?: EditorContext) => void;
  getCurrentEditorContext: () => EditorContext | undefined;
  findConversationByArtifactId: (artifactId: string) => Conversation | undefined;
  processEditorSelectionAction: (
    instruction: string,
    selectedBlockIds: string[],
    fullContextMarkdown: string
  ) => Promise<void>;
  followUpText: string | null;
  setFollowUpText: (text: string | null) => void;
  updateConversationMetadata: (id: string, metadata: Partial<Pick<Conversation, 'title' | 'artifactId'>>) => Promise<void>;
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
  const [followUpText, setFollowUpText] = useState<string | null>(null);

  // --- Utility Function to Update Editor Context ---
  const updateEditorContext = useCallback((context?: EditorContext) => {
    setEditorContextRef(context);
  }, []);

  // --- Utility Function to Get Current Editor Context ---
   const getCurrentEditorContext = useCallback((): EditorContext | undefined => {
     return editorContextRef;
   }, [editorContextRef]);

  // --- NEW: Helper function to dispatch notifications ---
  const dispatchNotification = useCallback((message: string, type: 'info' | 'error' | 'success', duration?: number) => {
    const detail: { message: string; type: string; duration?: number } = { message, type };
    if (duration) {
      detail.duration = duration;
    }
    window.dispatchEvent(new CustomEvent('chat:showNotification', { detail }));
  }, []);
  // --- END Helper --- //

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

  // --- NEW: Implement function for editor actions --- 
  const processEditorSelectionAction = useCallback(async (
    instruction: string,
    selectedBlockIds: string[],
    fullContextMarkdown: string
  ) => {
    console.log('--- [AIContext] processEditorSelectionAction Called ---');
    console.log('Instruction:', instruction);
    console.log('Selected Block IDs:', selectedBlockIds);
    console.log('Full Context Markdown:', fullContextMarkdown.substring(0, 100) + (fullContextMarkdown.length > 100 ? '...' : ''));

    if (!currentConversation) {
      console.error('processEditorSelectionAction: No current conversation found.');
      dispatchNotification("Cannot process action: No active conversation.", 'error');
      return;
    }
    // --- NEW: Check for artifactId --- 
    if (!currentConversation.artifactId) {
        console.error('processEditorSelectionAction: Current conversation has no linked artifactId.');
        dispatchNotification("Cannot process action: Conversation not linked to an artifact.", 'error');
        return;
    }
    // --- END Check --- 

    setIsLoading(true); // Use context loading state
    let modificationResult = null; // Define outside try block

    try {
      // --- MODIFIED: Call Actual Backend Service --- 
      console.log(`Calling CreatorAgentService.processEditorAction for artifact: ${currentConversation.artifactId}`);
      
      // Ensure artifactId is not undefined before passing
      if (!currentConversation.artifactId) {
        throw new Error("Cannot process action: Conversation not linked to an artifact.");
      }

      modificationResult = await CreatorAgentService.processEditorAction(
        instruction,
        selectedBlockIds,
        fullContextMarkdown, // Pass full context
        currentModel, // Pass the currently selected model
        currentConversation.artifactId // Pass artifact ID for context
      );
      // --- END MODIFIED --- 
      
      /* --- REMOVED Simulation Block ---
      // *** Simulating Backend Call & Response ***
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
      modificationResult = { // Assign to outer variable
        type: 'modification',
        action: 'replace',
        targetBlockIds: selectedBlockIds,
        // --- MODIFIED SIMULATION: Use full context in log, but keep structure ---
        newMarkdown: `**AI Modified Content (Simulated based on instruction and context):**\n*Instruction: ${instruction}*`
        // Note: Real implementation needs AI to generate this based on instruction,
        // fullContextMarkdown, targeting selectedBlockIds
        // --- END MODIFIED SIMULATION ---
      };
      console.log("Simulated backend response:", modificationResult);
      // --- End Simulation --- 
      --- END REMOVED --- */

      // --- NEW: Validate the structure of the response --- 
      if (
        !modificationResult ||
        modificationResult.type !== 'modification' ||
        modificationResult.action !== 'replace' ||
        !Array.isArray(modificationResult.targetBlockIds) ||
        typeof modificationResult.newMarkdown !== 'string'
      ) {
        throw new Error("Invalid modification response structure from backend.");
      }
      // --- END Validation --- 

      // Dispatch 'editor:applyModification' event with the result
      console.log("Dispatching editor:applyModification with:", modificationResult);
       const applyEvent = new CustomEvent('editor:applyModification', {
         detail: modificationResult 
       });
       window.dispatchEvent(applyEvent);
       dispatchNotification("AI modification applied!", 'success');

    } catch (error) {
      console.error('Error processing editor selection action:', error);
      dispatchNotification(`Failed to apply AI modification: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsLoading(false); // Turn off loading state
    }
  }, [currentConversation, currentModel, dispatchNotification]); // Added dispatchNotification dependency
  // --- END NEW Implementation ---

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
            
            // Update the URL with the new artifact ID
            const url = new URL(window.location.href);
            url.searchParams.set('artifactId', finalArtifactId);
            window.history.replaceState({}, '', url.toString());
            
            // Dispatch a custom event to notify the editor page of the navigation
            window.dispatchEvent(new CustomEvent('artifactSelected', {
              detail: { artifactId: finalArtifactId }
            }));
            
            // Still use router.push for proper Next.js state management
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
    searchType?: SearchType,
    isPanelCollapsed?: boolean
  ) => {
    console.log(`[AIContext] sendMessage called. Search Type: ${searchType || 'Default (Web)'}, Panel Collapsed: ${isPanelCollapsed}`);
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

    // Keep the outer isLoading for disabling input etc.
    setIsLoading(true);

    try {
      const updatedConversation = { ...currentConversation };
      
      const userMessage: Message = {
        role: 'user',
        content,
        contentType: imageDataUrl ? 'text-with-image' : 'text',
        imageUrl: undefined,
      };
      
      updatedConversation.messages = [
        ...(updatedConversation.messages || []),
        userMessage
      ];
      
      // Handle image upload if provided
      if (imageDataUrl && currentUser) {
        try {
          const { ImageService } = await import('../lib/services/ImageService');
          const imagePath = await ImageService.uploadImage(
            currentUser.id,
            imageDataUrl,
            'conversation-images',
            currentConversation.id
          );
          userMessage.imageUrl = imagePath;
          updatedConversation.messages[updatedConversation.messages.length - 1].imageUrl = imagePath;
        } catch (error) {
          console.error('Error uploading image:', error);
        }
      } else if (imageDataUrl && !currentUser) {
        console.error('Cannot upload image: No authenticated user');
      }

      // Save User Message to DB
      if (currentUser) {
        try {
          await MessageService.createMessage(
            currentConversation.id,
            userMessage,
            currentUser.id
          );
          await ConversationService.updateConversationTimestamp(currentConversation.id);
        } catch (error) {
          console.error('Error saving user message to database:', error);
        }
      }
      
      // Update conversation in state immediately for user message
      setCurrentConversation(updatedConversation);
      updateConversationInHistory(updatedConversation);
      
      // Prepare context for AI history
      const conversationContext = updatedConversation.messages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content,
        imageUrl: msg.imageUrl
      }));

      // Intent Analysis
      let intentAnalysis: IntentAnalysisResult;
      try {
        const { IntentAgentService } = await import('../lib/services/IntentAgentService');
        intentAnalysis = await IntentAgentService.analyzeIntent(
          content, 
          editorContext
        );
        console.log('Intent analysis:', intentAnalysis);
      } catch (error) {
        console.error('Error analyzing intent:', error);
        intentAnalysis = {
           destination: 'CONVERSATION' as const,
           confidence: 1.0,
           reasoning: 'Intent analysis failed, defaulting to conversation',
           needsWebSearch: false,
           searchQuery: undefined
        };
      }
      
      // --- REMOVED toast.promise wrapper ---
      let agentResponse;
      // Display pending message using new notification system
      dispatchNotification("Assistant is thinking...", 'info', 60000); // Show for up to 60s
      try {
        agentResponse = await CreatorAgentService.processRequest(
          content, 
          intentAnalysis, 
          conversationContext,
          userMessage.imageUrl,
          editorContext?.markdown,
          currentModel,
          searchType
        );
        // Hide pending message and show success
        window.dispatchEvent(new CustomEvent('chat:hideNotification')); // Hide thinking message
        dispatchNotification("Response received!", 'success');
      } catch (agentError) {
        console.error('Error calling CreatorAgentService:', agentError);
        window.dispatchEvent(new CustomEvent('chat:hideNotification')); // Hide thinking message
        dispatchNotification("Error processing request. Please try again.", 'error');
        // Set a default error response to prevent breaking subsequent code
        agentResponse = { chatContent: "Sorry, I encountered an error processing your request." }; 
      }
      // --- End Agent Service Call ---
      
      // Use the response from the agent (or the fallback error message)
      const aiChatResponse = agentResponse.chatContent;
      const aiEditorResponse = agentResponse.editorContent;

      const assistantMessage: Message = {
        role: 'assistant',
        content: aiChatResponse,
        model: currentModel,
      };

      // Update local state with assistant message
      // Use functional update to ensure we're updating based on the latest state
      setCurrentConversation(prevConv => {
        if (!prevConv) return null; // Should not happen here but good practice
        return {
            ...prevConv,
            messages: [...(prevConv.messages || []), assistantMessage]
        };
      });
      // Update history immediately after setting current conversation
      updateConversationInHistory({ 
          ...updatedConversation, // Use the conversation state *before* this update
          messages: [...(updatedConversation.messages || []), assistantMessage] // Add the new message
      });

      // Save Assistant Message to DB
      if (currentUser) {
        try {
           await MessageService.createMessage(
             currentConversation.id,
             assistantMessage,
             currentUser.id
           );
           // Update conversation timestamp again after assistant response
           await ConversationService.updateConversationTimestamp(currentConversation.id);
        } catch (error) {
          console.error('Error saving assistant message to database:', error);
        }
      }

      // --- Handle Editor Content Update (REMOVED for now to fix lint error) ---
      // if (aiEditorResponse && typeof aiEditorResponse !== 'string') { 
      //   try {
      //     // const { handleEditorUpdate } = await import('../lib/utils/editorUpdater'); // REMOVED IMPORT
      //     // handleEditorUpdate(aiEditorResponse, currentConversation.artifactId || null); // REMOVED CALL
      //     console.warn("Editor update logic temporarily removed due to missing path.");
      //   } catch (error) {
      //     console.error("Error handling editor update:", error);
      //   }
      // }
      // --- Restore and Implement Editor Content Update ---
      if (aiEditorResponse && currentConversation?.id) { // Check if there's content and a conversation
        try {
          console.log(`AIContext: Dispatching editor:setContent for artifact: ${currentConversation.artifactId}`);
          const setContentEvent = new CustomEvent('editor:setContent', {
            detail: { 
              content: aiEditorResponse, // The markdown content from the AI
              artifactId: currentConversation.artifactId || null // Pass the artifact ID
            }
          });
          window.dispatchEvent(setContentEvent);
        } catch (error) {
          console.error("AIContext: Error dispatching editor:setContent event:", error);
          dispatchNotification("Failed to update editor content.", 'error');
        }
      }
      // --------------------------------

    } catch (error) {
      console.error('Error in sendMessage:', error);
      // Potentially dispatch a generic error notification here if needed
      dispatchNotification("An unexpected error occurred.", 'error');
    } finally {
      setIsLoading(false); // Turn off loading state
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
    if (currentConversation?.id === conversation.id) {
      setCurrentConversation(conversation);
    }
  };

  // --- ADDED: Function to update conversation metadata (title, artifactId) ---
  const updateConversationMetadata = useCallback(async (id: string, metadata: Partial<Pick<Conversation, 'title' | 'artifactId'>>) => {
    if (!currentUser) {
      console.error("Cannot update metadata: user not logged in.");
      dispatchNotification("Error: Not logged in.", 'error');
      return;
    }

    if (process.env.NODE_ENV === 'development') console.log(`Attempting to update metadata for conversation ${id}:`, metadata);

    // Optimistic UI update
    const originalConversation = conversationHistory.find(c => c.id === id);
    let updatedConversation = null;
    if (originalConversation) {
      updatedConversation = { ...originalConversation, ...metadata, updatedAt: new Date() };
      updateConversationInHistory(updatedConversation);
    } else {
      console.warn("Conversation not found locally for optimistic update.");
      // Fetch if needed, or rely on backend success?
    }

    try {
      // Call backend service
      let success = false;
      if (metadata.title !== undefined) {
         success = await ConversationService.updateConversationTitle(id, metadata.title);
      } else if (metadata.artifactId !== undefined) {
         // TODO: Implement ConversationService.updateConversationArtifactId if needed
         console.warn('Updating only artifactId not implemented yet in ConversationService');
         success = false; // Or true if we consider it successful not to call
      } else {
        // No relevant metadata to update
        success = true; 
      }
      
      if (success) {
        if (process.env.NODE_ENV === 'development') console.log(`Successfully updated metadata for conversation ${id} in DB.`);
        // Optional: If optimistic update wasn't perfect, re-sync or update state again from success response
        // For now, assume optimistic update is sufficient on success
      } else {
        console.error(`Failed to update metadata for conversation ${id} in DB.`);
        dispatchNotification("Failed to save title change.", 'error');
        // Revert optimistic update on failure
        if (originalConversation) {
          updateConversationInHistory(originalConversation);
        }
      }
    } catch (error) {
      console.error(`Error updating conversation metadata for ${id}:`, error);
      dispatchNotification("An error occurred while saving title.", 'error');
      // Revert optimistic update on error
      if (originalConversation) {
        updateConversationInHistory(originalConversation);
      }
    }
  }, [currentUser, conversationHistory, currentConversation?.id, dispatchNotification]);
  // --- END Function ---

  // --- Function to delete a conversation ---
  const deleteConversation = async (id: string) => {
    // ... existing deleteConversation implementation ...
  };

  // Context value
  const value = {
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
    findConversationByArtifactId,
    processEditorSelectionAction,
    followUpText,
    setFollowUpText,
    updateConversationMetadata,
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

// Custom hook to use AI context
export function useAI() {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
} 