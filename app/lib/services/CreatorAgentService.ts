import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { OpenAI } from 'openai';
import { Block } from '@blocknote/core';
import { UserService } from './UserService';
import { AIModelType } from '../../context/AIContext';
import type { SearchService as SearchServiceType, SearchResult, ExaSearchFullResponse } from './SearchService';

/**
 * Interface for the response from the creator agent
 */
export interface CreatorAgentResponse {
  chatContent: string;
  editorContent?: string;
  searchData?: {
    query: string;
    results: any; // Can be SearchResult[] or ExaAnswerResponse
    provider: SearchType;
  } | null;
}

/**
 * Interface for intent analysis results
 */
export interface IntentAnalysisResult {
  destination: 'EDITOR' | 'CONVERSATION' | 'SEARCH';
  confidence: number;
  reasoning?: string;
  needsWebSearch?: boolean;
  searchQuery?: string;
}

// Add this type definition at the top level if it doesn't exist elsewhere
export type SearchType = 'web' | 'exaAnswer';

/**
 * Service for the creator agent that determines whether to keep the conversation in the chat
 * or generate content for the editor based on intent analysis
 */
export class CreatorAgentService {
  private static genaiClient: GoogleGenerativeAI | null = null;
  private static openaiClient: OpenAI | null = null;

  /**
   * Initialize the Gemini and OpenAI clients
   */
  private static initializeClients() {
    if (!this.genaiClient) {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        console.error('Gemini API key is missing.');
      } else {
        this.genaiClient = new GoogleGenerativeAI(apiKey);
        console.log('Gemini client initialized.');
      }
    }
    if (!this.openaiClient) {
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      if (!apiKey) {
        console.error('OpenAI API key is missing.');
      } else {
        try {
          this.openaiClient = new OpenAI({
            apiKey: apiKey,
            dangerouslyAllowBrowser: true,
          });
          console.log('OpenAI client initialized.');
        } catch (error) {
          console.error('Error initializing OpenAI client:', error);
        }
      }
    }
  }

  /**
   * Process user input and intent analysis to generate appropriate response
   * @param userInput The user's input text
   * @param intentAnalysis The result of intent analysis
   * @param conversationHistory Array of recent conversation messages for context
   * @param currentUserImageUrl Optional: The storage path of the image uploaded with the CURRENT user input
   * @param editorMarkdownContent Optional current editor markdown content for context-aware operations
   * @param currentModel Optional current model for context-aware operations
   * @param searchType Optional: Specify the type of web search to perform
   * @returns Response with content for chat and/or editor
   */
  static async processRequest(
    userInput: string,
    intentAnalysis: IntentAnalysisResult,
    conversationHistory: any[] = [],
    currentUserImageUrl?: string | null,
    editorMarkdownContent?: string,
    currentModel?: AIModelType,
    searchType?: SearchType
  ): Promise<CreatorAgentResponse> {
    this.initializeClients();
    
    console.log(`CreatorAgentService: Processing request. Intent: ${intentAnalysis.destination}, Search Type: ${searchType || 'N/A'}`);
    if (currentUserImageUrl) {
        console.log(`CreatorAgentService: Current request includes image path: ${currentUserImageUrl}`);
    }
    if (editorMarkdownContent) {
      console.log(`CreatorAgentService: Editor content provided (${editorMarkdownContent.length} characters)`);
    }
    
    let searchDataForSaving: CreatorAgentResponse['searchData'] = null;
    
    try {
      const hasSearchResults = conversationHistory.some(
        msg => msg.role === 'system' && (msg.content.includes('Search results for') || msg.content.includes('Context from Exa Answer search'))
      );
      
      // Determine if search is needed
      // Use intentAnalysis first, then explicit searchType, then fall back to shouldPerformWebSearch heuristic
      let needsSearch = false;
      let effectiveSearchType: SearchType = searchType || 'web'; // Default to web if not specified
      let searchQuery = intentAnalysis.searchQuery || this.extractSearchQuery(userInput);

      if (intentAnalysis.needsWebSearch) {
        needsSearch = true;
        // If intent analysis triggered search, respect the passed searchType if available
        effectiveSearchType = searchType || 'web'; 
        console.log('CreatorAgentService: Intent analysis determined web search needed.');
      } else if (searchType === 'exaAnswer') {
         // If user explicitly selected Exa Answer via UI toggle, trigger search
         needsSearch = true;
         effectiveSearchType = 'exaAnswer';
         console.log('CreatorAgentService: Explicit Exa Answer search type selected.');
      } else {
         // Fallback: check heuristic if no intent match or explicit toggle
         needsSearch = this.shouldPerformWebSearch(userInput, intentAnalysis);
         effectiveSearchType = 'web'; // Default to web search for heuristic matches
         if(needsSearch) {
            console.log('CreatorAgentService: Heuristic determined web search needed.');
         }
      }

      // Skip search if results already present in history
      if (hasSearchResults) {
          needsSearch = false;
          console.log('CreatorAgentService: Search results already present in history, skipping search.');
      }

      // Perform search if needed
      if (needsSearch && searchQuery) {
        try {
          console.log(`CreatorAgentService: Performing ${effectiveSearchType} search for "${searchQuery}"`);
          const { SearchService } = await import('./SearchService') as { SearchService: typeof SearchServiceType };

          if (effectiveSearchType === 'exaAnswer') {
            // --- Exa Answer Search --- 
            const exaAnswerResult = await SearchService.performExaAnswerSearch(searchQuery);
            
            // Check if we got a valid response object
            if (exaAnswerResult && exaAnswerResult.answer) { 
              console.log(`CreatorAgentService: Received Exa Answer object.`);
              
              // Format the answer string and citations into the context message
              let formattedAnswerContext = `Context from Exa Answer search for "${searchQuery}":\n\nAnswer: ${exaAnswerResult.answer}`;
              
              // Add citations if they exist
              if (exaAnswerResult.citations && exaAnswerResult.citations.length > 0) {
                formattedAnswerContext += `\n\nSources:\n`;
                formattedAnswerContext += exaAnswerResult.citations.map((c, i) => 
                  `[${i + 1}] ${c.title || 'Source'} (${c.url})`
                ).join('\n');
              }

              // Add Exa Answer context to conversation history
              conversationHistory.push({
                role: 'system',
                content: formattedAnswerContext
              });
              console.log('CreatorAgentService: Added Exa Answer context (with citations) to history.');
              searchDataForSaving = {
                query: searchQuery,
                results: exaAnswerResult,
                provider: 'exaAnswer'
              };
            } else {
              console.log('CreatorAgentService: Exa Answer search returned null or invalid structure.');
              // Optionally add a system message indicating no answer was found
              conversationHistory.push({
                   role: 'system',
                   content: `[System Note: Exa Answer search for "${searchQuery}" did not return a valid answer.]`
               });
            }
          } else {
            // --- Standard Web Search --- 
            const webSearchResults = await SearchService.search(searchQuery, 5) as SearchResult[];
            console.log(`CreatorAgentService: Found ${webSearchResults.length} standard web search results`);

            if (webSearchResults.length > 0) {
              // Format standard web search results
              const formattedResults = SearchService.formatResults(webSearchResults);

              // Add standard search results to conversation history
              conversationHistory.push({
                role: 'system',
                content: `Search results for "${searchQuery}":\n\n${formattedResults}`
              });
              console.log('CreatorAgentService: Added standard web search results to history.');
              
              // Also get the full response for storage
              const fullWebSearchResponse = await SearchService.search(searchQuery, 5, true) as ExaSearchFullResponse;
              
              searchDataForSaving = {
                query: searchQuery,
                results: fullWebSearchResponse,
                provider: 'web'
              };
            } else {
               console.log('CreatorAgentService: Standard web search returned no results.');
            }
          }
        } catch (error) {
          console.error(`CreatorAgentService: Error performing ${effectiveSearchType} search:`, error);
          // Add error message to history?
           conversationHistory.push({
               role: 'system',
               content: `[System Note: Failed to perform ${effectiveSearchType} search for "${searchQuery}". Proceeding without search results.]`
           });
        }
      }
      
      // Select the model (Adjusted stub to return Gemini)
      const modelToUse = this.selectAppropriateModel(userInput, intentAnalysis, currentModel, conversationHistory);
      
      // Construct the prompt
      const prompt = this.constructPrompt(userInput, intentAnalysis, conversationHistory, editorMarkdownContent);
      
      let chatResponse = 'An error occurred while processing your request.';
      let editorResponse: string | undefined = undefined;
      const startTime = Date.now(); // For potential performance tracking

      if (modelToUse.startsWith('gpt')) {
        // --- OpenAI Logic ---
        if (!this.openaiClient) {
          throw new Error("OpenAI client not initialized. Check API Key.");
        }

        // 1. Construct Messages for OpenAI (Vision API compatible)
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // --- MODIFIED SYSTEM PROMPT ---
        // Add System Prompt (incorporating intent and editor context with priority)
        let systemPrompt = `You are a helpful AI assistant. The user's primary intent is likely '${intentAnalysis.destination}'.`;

        const isNewConversation = conversationHistory.length < 2; // Consider history length

        if (editorMarkdownContent && (intentAnalysis.destination === 'EDITOR' || isNewConversation)) {
          // Prioritize editor content if intent is EDITOR or conversation is new
          systemPrompt += `\n\n**Primary Context: Current Editor Content**\n\`\`\`markdown\n${editorMarkdownContent}\n\`\`\`\n\nYour main goal is to understand, analyze, or modify the **Primary Context (Editor Content)** based on the user's request. Conversation history is secondary context.`;
          if (intentAnalysis.destination === 'EDITOR') {
             systemPrompt += `\nRespond *only* with the updated markdown content for the editor if the goal is to modify it. Do not include conversational filler.`;
          } else {
             // If conversation is new but intent isn't EDITOR, still acknowledge editor context but ask for chat response
             systemPrompt += `\nProvide a helpful chat response related to the user's query about the editor content.`;
          }
        } else if (intentAnalysis.destination === 'EDITOR') {
           // Intent is EDITOR but no content provided or conversation isn't new
           systemPrompt += `\nYour goal is to generate content suitable for the editor based on the user's request. Respond *only* with the markdown content for the editor.`;
        } else {
          // Standard conversation
          systemPrompt += ` Provide a helpful chat response based on the conversation history and the user's current request.`;
        }
        messages.push({ role: 'system', content: systemPrompt });
        // --- END MODIFIED SYSTEM PROMPT ---

        // Add Conversation History (secondary context marker added if editor content is primary)
        if (conversationHistory.length > 0) {
            if (editorMarkdownContent && (intentAnalysis.destination === 'EDITOR' || isNewConversation)) {
                 messages.push({ role: 'system', content: '**Secondary Context: Conversation History**' });
            }
            for (const msg of conversationHistory) {
                if (msg.role === 'user' && msg.imageUrl && typeof msg.imageUrl === 'string') {
                    try {
                        const { ImageService } = await import('./ImageService');
                        const publicImageUrl = await ImageService.createSignedPublicUrl(msg.imageUrl, 60);
                        console.log(`CreatorAgentService: Successfully generated signed URL for history image: ${publicImageUrl}`);
                        messages.push({ role: 'user', content: [ { type: 'text', text: msg.content }, { type: 'image_url', image_url: { url: publicImageUrl } } ]});
                    } catch (error) {
                        console.error(`CreatorAgentService: FAILED to get signed URL for history image ${msg.imageUrl}. Error:`, error);
                        messages.push({ role: 'user', content: msg.content + " [System note: Error generating image URL for AI]" });
                    }
                } else {
                    messages.push({ role: msg.role, content: String(msg.content || '') });
                }
            }
        }

        // Add Current User Input
        if (currentUserImageUrl) {
            try {
                const { ImageService } = await import('./ImageService');
                const publicImageUrl = await ImageService.createSignedPublicUrl(currentUserImageUrl, 60);
                console.log(`CreatorAgentService: Generated signed URL for current input image: ${publicImageUrl}`);
                messages.push({ role: 'user', content: [ { type: 'text', text: userInput }, { type: 'image_url', image_url: { url: publicImageUrl } } ]});
            } catch (error) {
                console.error(`CreatorAgentService: FAILED to get signed URL for current input image ${currentUserImageUrl}. Error:`, error);
                messages.push({ role: 'user', content: userInput + " [System note: Error generating image URL for AI]" });
            }
        } else {
            messages.push({ role: 'user', content: userInput });
        }

        // 2. Call OpenAI API
        console.log(`CreatorAgentService: Calling OpenAI (${modelToUse}) with ${messages.length} messages.`);
        const response = await this.openaiClient.chat.completions.create({ model: modelToUse, messages: messages, temperature: 0.7 });

        // 3. Process Response
        const aiMessage = response.choices[0]?.message?.content?.trim();
        if (!aiMessage) {
          throw new Error('OpenAI returned an empty response.');
        }

        // Use parseResponse to handle editor/chat separation and cleaning
        const parsedResponse = this.parseResponse(aiMessage, intentAnalysis);
        editorResponse = parsedResponse.editorContent;
        chatResponse = parsedResponse.chatContent;

      } else {
        // --- Gemini Logic ---
         if (!this.genaiClient) {
           throw new Error("Gemini client not initialized. Check API Key.");
         }
         
         // 1. Construct Prompt for Gemini (Vision API compatible)
         const geminiContents: any[] = []; // Use 'any' for flexibility or define a strict type
         
         // --- MODIFIED SYSTEM PROMPT (Implicitly part of the first user turn for Gemini history) ---
         let initialSystemInstruction = `User Intent: ${intentAnalysis.destination}.`;
         const isNewConversation = conversationHistory.length < 2; // Consider history length

         if (editorMarkdownContent && (intentAnalysis.destination === 'EDITOR' || isNewConversation)) {
           initialSystemInstruction += `\n\n**Primary Context: Current Editor Content**\n\`\`\`markdown\n${editorMarkdownContent}\n\`\`\`\n\nGoal: Understand, analyze, or modify the **Primary Context (Editor Content)** based on the user's request. Conversation history is secondary context.`;
           if (intentAnalysis.destination === 'EDITOR') {
              initialSystemInstruction += ` Respond *only* with the updated markdown content.`;
           } else {
              initialSystemInstruction += ` Provide a helpful chat response related to the editor content.`;
           }
         } else if (intentAnalysis.destination === 'EDITOR') {
           initialSystemInstruction += `\nGoal: Generate markdown content for the editor. Respond *only* with the markdown content.`;
         } else {
           initialSystemInstruction += `\nGoal: Provide a helpful chat response based on history and the current request.`;
         }
         // We'll prepend this instruction to the *first* user message if history is empty,
         // or potentially add it as a separate initial 'user' turn if history exists.
         // For Gemini, integrating system instructions smoothly into the chat flow is often better.

         // --- END MODIFIED SYSTEM PROMPT ---

         // Add conversation history
         let historyAdded = false;
         if (conversationHistory.length > 0) {
             if (editorMarkdownContent && (intentAnalysis.destination === 'EDITOR' || isNewConversation)) {
                  // Add a marker message for Gemini context separation
                  geminiContents.push({ role: 'user', parts: [{ text: "**Secondary Context: Conversation History Starts Below**" }] });
                  geminiContents.push({ role: 'model', parts: [{ text: "Understood." }] }); // Simple ack
             }
             for (const msg of conversationHistory) {
                 // Ensure roles are 'user' or 'model'
                 const role = msg.role === 'assistant' ? 'model' : (msg.role === 'user' ? 'user' : null);
                 if (!role) continue; // Skip system messages in history for Gemini for now

                 if (role === 'user' && msg.imageUrl && typeof msg.imageUrl === 'string') {
                     try {
                         // *** RESTORED Fetch/Base64 Logic for History ***
                         const { ImageService } = await import('./ImageService');
                         const publicImageUrl = await ImageService.createSignedPublicUrl(msg.imageUrl, 60);
                         const fetchResponse = await fetch(publicImageUrl);
                         if (!fetchResponse.ok) throw new Error(`Failed to fetch history image (${fetchResponse.status})`);
                         const imageBlob = await fetchResponse.blob();
                         const base64data = await new Promise<string>((resolve, reject) => {
                             const reader = new FileReader();
                             reader.onloadend = () => {
                                 // Check for errors first
                                 if (reader.error) {
                                     return reject(reader.error);
                                 }
                                 // Check if result is a string (Data URL)
                                 if (typeof reader.result === 'string') {
                                     // Split and resolve base64 part
                                     const parts = reader.result.split(',', 2);
                                     if (parts.length === 2) {
                                         resolve(parts[1]);
                                     } else {
                                         reject(new Error('Invalid Data URL format received from FileReader'));
                                     }
                                 } else {
                                     // Handle unexpected result type (null or ArrayBuffer)
                                     reject(new Error(`FileReader returned unexpected result type: ${typeof reader.result}`));
                                 }
                             };
                             reader.onerror = reject; // Handle setup errors
                             reader.readAsDataURL(imageBlob);
                         });
                         if (!base64data) throw new Error("Failed to convert history image blob to base64.");
                         // *** End Restored Logic ***

                         geminiContents.push({ role: 'user', parts: [ { text: msg.content }, { inline_data: { mime_type: imageBlob.type, data: base64data } } ] });
                         console.log(`CreatorAgentService: Added history image (base64) for Gemini.`); // Keep log
                     } catch (error) {
                          console.error(`CreatorAgentService: Failed to process history image for Gemini ${msg.imageUrl}. Error:`, error); // Keep log
                          geminiContents.push({ role: 'user', parts: [{ text: msg.content + " [System note: Error processing image for AI]" }] });
                     }
                 } else {
                     geminiContents.push({ role: role, parts: [{ text: String(msg.content || '') }] });
                 }
             }
             historyAdded = true;
         }

         // Add current user input, prepending system instructions if necessary
         const currentUserInputParts: any[] = [];
         let effectiveUserInput = userInput;

         // Prepend system instructions to the *first* user message content if history was empty
         // OR add as a separate turn if history exists (less ideal for Gemini?)
         if (!historyAdded) {
             effectiveUserInput = `${initialSystemInstruction}\n\n**User Request:**\n${userInput}`;
         } else {
             // If history exists, maybe add instructions as a preceding turn? Let's try prepending to current input first.
              effectiveUserInput = `${initialSystemInstruction}\n\n**User Request:**\n${userInput}`;
              // Alternative:
              // geminiContents.push({ role: 'user', parts: [{ text: initialSystemInstruction }] });
              // geminiContents.push({ role: 'model', parts: [{ text: "Okay, I understand the context. What is the user's request?" }] });
         }

         if (currentUserImageUrl) {
             try {
                 // *** RESTORED Fetch/Base64 Logic for Current Input ***
                 const { ImageService } = await import('./ImageService');
                 const publicImageUrl = await ImageService.createSignedPublicUrl(currentUserImageUrl, 60);
                 const fetchResponse = await fetch(publicImageUrl);
                 if (!fetchResponse.ok) throw new Error(`Failed to fetch current image (${fetchResponse.status})`);
                 const imageBlob = await fetchResponse.blob();
                 const base64data = await new Promise<string>((resolve, reject) => {
                     const reader = new FileReader();
                     reader.onloadend = () => {
                         // Check for errors first
                         if (reader.error) {
                             return reject(reader.error);
                         }
                         // Check if result is a string (Data URL)
                         if (typeof reader.result === 'string') {
                             // Split and resolve base64 part
                             const parts = reader.result.split(',', 2);
                             if (parts.length === 2) {
                                 resolve(parts[1]);
                             } else {
                                 reject(new Error('Invalid Data URL format received from FileReader'));
                             }
                         } else {
                             // Handle unexpected result type (null or ArrayBuffer)
                             reject(new Error(`FileReader returned unexpected result type: ${typeof reader.result}`));
                         }
                     };
                     reader.onerror = reject; // Handle setup errors
                     reader.readAsDataURL(imageBlob);
                 });
                 if (!base64data) throw new Error("Failed to convert current image blob to base64.");
                 // *** End Restored Logic ***

                 currentUserInputParts.push({ text: effectiveUserInput });
                 currentUserInputParts.push({ text: effectiveUserInput });
                 console.log(`CreatorAgentService: Added current user message with image (base64) for Gemini.`); // Keep log
             } catch (error) {
                 console.error(`CreatorAgentService: Failed to process current input image for Gemini ${currentUserImageUrl}. Error:`, error); // Keep log
                 geminiContents.push({ role: 'user', parts: [{ text: effectiveUserInput + " [System note: Error processing image for AI]" }] });
             }
         } else {
             // Add text-only user input
             currentUserInputParts.push({ text: effectiveUserInput });
             geminiContents.push({ role: 'user', parts: currentUserInputParts });
         }
         
         // 2. Call Gemini API
         console.log(`CreatorAgentService: Calling Gemini (${modelToUse}) with structured history.`);
         const model = this.genaiClient.getGenerativeModel({ model: modelToUse });

         // Separate history from the current message parts for startChat
         const chatHistory = geminiContents.slice(0, -1);
         const currentMessageParts = geminiContents[geminiContents.length - 1].parts;

         console.log("CreatorAgentService: Starting chat with history:", JSON.stringify(chatHistory.map(m => ({ role: m.role, hasParts: m.parts?.length })), null, 2));
         console.log("CreatorAgentService: Sending current message parts:", JSON.stringify(currentMessageParts, null, 2));

         const chat = model.startChat({ history: chatHistory });
         const result = await chat.sendMessage(currentMessageParts); // <-- Send just the parts array

         const response = result.response;
         const aiMessage = response.text()?.trim();

         if (!aiMessage) {
           throw new Error('Gemini returned an empty response.');
         }

         // Use parseResponse to handle editor/chat separation and cleaning
         const parsedResponse = this.parseResponse(aiMessage, intentAnalysis);
         editorResponse = parsedResponse.editorContent;
         chatResponse = parsedResponse.chatContent;

         // 3. Process Response (Similar logic as OpenAI, needs refinement)
         // if (intentAnalysis.destination === 'EDITOR') {
         //   editorResponse = aiMessage;
         //   chatResponse = "Okay, I've updated the editor content.";
         // } else {
         //   chatResponse = aiMessage;
         // }
      }

      console.log('CreatorAgentService: Successfully processed request.');
      return { 
        chatContent: chatResponse, 
        editorContent: editorResponse, 
        searchData: searchDataForSaving
      };
    } catch (error: any) {
      console.error('CreatorAgentService: Error processing request:', error);
      // Log specific details for debugging
       if (error instanceof Error) {
         console.error(`CreatorAgentService: Detailed error: [${error.name}] ${error.message}`);
         // If it's an API error from the SDK, it might have more details
         if ('cause' in error) {
             console.error('CreatorAgentService: Error Cause:', error.cause);
         }
       } else {
         console.error('CreatorAgentService: An unknown error occurred:', error);
       }

      return {
        chatContent: `I apologize, but I encountered an error while processing your request (${error.message || 'Unknown Error'}). Please check the console or contact support if the issue persists.`,
        editorContent: undefined,
        searchData: null
      };
    }
  }
  
  /**
   * Construct the prompt for the creator agent
   */
  private static constructPrompt(
    userInput: string,
    intentAnalysis: IntentAnalysisResult,
    conversationHistory: any[] = [],
    editorMarkdownContent?: string
  ): string {
    let prompt = `You are an AI assistant helping a user create content. The user's intent is determined to be: ${intentAnalysis.destination} (Confidence: ${intentAnalysis.confidence}). Reason: ${intentAnalysis.reasoning}\n`;

    // Add conversation history
    if (conversationHistory.length > 0) {
      prompt += "\n## Conversation History:\n";
      conversationHistory.forEach(msg => {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      prompt += "\n";
    }

    // Add editor context if available
    if (editorMarkdownContent) {
      prompt += `\n## Current Editor Content (Markdown):\n${editorMarkdownContent}\n`;
    }

    prompt += `\n## User Request:\n${userInput}\n`;

    prompt += `\n## Instructions:\n`;
    if (intentAnalysis.destination === 'EDITOR') {
      prompt += `Generate content suitable for direct insertion into a rich text editor based on the user request. Output ONLY the content meant for the editor, formatted using standard Markdown (headings, lists, bold, italics, code blocks, etc.). Do NOT include conversational text like "Okay, here is the content:". Just provide the raw Markdown.`;
    } else if (intentAnalysis.destination === 'CONVERSATION') {
      prompt += `Respond conversationally to the user's request. Do not generate content for the editor.`;
    } else { // Handle MIXED or other cases
      prompt += `Respond conversationally to the user's request in the chat. If the request also implies generating content (like a list, code, or document section), provide that content formatted in standard Markdown separately, clearly indicating it's for the editor. Use a separator like '--- EDITOR CONTENT START ---' before the Markdown content and '--- EDITOR CONTENT END ---' after it. If no editor content is needed, just provide the chat response.`;
    }
    prompt += `\nStrictly adhere to the requested output format based on the intent.`;

    return prompt;
  }
  
  /**
   * Parse the model's response into chat and editor content
   */
  private static parseResponse(responseText: string, intentAnalysis: IntentAnalysisResult): CreatorAgentResponse {
    responseText = this.cleanResponse(responseText);

    let chatContent = '';
    let editorContent: string | undefined = undefined;

    if (intentAnalysis.destination === 'EDITOR') {
      // Assume the entire response is editor content
      editorContent = responseText;
      // Provide a minimal chat confirmation
      chatContent = "Okay, I've added the content to the editor.";
      // Optional: Check if responseText seems conversational and adjust
      if (responseText.length < 100 && !responseText.includes('\n') && !responseText.match(/[#*`]/)) {
         // Heuristic: Likely a short confirmation message meant for chat, not editor
         // chatContent = responseText;
         // editorContent = null;
         // Decided against this heuristic for now, assume EDITOR intent means editor output
      }

    } else if (intentAnalysis.destination === 'CONVERSATION') {
      // Assume the entire response is chat content
      chatContent = responseText;
      editorContent = undefined;
    } else { // Handle MIXED intent (or default)
      const editorStartMarker = '--- EDITOR CONTENT START ---';
      const editorEndMarker = '--- EDITOR CONTENT END ---';
      const startIdx = responseText.indexOf(editorStartMarker);
      const endIdx = responseText.indexOf(editorEndMarker);

      if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        chatContent = responseText.substring(0, startIdx).trim();
        editorContent = responseText.substring(startIdx + editorStartMarker.length, endIdx).trim();

        // Append any text after the end marker to chat content
        const remainingText = responseText.substring(endIdx + editorEndMarker.length).trim();
        if (remainingText) {
          chatContent += `\n${remainingText}`;
        }

      } else {
        // If markers aren't found in MIXED mode, assume it's all chat content
        chatContent = responseText;
        editorContent = undefined;
      }
    }

    // Clean up potential markdown/code block fences from chat content
    chatContent = chatContent.replace(/```[\s\S]*?```/g, '[Code Block]').replace(/`/g, ''); // Basic cleaning

    // No longer call convertToBlockNoteFormat here
    return {
      chatContent: chatContent || " ", // Ensure chat content is never empty string
      editorContent: editorContent,
    };
  }
  
  private static cleanResponse(responseText: string): string {
    // Remove potential AI prefatory remarks or markdown fences wrapping the whole response
    responseText = responseText.trim();
    // Example: Remove ```markdown ... ``` if it wraps the entire response
    if (responseText.startsWith('```markdown') && responseText.endsWith('```')) {
      responseText = responseText.substring('```markdown'.length, responseText.length - '```'.length).trim();
    } else if (responseText.startsWith('```') && responseText.endsWith('```')) {
       // Generic fence removal
       responseText = responseText.substring('```'.length, responseText.length - '```'.length).trim();
    }
    return responseText;
  }

  /**
   * Determines if a web search *should* be performed based on user input heuristic
   * This is now primarily a fallback if intent analysis doesn't specify and no explicit search type is set.
   * @param userInput The user's input text
   * @param intentAnalysis Optional intent analysis result
   * @returns Boolean indicating if a heuristic search check passes
   */
  private static shouldPerformWebSearch(userInput: string, intentAnalysis?: IntentAnalysisResult): boolean {
    // Remove explicit /search check here as it's handled by the main logic
    // if (userInput.trim().startsWith('/search')) {
    //   return true;
    // }

    // Keep heuristic checks
    const searchIndicators = [
      /what (is|are|do you know about) .+\??/i,
      // ... other indicators
      /give me information (about|on) .+/i
    ];
    return searchIndicators.some(pattern => pattern.test(userInput));
  }

  /**
   * Extract the actual search query from the user input
   * @param userInput The user's input text
   * @returns The cleaned-up search query
   */
  private static extractSearchQuery(userInput: string): string {
    // Check for explicit search command first
    if (userInput.trim().startsWith('/search')) {
      return userInput.trim().substring('/search'.length).trim();
    }
    
    // Remove common prefixes to get the core search query
    const prefixesToRemove = [
      /^what (is|are) /i,
      /^tell me about /i,
      /^how (to|do|does|can) /i,
      /^who (is|was|are) /i,
      /^where (is|can|are) /i,
      /^when (is|was|did) /i,
      /^why (is|are|does) /i,
      /^search for /i,
      /^find /i,
      /^look up /i,
      /^can you find /i,
      /^give me information (about|on) /i,
      /^what do you know about /i
    ];
    
    let query = userInput;
    
    // Remove prefixes
    for (const prefix of prefixesToRemove) {
      query = query.replace(prefix, '');
      // If we made a replacement, break the loop
      if (query !== userInput) break;
    }
    
    // Remove question marks and other punctuation at the end
    query = query.replace(/[?!.]+$/, '').trim();
    
    return query;
  }

  // --- Helper methods --- 

  private static selectAppropriateModel(userInput: string, intentAnalysis: IntentAnalysisResult, currentModel?: AIModelType, conversationHistory: any[] = []): AIModelType {
    // Use the current model selected by the user if it's provided
    if (currentModel) {
      return currentModel;
    }
    
    // Fallback logic (e.g., based on intent or input) if needed
    // For now, just return a default if no model was passed explicitly
    console.warn("CreatorAgentService: No currentModel passed to selectAppropriateModel, falling back to default.");
    return 'gemini-2.0-flash'; // Or choose a smarter default based on analysis
  }

  // --- NEW: Process Editor Action ---
  static async processEditorAction(
    instruction: string,
    selectedBlockIds: string[], // Keep for context and return structure
    fullContextMarkdown: string,
    model: AIModelType,
    artifactId: string // For potential future context/logging
  ): Promise<{ type: string, action: string, targetBlockIds: string[], newMarkdown: string }> {
    this.initializeClients();
    console.log(`CreatorAgentService: Processing editor action for artifact ${artifactId} using ${model}.`);
    console.log(`Instruction: ${instruction}`);
    console.log(`Target Block IDs: ${selectedBlockIds.join(', ')}`);
    // console.log(`Full Context Markdown (truncated): ${fullContextMarkdown.substring(0, 200)}...`);

    let aiGeneratedMarkdown = '';
    const startTime = Date.now(); // For potential performance tracking

    try {
      // Construct the specialized prompt
      const systemPrompt = `You are an AI assistant specialized in editing document sections.
The user has selected a portion of a larger document (represented by block IDs: ${selectedBlockIds.join(', ')}) and provided an instruction for modification.
You will be given the full document context in Markdown format and the user's instruction.
Your task is to execute given instructions on the using the selected portion, in context of the full document if necessary (e.g., for style, consistency, or information).
Output ONLY the modified Markdown content that should replace the original selection. Do NOT include conversational text, introductions, explanations, or markdown fences (like \`\`\`) around your output. Just provide the raw, modified Markdown for the selected section.`;

      const userPrompt = `Instruction: "${instruction}"

Full Document Context:
\`\`\`markdown
${fullContextMarkdown}
\`\`\`

Generate the modified Markdown for the selected section based on the instruction and the full context. Remember to output ONLY the replacement Markdown.`;

      if (model.startsWith('gpt')) {
        if (!this.openaiClient) throw new Error("OpenAI client not initialized.");
        
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ];

        console.log(`CreatorAgentService (EditorAction): Calling OpenAI (${model})`);
        const response = await this.openaiClient.chat.completions.create({
          model: model,
          messages: messages,
          temperature: 0.5, // Lower temperature for more focused editing
        });
        aiGeneratedMarkdown = response.choices[0]?.message?.content?.trim() || '';

      } else if (model.startsWith('gemini')) {
        if (!this.genaiClient) throw new Error("Gemini client not initialized.");

        // Gemini works better with direct instruction in the user prompt
        // Combine system and user prompt ideas into a single prompt structure
        const combinedPrompt = `${systemPrompt}

${userPrompt}`; // Combine instructions and context

        console.log(`CreatorAgentService (EditorAction): Calling Gemini (${model})`);
        const geminiModel = this.genaiClient.getGenerativeModel({ model: model });
        const result = await geminiModel.generateContent(combinedPrompt);
        const response = result.response;
        aiGeneratedMarkdown = response.text()?.trim() || '';

      } else {
        throw new Error(`Unsupported model type: ${model}`);
      }

      // Clean the response (remove potential markdown fences)
      aiGeneratedMarkdown = this.cleanResponse(aiGeneratedMarkdown); // Reuse existing cleaner

      if (!aiGeneratedMarkdown) {
         console.warn("CreatorAgentService (EditorAction): AI returned an empty response.");
         // Decide on fallback: empty string or original content? Let's use empty for now.
      }

      console.log(`CreatorAgentService (EditorAction): Successfully generated markdown (length: ${aiGeneratedMarkdown.length}).`);

      // Return the structured response for the editor event
      return {
        type: 'modification',
        action: 'replace',
        targetBlockIds: selectedBlockIds, // Return the original IDs
        newMarkdown: aiGeneratedMarkdown
      };

    } catch (error: any) {
      console.error('CreatorAgentService (EditorAction): Error processing editor action:', error);
       if (error instanceof Error) {
         console.error(`CreatorAgentService (EditorAction): Detailed error: [${error.name}] ${error.message}`);
         if ('cause' in error) console.error('CreatorAgentService: Error Cause:', error.cause);
       } else {
         console.error('CreatorAgentService: An unknown error occurred:', error);
       }
       
      // Rethrow or return a specific error structure? Rethrowing for now.
      // Or, return an empty modification to avoid breaking the flow?
      // Let's return an empty modification with an error message for graceful failure.
       return {
         type: 'modification',
         action: 'replace',
         targetBlockIds: selectedBlockIds,
         newMarkdown: `[AI Error: Failed to process modification - ${error.message || 'Unknown Error'}]`
       };
    }
  }
  // --- END NEW Process Editor Action ---
} 