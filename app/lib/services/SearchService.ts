import Exa from 'exa-js';

// Define the expected shape of Exa search result items
interface ExaSearchResult {
  title?: string;
  url: string;
  text?: string;
  content?: string;
  score?: number;
}

/**
 * Interface for search results
 */
export interface SearchResult {
  title: string;
  url: string;
  text: string;
  score?: number;
}

/**
 * Interface for the full Exa search response
 */
export interface ExaSearchFullResponse {
  results: ExaSearchResult[];
  requestId?: string;
  costDollars?: any;
  [key: string]: any; // Allow for any additional fields
}

// --- ADDED: Interfaces for Exa Answer Response --- 
interface Citation {
  id: string;
  title?: string;
  url: string;
  author?: string;
  publishedDate?: string;
  text?: string; // Included if requested with text: true
}

interface ExaAnswerResponse {
  answer: string;
  citations: Citation[];
}
// --- END --- 

/**
 * Service for performing web searches using Exa
 */
export class SearchService {
  private static exaClient: any = null;

  /**
   * Initialize the Exa client
   */
  private static initializeClient() {
    if (!this.exaClient) {
      const apiKey = process.env.NEXT_PUBLIC_EXASEARCH_API_KEY;
      if (!apiKey) {
        console.error('SearchService: No Exa API key found');
        throw new Error('Exa API key is required');
      }
      
      this.exaClient = new Exa(apiKey);
      console.log('SearchService: Initialized Exa client');
    }
    return this.exaClient;
  }

  /**
   * Perform a web search using Exa
   * @param query The search query
   * @param limit Optional limit of results to return
   * @param returnFullResponse Whether to return the full API response
   * @returns Array of search results or full response object
   */
  static async search(query: string, limit: number = 5, returnFullResponse: boolean = false): Promise<SearchResult[] | ExaSearchFullResponse> {
    try {
      console.log(`SearchService: Searching for "${query}"`);
      const exa = this.initializeClient();
      
      // Perform the search with content extraction
      const result = await exa.searchAndContents(
        query,
        {
          text: true,
          livecrawl: "always",
          numResults: limit
        }
      );
      
      // Return full response if requested
      if (returnFullResponse && result) {
        return result as ExaSearchFullResponse;
      }
      
      // Map to standardized result format
      if (result && result.results) {
        return result.results.map((item: ExaSearchResult) => ({
          title: item.title || 'No title',
          url: item.url,
          text: item.text || item.content || 'No content available',
          score: item.score
        }));
      }
      
      return [];
    } catch (error) {
      console.error('SearchService: Error searching with Exa:', error);
      throw error;
    }
  }

  /**
   * Perform a search using Exa's /answer endpoint via fetch and return the full response.
   * @param query The search query
   * @returns Object containing the answer and citations, or null if request fails or response is invalid.
   */
  static async performExaAnswerSearch(query: string): Promise<ExaAnswerResponse | null> {
    console.log(`SearchService: Performing Exa Answer search for "${query}" using fetch.`);
    const apiKey = process.env.NEXT_PUBLIC_EXASEARCH_API_KEY;
    const apiUrl = "https://api.exa.ai/answer"; // Exa Answer endpoint

    if (!apiKey) {
      console.error('SearchService: Missing Exa API Key (NEXT_PUBLIC_EXASEARCH_API_KEY) for fetch call.');
      throw new Error('Exa API key is required for Exa Answer search.');
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          // Add other headers if required by Exa
        },
        body: JSON.stringify({
          query: query,
          text: true // Request citation text
        })
      });

      if (!response.ok) {
        // Log more details on failure
        const errorBody = await response.text();
        console.error(`SearchService: Exa Answer API request failed with status ${response.status}. Body: ${errorBody}`);
        throw new Error(`Exa Answer API request failed: ${response.statusText}`);
      }

      const data: ExaAnswerResponse = await response.json();

      // Validate the received data structure
      if (data && typeof data.answer === 'string' && Array.isArray(data.citations)) {
        console.log("SearchService: Received valid Exa Answer response structure.");
        return data;
      } else {
        console.error('SearchService: Invalid response structure received from Exa Answer API:', data);
        return null; // Indicate invalid structure
      }

    } catch (error) {
      console.error('SearchService: Error during Exa Answer fetch request:', error);
      // Depending on requirements, you might return null or re-throw
      // throw error; // Re-throw if the caller should handle it
      return null; // Return null to indicate failure
    }
  }

  /**
   * Formats search results into a readable text format
   * @param results The search results
   * @returns Formatted string of results
   */
  static formatResults(results: SearchResult[]): string {
    if (!results || results.length === 0) {
      return "No search results found.";
    }
    
    return results.map((result, index) => {
      const snippetLength = 150;
      const snippet = result.text.length > snippetLength 
        ? result.text.substring(0, snippetLength) + '...' 
        : result.text;
        
      return `[${index + 1}] ${result.title}\n${result.url}\n${snippet}\n`;
    }).join('\n');
  }
} 