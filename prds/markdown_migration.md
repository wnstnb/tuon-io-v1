# Markdown <-> Editor Conversion Improvement Plan

This document outlines the steps to improve the conversion process between Markdown generated/consumed by the AI agent and the BlockNote editor's JSON format (`Block[]`).

## Goal

Ensure consistent and accurate handling of Markdown according to defined constraints, aligning with the editor's capabilities as defined in `prds/editor_styles.json`.

## Constraints

*   **Bulleted Lists:** Use only a single hyphen followed by a space (`- `).
*   **Indentation:** Use exactly two spaces for nested list indentation.
*   **Headings:** Maximum heading level is 3 (`###`). Levels 4+ should not be used or generated.

## Detailed Steps

1.  **Analyze `CreatorAgentService.convertToBlockNoteFormat` (AI -> Editor):**
    *   **Action:** Read lines ~385-821 in `app/lib/services/CreatorAgentService.ts`.
    *   **Objective:** Understand the current parsing logic for Markdown elements (headings, lists, inline styles, code blocks, quotes, tables, etc.).
    *   **Verification:**
        *   Check list syntax handling (does it accept only `- `?).
        *   Check indentation handling for list nesting.
        *   Check header level mapping and handling of levels > 3.
        *   Identify how other block types (images, links, checklists) are parsed.
        *   Determine if/how non-standard elements (colors) are handled.
        *   Compare output structure against `prds/editor_styles.json`.

2.  **Modify `CreatorAgentService.convertToBlockNoteFormat` (AI -> Editor):**
    *   **Action:** Edit `app/lib/services/CreatorAgentService.ts`.
    *   **Objective:** Update parsing logic to strictly enforce defined constraints and correctly map features to the `Block[]` schema.
    *   **Tasks:**
        *   Enforce `- ` list syntax.
        *   Enforce 2-space indentation for nesting.
        *   Enforce max `###` header level.
        *   Ensure correct `Block[]` mapping for all supported elements.
        *   Add/verify parsing for required block types (checklists, images, links).
        *   Implement handling for non-standard elements (e.g., colors) if necessary.

3.  **Analyze `CreatorAgentService.convertFromBlockNoteFormat` (Editor -> AI):**
    *   **Action:** Read lines ~822-984 in `app/lib/services/CreatorAgentService.ts`.
    *   **Objective:** Confirm the current function extracts plain text with basic structural markers, losing fidelity.

4.  **Rewrite `CreatorAgentService.convertFromBlockNoteFormat` (Editor -> AI):**
    *   **Action:** Edit `app/lib/services/CreatorAgentService.ts`.
    *   **Objective:** Convert `Block[]` structure into well-formatted Markdown adhering to the defined constraints.
    *   **Tasks:**
        *   Generate Markdown output (not plain text).
        *   Ensure output follows `- ` lists, 2-space indents, `###` max headers constraints.
        *   Handle nesting and various block types correctly in the generated Markdown.

5.  **Modify `CreatorAgentService.constructPrompt` (Prompt Engineering):**
    *   **Action:** Edit `app/lib/services/CreatorAgentService.ts` (lines ~193-306).
    *   **Objective:** Instruct the AI model to generate Markdown adhering to the constraints when creating editor content.
    *   **Tasks:**
        *   Locate the instructions for `<editor_content>` formatting (around lines ~230-245).
        *   Add explicit instructions:
            *   "Use only a single hyphen followed by a space (`- `) for bulleted list items."
            *   "Use exactly two spaces for indentation to indicate nested lists."
            *   "Do not use heading levels deeper than 3 (use `#`, `##`, or `###` only)."
        *   Ensure clarity and integration within the existing prompt.
