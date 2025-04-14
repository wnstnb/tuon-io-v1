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
   * @returns Array of search results
   */
  static async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    try {
      console.log(`SearchService: Searching for "${query}"`);
      const exa = this.initializeClient();
      
      // Perform the search with content extraction
      const result = await exa.searchAndContents(
        query,
        {
          text: true,
          numResults: limit
        }
      );
      
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