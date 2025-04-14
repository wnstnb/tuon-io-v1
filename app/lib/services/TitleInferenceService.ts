import { OpenAI } from 'openai';

/**
 * Service for inferring titles from content using AI models
 */
export class TitleInferenceService {
  /**
   * Infer a title from the given content using AI models
   * @param content The text content to generate a title for
   * @returns The inferred title or a fallback
   */
  static async inferTitleFromContent(content: string): Promise<string> {
    console.log('TitleInferenceService: Starting title inference process');
    // console.log(`TitleInferenceService: Content length: ${content?.length || 0} chars`);
    
    if (!content?.trim()) {
      console.log('TitleInferenceService: Empty content received, returning "Untitled"');
      return 'Untitled'; // Handle empty input
    }

    // Initialize OpenAI client
    // Try server-side env var first, then client-side
    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('TitleInferenceService: OpenAI API key is not configured');
      return 'Untitled';
    }
    
    let openaiClient: OpenAI | null = null;
    try {
       openaiClient = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true, // Ensure this is acceptable for your security model
      });
      // console.log('TitleInferenceService: OpenAI client initialized.');
    } catch (error) {
       console.error('TitleInferenceService: Error initializing OpenAI client:', error);
       return 'Untitled';
    }

    const modelId = "gpt-4.1-mini-2025-04-14";
    // console.log(`TitleInferenceService: Initialized OpenAI model: ${modelId}`);

    // Limit input size to manage cost/performance
    const maxInputLength = 1000;
    const truncatedContent = content.length > maxInputLength
      ? content.substring(0, maxInputLength) + '...'
      : content;
    // console.log(`TitleInferenceService: Content ${content.length > maxInputLength ? 'truncated' : 'used as is'} - ${truncatedContent.length} chars`);

    const systemPrompt = `Generate a short, concise title (max 5 words) for the following text. The title should be descriptive of the content but brief. Respond *only* with the title itself, no extra text.`;
    const userPrompt = `Text: "${truncatedContent}"\n\nTitle:`;
    // console.log('TitleInferenceService: Prompts constructed, calling OpenAI API...');

    try {
      // console.log('TitleInferenceService: Sending request to OpenAI API');
      const completion = await openaiClient.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 15, // Generous buffer for a short title
        temperature: 0.2, // Lower temperature for more deterministic title
      });
      // console.log('TitleInferenceService: Received response from OpenAI API');
      
      let title = completion.choices[0]?.message?.content?.trim() || '';
      title = title.replace(/^\"|\"$/g, ''); // Clean up potential quotes
      // console.log(`TitleInferenceService: Raw title from API: "${title}"`);

      // Basic post-processing
      if (!title) {
        console.log('TitleInferenceService: Empty title received, using fallback');
        title = 'Untitled'; // Fallback
      }
      
      if (title.length > 60) {
        // console.log(`TitleInferenceService: Title too long (${title.length} chars), truncating`);
        title = title.substring(0, 60); // Ensure reasonable length
      }

      console.log(`TitleInferenceService: Final title: "${title}"`);
      return title;
    } catch (error) {
      console.error("TitleInferenceService: Error inferring title:", error);
      console.error("TitleInferenceService: Error details:", JSON.stringify(error, null, 2));
      return 'Untitled'; // Fallback on error
    }
  }
} 