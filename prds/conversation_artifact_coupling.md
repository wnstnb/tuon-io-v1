# Conversation and Artifact Coupling Requirements

## Summary

The core idea is to tightly couple conversations with artifacts (e.g., code files, documents).

- **Creation:** Creating a new artifact automatically creates a new conversation, and vice versa.
- **Artifact Pane:** Every new conversation will feature a dedicated pane for the associated artifact.
- **Archiving:** Users can archive conversations related to an artifact.
- **Contextual Chaining:** Archived conversations can be fed as context into *new* conversations pertaining to the *same* artifact. This allows iterative development on an artifact while preserving historical context.
    - Multiple archived conversations can be used as context simultaneously (their summaries will be provided).
- **Editor Context:** The current content of the artifact editor must also be available as context for the agent during interactions.

## Feasibility Analysis (Based on Code Scan)

1.  **Conversation & Artifact Management:**
    *   The application already has distinct services and context management for both `Conversations` (`AIContext.tsx`, `ConversationService.ts`) and `Artifacts` (`editor/page.tsx`, `ArtifactService.ts`). This provides a solid foundation.
    *   **Feasibility:** High. We can build upon existing structures.

2.  **Coupling Conversations and Artifacts:**
    *   There's a basic link (`artifactId` on `Message`), but a stronger, direct link between a `Conversation` and an `artifactId` is required. **Action:** Implement a DB migration to add `artifact_id` to the `Conversations` table/schema. (DONE)
    *   **Requirement:** The coupling must be bidirectional and reflected in the UI:
        *   **New Conversation -> New Artifact:** Creating a *new* conversation (without an existing artifact context) must automatically create a new, linked artifact. The UI should navigate to show both the new conversation and the new artifact editor.
        *   **New Artifact -> New Conversation:** Creating a *new* artifact must automatically create a new, linked conversation. The UI should navigate to show both the new artifact editor and the new conversation. (Partially DONE via FAB)
        *   **Select Conversation -> Load Artifact:** Selecting an existing conversation in the UI must automatically load its linked artifact into the editor view.
        *   **Load Artifact -> Select Conversation:** Loading an artifact into the editor view (e.g., via URL) must automatically select its linked conversation in the conversation view.
    *   Logic needs to be added/verified for these automatic creation and selection processes.
    *   The UI (`LeftPane.tsx` shows tabs) suggests the structure can accommodate an "Artifact Pane" linked to the current conversation, but the specific data flow and navigation triggers between the chat context (`AIContext`) and the editor page (`EditorPageContent`) need implementation.
    *   **Feasibility:** Medium-High. Requires modifications to creation logic, navigation handling, and state synchronization between `AIContext` and `EditorPageContent`.

3.  **Archiving Conversations:**
    *   No explicit archiving feature exists currently.
    *   This would require adding an `isArchived` status to Conversations (database and frontend models), UI elements for archiving, and updating `loadUserConversations` in `AIContext.tsx` to handle the display of archived vs. active conversations.
    *   **Feasibility:** Medium. Standard feature implementation involving database, services, and UI.

4.  **Context Chaining (Archived Conversations):**
    *   The `sendMessage` function in `AIContext.tsx` currently builds context from the *active* conversation history.
    *   **Action:** Implement the mechanism for context chaining. This involves:
        *   Building a UI component/logic for the user to select *which* archived conversations (linked to the current artifact) should be included.
        *   Implementing a summarization mechanism (e.g., a dedicated summarizer agent call) for these selected archived conversations.
        *   Modifying `sendMessage` to fetch these summaries and incorporate them into the context sent to the `CreatorAgentService`.
    *   **Feasibility:** Medium-Low. This is the most complex part, involving new UI, new AI calls for summarization, and significant modification to the context preparation logic. Careful consideration of context window limits will be needed.

5.  **Editor Context:**
    *   The system seems prepared for this. `sendMessage` already accepts `editorContext`, and `editor/page.tsx` appears to have mechanisms (`onContentAccessRequest`) to provide its state.
    *   **Action:** Build/verify the mechanism to reliably feed the current editor content into the prompt context when `sendMessage` is called. Ensure the wiring between `EditorPageContent` and `AIContext` correctly passes this data.
    *   **Feasibility:** High. Likely involves ensuring the existing wiring is correctly utilized and potentially minor adjustments.

**Overall Conclusion:**

The core features are feasible, building on the existing architecture. Tightly coupling conversations and artifacts, implementing archiving, and especially the context chaining with summaries will require the most significant development effort. 