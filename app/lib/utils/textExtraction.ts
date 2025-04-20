import { type Message } from '../../context/AIContext'; // Assuming Message type is here
import { type Block } from '@blocknote/core';

/**
 * Extracts plain text content from an array of conversation messages.
 * Only considers 'user' and 'assistant' roles.
 * 
 * @param messages - Array of conversation messages.
 * @returns A single string concatenating the text content.
 */
export function extractTextFromMessages(messages: Message[]): string {
  if (!messages) return '';

  return messages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant') // Only user/assistant messages
    .map(msg => msg.content || '') // Get content, default to empty string
    .join('\n\n'); // Join messages with double newline
}

/**
 * Extracts plain text content from BlockNote Block array.
 * Limited to first 5 blocks for performance in title inference.
 * 
 * @param content - Array of BlockNote blocks.
 * @returns A single string concatenating text from the initial blocks.
 */
export function extractTextForInference(content: Block[]): string {
  if (!content) return '';
  
  return content.slice(0, 5).map((block: any) => {
    // Check if content exists AND is an array before mapping
    if (block.content && Array.isArray(block.content)) { 
      return block.content.map((item: any) => item.text || '').join(' ');
    }
    // Also consider if the block itself has direct text content (e.g., heading)
    if (typeof block.content === 'string') {
      return block.content;
    } 
    // Otherwise, return empty string for this block
    return '';
  }).join('\n').trim();
} 