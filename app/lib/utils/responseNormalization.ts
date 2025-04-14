import { AIModelType } from '../../context/AIContext';

/**
 * Common metadata structure for standardized response tracking
 */
export interface ResponseMetadata {
  // Standard fields across all models
  response_time_ms: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  model_version?: string;
  status: 'success' | 'error';
  error?: {
    code: string;
    message: string;
  };
  cost?: number;
  
  // Version tracking
  metadata_version: string;
  
  // Model-specific data
  openai_specific?: any;
  gemini_specific?: any;
  
  // For any additional fields
  [key: string]: any;
}

/**
 * Extract performance metadata from an OpenAI API response
 * @param response The raw OpenAI API response
 * @param startTime Request start time timestamp
 * @returns Normalized metadata
 */
export function extractOpenAIMetadata(response: any, startTime: number): ResponseMetadata {
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  
  // Base metadata structure
  const metadata: ResponseMetadata = {
    response_time_ms: responseTime,
    status: 'success',
    metadata_version: '1.0'
  };
  
  // If we have a valid response with usage data
  if (response && response.usage) {
    metadata.prompt_tokens = response.usage.prompt_tokens;
    metadata.completion_tokens = response.usage.completion_tokens;
    metadata.total_tokens = response.usage.total_tokens;
    
    // Calculate approximate cost (based on current OpenAI pricing)
    // These rates should be stored in a configuration and updated as pricing changes
    let cost = 0;
    if (response.model.includes('gpt-4o')) {
      cost = (response.usage.prompt_tokens * 0.00001) + 
             (response.usage.completion_tokens * 0.00003);
    } else if (response.model.includes('gpt-3.5')) {
      cost = (response.usage.prompt_tokens * 0.000001) + 
             (response.usage.completion_tokens * 0.000002);
    }
    metadata.cost = cost;
  }
  
  // Add model information
  metadata.model_version = response?.model;
  
  // Store OpenAI specific data
  metadata.openai_specific = {
    organization: response?.organization,
    system_fingerprint: response?.system_fingerprint,
    finish_reason: response?.choices?.[0]?.finish_reason
  };
  
  return metadata;
}

/**
 * Extract performance metadata from a Gemini API response
 * @param response The raw Gemini API response
 * @param startTime Request start time timestamp
 * @returns Normalized metadata
 */
export function extractGeminiMetadata(response: any, startTime: number): ResponseMetadata {
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  
  // Base metadata structure
  const metadata: ResponseMetadata = {
    response_time_ms: responseTime,
    status: 'success',
    metadata_version: '1.0'
  };
  
  // For Gemini, token counts are different fields
  if (response && response.usageMetadata) {
    metadata.prompt_tokens = response.usageMetadata.promptTokenCount;
    metadata.completion_tokens = response.usageMetadata.candidatesTokenCount;
    metadata.total_tokens = 
      (response.usageMetadata.promptTokenCount || 0) + 
      (response.usageMetadata.candidatesTokenCount || 0);
    
    // Calculate approximate cost (based on current Gemini pricing)
    let cost = 0;
    if (response.model.includes('gemini-1.5-pro')) {
      cost = (metadata.total_tokens || 0) * 0.00000375; // $0.00375 per 1K tokens
    } else if (response.model.includes('gemini-1.0-pro')) {
      cost = (metadata.total_tokens || 0) * 0.0000025; // $0.0025 per 1K tokens
    }
    metadata.cost = cost;
  }
  
  // Add model information
  metadata.model_version = response?.model;
  
  // Store Gemini specific data
  metadata.gemini_specific = {
    finish_reason: response?.candidates?.[0]?.finishReason,
    safety_ratings: response?.candidates?.[0]?.safetyRatings,
    block_reason: response?.promptFeedback?.blockReason
  };
  
  return metadata;
}

/**
 * Process an API response based on the model type
 * @param modelType The AI model type
 * @param response The raw API response
 * @param startTime Request start time timestamp
 * @returns Normalized metadata
 */
export function processApiResponse(
  modelType: AIModelType,
  response: any,
  startTime: number
): { metadata: ResponseMetadata, rawResponse: any } {
  // Extract appropriate metadata based on model type
  let metadata: ResponseMetadata;
  
  if (modelType.startsWith('gpt')) {
    metadata = extractOpenAIMetadata(response, startTime);
  } else if (modelType.startsWith('gemini')) {
    metadata = extractGeminiMetadata(response, startTime);
  } else {
    // Generic fallback for unsupported models
    metadata = {
      response_time_ms: Date.now() - startTime,
      status: 'success',
      metadata_version: '1.0'
    };
  }
  
  return {
    metadata,
    rawResponse: response
  };
}

/**
 * Process an API error
 * @param modelType The AI model type
 * @param error The error object
 * @param startTime Request start time timestamp
 * @returns Error metadata
 */
export function processApiError(
  modelType: AIModelType,
  error: any,
  startTime: number
): ResponseMetadata {
  return {
    response_time_ms: Date.now() - startTime,
    status: 'error',
    error: {
      code: error.code || 'unknown_error',
      message: error.message || 'An unknown error occurred'
    },
    metadata_version: '1.0'
  };
} 