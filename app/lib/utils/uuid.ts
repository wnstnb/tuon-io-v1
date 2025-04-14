import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a random UUID v4
 * @returns A random UUID string
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Get a persisted UUID from localStorage or generate a new one
 * @param key The localStorage key to use
 * @returns The persisted or newly generated UUID
 */
export function getOrCreateUUID(key: string): string {
  // Only run in browser context
  if (typeof window === 'undefined') {
    return generateUUID();
  }
  
  // Try to get existing UUID from localStorage
  const existingUUID = localStorage.getItem(key);
  
  if (existingUUID) {
    return existingUUID;
  }
  
  // Generate a new UUID
  const newUUID = generateUUID();
  
  // Store it for future use
  localStorage.setItem(key, newUUID);
  
  return newUUID;
} 