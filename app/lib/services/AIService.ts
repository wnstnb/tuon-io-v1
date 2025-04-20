// app/lib/services/AIService.ts

// Placeholder for potential future AI-related service functions

/**
 * Calls the backend API to infer a title based on content.
 * 
 * @param contextType - The type of content ('artifact' or 'conversation').
 * @param contextId - The ID of the artifact or conversation.
 * @param contentText - The text content to use for inference.
 * @returns The inferred title string, or null if inference failed or returned no title.
 */
export const AIService = {
  async inferTitle(
    contextType: 'artifact' | 'conversation',
    contextId: string,
    contentText: string
  ): Promise<string | null> {
    if (contentText.length < 20) {
      console.log('[AIService.inferTitle] Skipping due to short content (< 20 chars).');
      return null; // Don't infer if content is too short
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[AIService.inferTitle] Calling API for ${contextType} ${contextId}`);
    }

    try {
      const response = await fetch('/api/infer-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Ensure cookies are sent
        body: JSON.stringify({
          content: contentText,
          contextType: contextType,
          contextId: contextId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.title) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[AIService.inferTitle] API success for ${contextType} ${contextId}, received title: "${data.title}"`);
          }
          return data.title; // Return the inferred title
        } else {
          console.warn(`[AIService.inferTitle] API call succeeded for ${contextType} ${contextId} but returned no title.`);
          return null;
        }
      } else {
        console.error(`[AIService.inferTitle] API call failed for ${contextType} ${contextId}:`, response.status, response.statusText);
        return null;
      }
    } catch (error) {
      console.error(`[AIService.inferTitle] Error during title inference for ${contextType} ${contextId}:`, error);
      return null;
    }
  },

  // ... other AI-related service functions can be added here
}; 