import { GoogleGenerativeAI } from '@google/generative-ai';
import { Block } from '@blocknote/core';

/**
 * Interface for the response from the intent agent
 */
export interface IntentAnalysisResult {
  destination: 'EDITOR' | 'CONVERSATION';
  confidence: number;
  reasoning: string;
  needsWebSearch?: boolean; // Flag indicating if this query would benefit from web search
  searchQuery?: string; // Extracted search query if needsWebSearch is true
  metadata?: {
    targetFile?: string;
    position?: number;
    editorAction?: 'ADD' | 'MODIFY' | 'EXPAND' | 'REPLACE' | 'REFORMAT' | 'DELETE' | 'NONE';
  };
}

/**
 * Service for analyzing user intent and determining output destination
 */
export class IntentAgentService {
  private static genaiClient: any = null;

  /**
   * Initialize the Gemini client
   */
  private static initializeClient() {
    if (!this.genaiClient) {
      this.genaiClient = new GoogleGenerativeAI(
        process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'dummy-key'
      );
      console.log('IntentAgentService: Initialized Gemini client');
    }
  }

  /**
   * Analyze user input to determine intent and output destination
   * @param userInput The user's input text
   * @param editorContext Optional context about what's currently in the editor
   * @returns Analysis result indicating where the output should go
   */
  static async analyzeIntent(
    userInput: string,
    editorContext?: {
      currentFile?: string;
      selection?: string;
      cursorPosition?: number;
    }
  ): Promise<IntentAnalysisResult> {
    this.initializeClient();
    
    console.log('IntentAgentService: Analyzing intent for input:', userInput);
    
    // Construct the prompt for the model
    const prompt = this.constructPrompt(userInput, editorContext);
    
    try {
      // Use Gemini 2.0 Flash for quick intent analysis
      const model = this.genaiClient.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.2, // Low temperature for more deterministic results
        }
      });
      
      // Send the analysis request to Gemini
      const response = await model.generateContent(prompt);
      const responseText = response.response.text();
      
      console.log('IntentAgentService: Raw response:', responseText);
      
      // Parse the response to extract the structured result
      return this.parseResponse(responseText, userInput);
    } catch (error) {
      console.error('IntentAgentService: Error analyzing intent:', error);
      
      // Default to conversation if there's an error
      return {
        destination: 'CONVERSATION',
        confidence: 0.5,
        reasoning: 'Error occurred during intent analysis. Defaulting to conversation.'
      };
    }
  }
  
  /**
   * Construct the prompt for the intent analysis model
   */
  private static constructPrompt(
    userInput: string,
    editorContext?: {
      currentFile?: string;
      selection?: string;
      cursorPosition?: number;
      editorContent?: Block[];
    }
  ): string {
    // Build context part of the prompt
    let contextInfo = '';
    let contentSummary = '';
    
    if (editorContext) {
      if (editorContext.currentFile) {
        contextInfo += `Current file open in editor: ${editorContext.currentFile}\n`;
      }
      if (editorContext.selection) {
        contextInfo += `Current selection in editor: ${editorContext.selection}\n`;
      }
      if (editorContext.editorContent) {
        contextInfo += `Editor has existing content: ${editorContext.editorContent.length} blocks\n`;
        
        // Generate a basic outline of the document by extracting headings
        try {
          let headings: string[] = [];
          editorContext.editorContent.forEach(block => {
            if (block.type === 'heading') {
              const headingLevel = block.props.level || 1;
              const headingText = block.content
                .filter(item => item.type === 'text')
                .map(item => (item as any).text)
                .join('');
              
              if (headingText) {
                headings.push(`${'#'.repeat(headingLevel)} ${headingText}`);
              }
            }
          });
          
          if (headings.length > 0) {
            contentSummary = `
Document Outline:
${headings.join('\n')}
`;
          } else {
            contentSummary = 'Document does not contain any headings structure.';
          }
        } catch (error) {
          console.error('Error generating document outline:', error);
          contentSummary = 'Error analyzing document structure.';
        }
      }
    }
    
    // Construct the full prompt
    return `
You are an Intent Classification Agent for a flexible content editing application. Your primary task is to determine whether a user's input is a request to directly create or manipulate content within the editor (EDITOR) or if it's a request for information, explanation, or general conversation that should be handled outside the editor (CONVERSATION).

### Application Context:
The user is interacting with a flexible editor environment where they can create and modify various types of content, including research, reports, text, lists, code blocks, summaries, plans, etc. Think of it like a collaborative canvas or document editor.

### Context:
${contextInfo || 'No specific editor context available.'}

${contentSummary ? `### Document Structure:\n${contentSummary}\n` : ''}

### User Input:
${userInput}

### Analysis Guidelines:
Analyze the user's intent based on their input and the editor context. Determine if the user is asking to:

!CRITICAL: If the user is asking about an image or screenshot they have uploaded AND HAVE NOT EXPLICITLY ASKED FOR WEB SEARCH, do not perform any web search. This means "needsWebSearch": false.

1.  **Perform an action *directly* on the editor's content:**
    * Generate new content (text, lists, code, sections, documents, etc.).
    * Add generated content to the editor or inserting into existing content.
    * Modifying, replacing, or rewriting existing content.
    * Deleting content.
    * Reformatting content (e.g., changing style, applying markdown, fixing indentation).
    * Generating structured content based on instructions (e.g., "list the pros and cons", "brainstorm ideas for X", "summarize this section", "expand on this point").
    * Referencing specific files, sections, or elements for modification.
    * **Keywords often indicating EDITOR:** *Write, research, create, add, insert, change, update, modify, delete, remove, replace, rewrite, format, reformat, summarize, expand, list, brainstorm, generate, put, make...* (when followed by content specifics).

2.  **Engage in conversation or seek information:**
    * Asking for explanations or definitions (e.g., "What is Python?", "Explain brainstorming techniques").
    * Asking *how* to do something in the editor or in general (e.g., "How do I add a table?", "How does this feature work?").
    * Asking general knowledge questions.
    * Making general statements or engaging in meta-conversation about the AI or the process.
    * **Keywords often indicating CONVERSATION:** *Explain, tell me about, what is, how do I, can you, why, describe, compare...*

### Web Search Detection:
Also determine if the request would benefit from a web search:

* Factual questions that might require up-to-date information (e.g., "What is the population of Canada?", "Who is the current CEO of Microsoft?")
* Questions about events, news, or trends (e.g., "What are the latest developments in AI?")
* Requests for information about specific entities, concepts, or topics (e.g., "Tell me about quantum computing")
* Requests that include phrases like "search for", "find information about", "look up"
* Requests that involve comparisons, statistics, or data that might not be in the AI's knowledge (e.g., "Compare React vs Angular")

### Operation Classification:
If you determine the destination is EDITOR, also classify the specific operation:
* MODIFY: Change, update, append, add to or enhance existing content while preserving its overall structure.
* EXPAND: Add to or elaborate on a specific section of existing content.
* REPLACE: Completely replace existing content with new content.
* REFORMAT: Change the formatting or organization without substantial content changes.
* DELETE: Remove specific content.
* ADD: Generate new content and add it to the editor without replacing existing content.

### Ambiguity Handling:
* If the user asks *how* to do something (e.g., "How do I make a list?"), lean towards **CONVERSATION**.
* If the user directly commands the action (e.g., "Make a list of action items"), lean towards **EDITOR**.
* If unsure, have a slight bias towards **CONVERSATION** to avoid unintended editor modifications, but use the confidence score to reflect uncertainty.

### CRITICAL RESPONSE FORMAT INSTRUCTIONS:
You MUST respond with a VALID JSON object in the EXACT format shown below:

{
  "destination": "EDITOR",
  "confidence": 0.9,
  "reasoning": "The user is asking to create content directly in the editor.",
  "needsWebSearch": false,
  "searchQuery": "",
  "metadata": {
    "editorAction": "ADD"
  }
}

NOTES ABOUT THE JSON RESPONSE:
- "destination" must be either "EDITOR" or "CONVERSATION" (capitalized)
- "confidence" must be a number between 0 and 1
- "reasoning" must be a brief explanation of your decision
- "needsWebSearch" must be a boolean indicating if this request would benefit from web search
- "searchQuery" should only be populated if needsWebSearch is true, and should contain the core search query
- "metadata" is only required for EDITOR destination and should include editorAction
`;
  }
  
  /**
   * Parse the raw response from the model into a structured result
   */
  private static parseResponse(responseText: string, originalInput: string): IntentAnalysisResult {
    try {
      // Try to parse the JSON response
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        // If the response isn't valid JSON, try to extract just the JSON part
        // This handles cases where the model outputs additional text before/after the JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }
      
      // Validate the parsed result has required fields
      if (!parsed.destination || !parsed.confidence || !parsed.reasoning) {
        throw new Error('Missing required fields in response');
      }
      
      // Ensure destination is one of the valid options
      if (parsed.destination !== 'EDITOR' && parsed.destination !== 'CONVERSATION') {
        parsed.destination = 'CONVERSATION'; // Default to CONVERSATION if invalid
      }
      
      // Ensure confidence is a number between 0 and 1
      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        parsed.confidence = 0.5; // Default to medium confidence if invalid
      }
      
      // Build the result
      const result: IntentAnalysisResult = {
        destination: parsed.destination,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        needsWebSearch: parsed.needsWebSearch === true,
        searchQuery: parsed.needsWebSearch === true ? (parsed.searchQuery || this.extractSearchQuery(originalInput)) : undefined
      };
      
      // Include metadata if it exists and destination is EDITOR
      if (parsed.metadata && result.destination === 'EDITOR') {
        result.metadata = {
          editorAction: parsed.metadata.editorAction || 'CREATE',
          targetFile: parsed.metadata.targetFile,
          position: parsed.metadata.position
        };
      }
      
      return result;
    } catch (error) {
      console.error('IntentAgentService: Error parsing response:', error);
      
      // Fallback to basic analysis
      const result: IntentAnalysisResult = {
        destination: 'CONVERSATION',
        confidence: 0.5,
        reasoning: 'Error parsing response. Defaulting to conversation.'
      };
      
      // Detect if this might be a search query
      const searchPatterns = [
        /what is/i, /who is/i, /where is/i, /when is/i, /why is/i, /how to/i,
        /tell me about/i, /search for/i, /find information/i, /look up/i
      ];
      
      if (searchPatterns.some(pattern => pattern.test(originalInput))) {
        result.needsWebSearch = true;
        result.searchQuery = this.extractSearchQuery(originalInput);
      }
      
      return result;
    }
  }

  /**
   * Extract a search query from user input
   */
  private static extractSearchQuery(userInput: string): string {
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
      const newQuery = query.replace(prefix, '');
      // If we made a replacement, break the loop
      if (newQuery !== query) {
        query = newQuery;
        break;
      }
    }
    
    // Remove question marks and other punctuation at the end
    query = query.replace(/[?!.]+$/, '').trim();
    
    return query;
  }
} 