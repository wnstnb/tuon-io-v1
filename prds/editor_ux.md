# Editor UX Improvement Plan: AI Partial Content Modification

**Goal:** Improve the AI interaction within the editor so that asking the AI to modify or improve a specific section of the content results in only that section being changed, rather than the entire document being overwritten.

## Implementation Plan

### Phase 1: Implement Partial Edits (Single/Contiguous Blocks)

*   **Goal:** Enable AI modification of a single block or adjacent blocks based on user selection or cursor position, without replacing the entire document.
*   **Backend Changes (Conceptual):**
    *   `CreatorAgentService` to accept `targetBlockIds`.
    *   Returns structured JSON: `{ type: 'modification', ... }` for targeted edits, or `{ type: 'full_replace', ... }` for full content generation.
*   **Frontend Changes:**
    1.  **Context Gathering:** Ensure `EditorContext` passed via `AIContext.sendMessage` correctly includes `targetBlockIds` based on BlockNote's selection/cursor state.
    2.  **`AIContext.tsx` Update:** Modify `sendMessage` response handling to differentiate between `modification` and `full_replace` types, dispatching `editor:applyModification` (with structured data) or `editor:setContent` (with full markdown) accordingly.
    3.  **`Editor.tsx` Update:** Add listener for `editor:applyModification`. Implement handler (`handleApplyModification`) to parse the received `newMarkdown` and use `editor.replaceBlocks` with the `targetBlockIds` to apply the specific change. Keep the existing `editor:setContent` handler for full replacements.

### Phase 1.5: Implement Floating Editor Chat Input

*   **Goal:** Display a chat input directly within the editor pane when the main conversation (left) panel is collapsed, providing the same functionality.
*   **Frontend Changes:**
    1.  **State Detection:** Identify or manage the state indicating whether the left panel in `app/editor/page.tsx` is collapsed.
    2.  **Component Strategy:** Decide on creating a new `FloatingChatInput.tsx` or refactoring `ChatInput.tsx`.
    3.  **Replicate Functionality:** Ensure floating input calls `AIContext.sendMessage` with correct `editorContext` (including markdown and `targetBlockIds`).
    4.  **Conditional Rendering:** Render the floating input conditionally in `app/editor/page.tsx`.
    5.  **Styling:** Apply CSS for positioning and appearance.

### Phase 2: Implement Non-Contiguous Block Modifications

*   **Goal:** Extend the partial edit functionality to handle cases where the user wants to modify multiple, separate blocks in one request.
*   **Backend Changes (Conceptual):**
    *   `CreatorAgentService` logic enhanced to detect non-contiguous targets.
    *   Returns a new structure: `{ type: 'multi_modification', modifications: [...] }`.
*   **Frontend Changes:**
    1.  **`AIContext.tsx` Update:** Add logic to `sendMessage` response handling to recognize `type: 'multi_modification'` and dispatch `editor:applyModification` with the array of modifications.
    2.  **`Editor.tsx` Update:** Modify `handleApplyModification` to handle `type: 'multi_modification'`, iterate through the `modifications` array, applying each change sequentially.

## Current Implementation Status (Phase 1 Frontend)

*   **`app/components/Editor.tsx`:**
    *   ✅ Added event listener `editor:applyModification` and handler `handleApplyModification`.
    *   ✅ Updated `editor:requestContent` listener to include `selectedBlockIds` in the response.
    *   ⚠️ Remaining TypeScript errors related to BlockNote `Selection` type generics, temporarily bypassed using `as any`.
*   **`app/components/ChatInput.tsx`:**
    *   ✅ Renamed `requestEditorMarkdown` to `requestEditorContext`.
    *   ✅ Updated `requestEditorContext` to retrieve `selectedBlockIds`.
    *   ✅ Updated `handleSubmit` to pass `selectedBlockIds` in the `EditorContext`.
*   **`app/context/AIContext.tsx`:**
    *   ✅ Updated `sendMessage` response logic to check response `type`.
    *   ✅ Dispatches `editor:applyModification` for `type: 'modification'`.
    *   ✅ Dispatches `editor:setContent` for `type: 'full_replace'` (and as fallback).
    *   ⚠️ Uses `as any` casting for new fields in `creatorResponse` pending backend type updates.

**Next Steps:**

1.  Implement corresponding Phase 1 **backend** changes in `CreatorAgentService`.
2.  Test Phase 1 frontend + backend integration.
3.  Resolve remaining TypeScript errors in `Editor.tsx` related to `Selection` type.
4.  Proceed with Phase 1.5 implementation.
