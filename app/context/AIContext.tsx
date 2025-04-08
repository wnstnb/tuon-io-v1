'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// Define AI context type
interface AIContextType {
  currentModel: AIModelType;
  setCurrentModel: (model: AIModelType) => void;
  isLoading: boolean;
  currentConversation: Conversation | null;
  conversationHistory: Conversation[];
  createNewConversation: (model?: AIModelType) => void;
  sendMessage: (content: string) => Promise<void>;
  selectConversation: (id: string) => void;
  switchModel: (model: AIModelType) => void;
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
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([]);

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
      } catch (error) {
        console.error('Error initializing API clients:', error);
      }
    }
  }, []);

  // Create a new conversation
  const createNewConversation = (model?: AIModelType) => {
    const newConversation: Conversation = {
      id: createId(),
      title: 'New Conversation',
      messages: [],
      model: model || currentModel,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setConversationHistory(prev => [newConversation, ...prev]);
    setCurrentConversation(newConversation);
  };

  // Select a conversation from history
  const selectConversation = (id: string) => {
    const conversation = conversationHistory.find(conv => conv.id === id);
    if (conversation) {
      setCurrentConversation(conversation);
      setCurrentModel(conversation.model);
    }
  };

  // Send a message to the AI
  const sendMessage = async (content: string) => {
    // Check if API clients are initialized
    if (!openaiClient || !genaiClient) {
      console.error('API clients not initialized yet');
      return;
    }

    // Create a new conversation if one doesn't exist
    if (!currentConversation) {
      createNewConversation();
      
      // We need to ensure the new conversation is created before proceeding
      const newConversation: Conversation = {
        id: createId(),
        title: 'New Conversation',
        messages: [],
        model: currentModel,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Add user message to conversation
      const userMessage: Message = { role: 'user', content };
      newConversation.messages.push(userMessage);
      
      setCurrentConversation(newConversation);
      setConversationHistory(prev => [newConversation, ...prev]);
      
      setIsLoading(true);
      
      try {
        // Process AI response with the new conversation
        let aiResponse = await getAIResponse(newConversation, content);
        
        // Add AI response to conversation
        const assistantMessage: Message = { role: 'assistant', content: aiResponse };
        newConversation.messages.push(assistantMessage);
        newConversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        newConversation.updatedAt = new Date();
        
        setCurrentConversation({...newConversation});
        setConversationHistory(prev => 
          prev.map(conv => conv.id === newConversation.id ? {...newConversation} : conv)
        );
      } catch (error) {
        console.error('Error in sendMessage:', error);
        
        // Add error message to conversation
        const errorMessage: Message = { 
          role: 'assistant', 
          content: `Error: Could not get a response from the AI model. Please check your API keys and try again.` 
        };
        
        newConversation.messages.push(errorMessage);
        
        setCurrentConversation({...newConversation});
        setConversationHistory(prev => 
          prev.map(conv => conv.id === newConversation.id ? {...newConversation} : conv)
        );
      } finally {
        setIsLoading(false);
      }
      
      return;
    }
    
    // Add user message to existing conversation
    const userMessage: Message = { role: 'user', content };
    const updatedConversation = {
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage],
      updatedAt: new Date(),
    };
    
    setCurrentConversation(updatedConversation);
    setConversationHistory(prev => 
      prev.map(conv => conv.id === updatedConversation.id ? updatedConversation : conv)
    );
    
    setIsLoading(true);
    
    try {
      let aiResponse = await getAIResponse(updatedConversation, content);
      
      // Add AI response to conversation
      const assistantMessage: Message = { role: 'assistant', content: aiResponse };
      const finalConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, assistantMessage],
        updatedAt: new Date(),
      };
      
      // Update title if this is the first exchange
      if (finalConversation.messages.length === 2 && finalConversation.title === 'New Conversation') {
        finalConversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
      }
      
      setCurrentConversation(finalConversation);
      setConversationHistory(prev => 
        prev.map(conv => conv.id === finalConversation.id ? finalConversation : conv)
      );
    } catch (error) {
      console.error('Error in sendMessage:', error);
      
      // Add error message to conversation
      const errorMessage: Message = { 
        role: 'assistant', 
        content: `Error: Could not get a response from the AI model. Please check your API keys and try again.` 
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
    } finally {
      setIsLoading(false);
    }
  };
  
  // Helper function to get AI response based on model type
  const getAIResponse = async (conversation: Conversation, content: string): Promise<string> => {
    let aiResponse: string = '';
    
    // Process based on model type
    if (conversation.model.startsWith('gpt')) {
      // OpenAI API call
      try {
        const response = await openaiClient.chat.completions.create({
          model: conversation.model,
          messages: conversation.messages.map(({ role, content }) => ({ 
            role: role as 'user' | 'assistant' | 'system', 
            content 
          })),
        });
        
        aiResponse = response.choices[0]?.message?.content || 'No response from AI';
      } catch (error) {
        console.error('OpenAI API error:', error);
        aiResponse = 'Error: Failed to get response from OpenAI. Please check your API key.';
      }
    } else {
      // Gemini API call
      try {
        const geminiModel = genaiClient.getGenerativeModel({ model: conversation.model });
        
        const chat = geminiModel.startChat({
          history: conversation.messages.map(({ role, content }) => ({
            role: role === 'assistant' ? 'model' : 'user',
            parts: [{ text: content }],
          })),
        });
        
        const result = await chat.sendMessage(content);
        aiResponse = result.response.text();
      } catch (error) {
        console.error('Gemini API error:', error);
        aiResponse = 'Error: Failed to get response from Gemini. Please check your API key.';
      }
    }
    
    return aiResponse;
  };

  // Switch model for the current conversation
  const switchModel = (model: AIModelType) => {
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
        currentConversation,
        conversationHistory,
        createNewConversation,
        sendMessage,
        selectConversation,
        switchModel,
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