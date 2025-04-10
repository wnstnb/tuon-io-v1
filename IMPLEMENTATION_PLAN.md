# Creator Agent Implementation Plan

## Overview

The Creator Agent is responsible for determining whether AI responses should be displayed in the conversation pane or populated into the editor. It works in conjunction with the existing Intent Analyzer to provide a seamless experience.

## Components

1. **Intent Analyzer Service (existing):**
   - Determines the high-level intent: `EDITOR` or `CONVERSATION`
   - Provides confidence score and reasoning for the decision

2. **Creator Agent Service (new):**
   - Takes the Intent Analyzer output and generates appropriate content
   - Formats responses according to the desired destination
   - Handles the conversion between text format and BlockNote editor format

3. **AI Context Integration:**
   - Coordinates the flow between user input, intent analysis, and creator agent
   - Dispatches content to the appropriate destination

4. **Editor Component Integration:**
   - Listens for content updates from the creator agent
   - Renders AI-generated content in the editor when appropriate

## Implementation Steps

### 1. Creator Agent Service Creation ✅

- Create a new service file `app/lib/services/CreatorAgentService.ts`
- Implement the main functionality:
  - Process requests based on intent analysis
  - Format responses for conversation and/or editor
  - Convert between text and BlockNote formats

### 2. AI Context Integration ✅

- Update `app/context/AIContext.tsx` to:
  - Import and use the Creator Agent Service
  - Pass user input, intent analysis, and conversation context to the agent
  - Handle the dual-destination response (chat + editor)
  - Dispatch editor content updates through a custom event

### 3. Editor Component Integration ✅

- Update `app/components/Editor.tsx` to:
  - Listen for editor content update events
  - Render AI-generated content when received
  - Manage state for AI-provided content vs. user edits

### 4. Testing and Refinement

- Test various scenarios:
  - Conversation-only requests (questions, explanations)
  - Editor-only content generation (create a list, table, etc.)
  - Mixed requests (explain and create)
- Refine prompts and response handling based on test results

### 5. BlockNote Format Handling

- Enhance the text-to-BlockNote conversion:
  - Support for more complex formatting (tables, code blocks, etc.)
  - Maintain formatting when converting back from BlockNote to text
  - Handle special case formatting needed for specific content types

### 6. UI/UX Enhancements

- Add visual indicators when content is being sent to the editor
- Provide feedback when the AI is working on editor content
- Consider animations or transitions for content appearing in the editor

## Data Flow

```
User Input
   ↓
Intent Analyzer
   ↓
Creator Agent
   ↓
   ├─→ Conversation Pane (chat response)
   └─→ Editor (formatted content)
```

## Testing Scenarios

1. **Conversation-only:**
   - "What is the capital of France?"
   - "Explain how blockchain works."
   - "Can you help me brainstorm ideas?"

2. **Editor-only:**
   - "Create a list of the top 10 programming languages."
   - "Write a short story about a robot."
   - "Make a comparison table of database technologies."

3. **Mixed:**
   - "Explain what recursion is and provide a code example."
   - "Help me plan a vacation itinerary and create a schedule."
   - "Analyze this poem and highlight the key themes."

## Key Considerations

- **Error Handling:** Graceful fallbacks if content parsing fails
- **Performance:** Minimize latency when processing large responses
- **State Management:** Clear separation between AI and user content
- **Responsiveness:** Visual feedback during processing

## Future Enhancements

- Allow users to toggle between editor and conversation modes
- Implement content revision suggestions in the editor
- Add support for multiple content sections or documents
- Provide more structured editor templates based on content type 