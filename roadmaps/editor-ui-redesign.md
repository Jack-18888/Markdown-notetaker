# Editor UI redesign

**Status** · Proposed for review

Give the note a centered writing column, make folders easy to scan, and keep save status visible while scrolling. Take cues from MarkText’s single editing canvas and Obsidian’s compact file explorer. Reuse the current editor, Markdown conversion, save coordinator, API, and local storage. [MarkText](https://github.com/marktext/marktext#features) · [Obsidian](https://obsidian.md/help/plugins/file-explorer) · [Product requirements](../docs/requirements.md)

## Mockups

### Desktop · light theme

![Desktop editor with a folder explorer, centered release checklist, formatting toolbar, and visible save status](editor-ui-redesign/desktop.png)

### Mobile · dark theme

![Mobile editor with the explorer collapsed, a Folders button, and the same checklist in dark mode](editor-ui-redesign/mobile.png)

## Design

- **Explorer.** Use a 256 px sidebar with independent scrolling. Put **New note** and **New folder** above the tree. Group import and refresh under **Workspace actions**. Highlight the current note and expand its ancestors.
- **Header.** Keep breadcrumbs, save status, and **Note actions** within reach. Group save, rename, move, export, and delete in that menu. Keep **Edit title** beside the title. Use folder actions and a direct-child list in folder views.
- **Editor.** Center prose at about 66 characters per line. Align the title, compact toolbar, and body. Keep slash insertion, keyboard shortcuts, Mermaid editing, and the selectable Markdown fallback. Give empty folders a **New note** action.
- **Save recovery.** Show saved, unsaved, and saving states in the sticky header. When a save fails or conflicts, link the header status to the existing retry or recovery controls.
- **Mobile.** At 760 px and below, start with the explorer closed. **Folders** opens a scrollable panel and moves focus into it. Escape or close returns focus to the toggle. Selecting a note moves focus to the content after a successful load. At 320 px, wrap titles and controls and contain wide code and diagrams.
- **Style.** Follow the system theme. Use Instrument Sans for controls and titles, Spectral for prose, and IBM Plex Mono for code. Use shared styles for dialogs, menus, and editor blocks. Give icon buttons accessible names and visible focus.

| Color            | Light     | Dark      |
| ---------------- | --------- | --------- |
| Writing surface  | `#FCFCFA` | `#191C24` |
| Explorer         | `#F0F2F7` | `#202531` |
| Text             | `#212634` | `#E7EAF3` |
| Accent and focus | `#324EAA` | `#B6C6FF` |
| Selected row     | `#E4E9FA` | `#303C5E` |

## Implementation

| Task                     | Status | Done when                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T01 · Visual system**  | `todo` | • Capture baseline screenshots with synthetic notes<br>• Add shared colors and local fonts<br>• Check 4.5:1 text contrast and 3:1 focus and essential control contrast                                                                                                                             |
| **T02 · Workspace**      | `todo` | • Build the explorer, header, and action menus<br>• Test keyboard navigation and focus return<br>• Check action targets and delete confirmation<br>• Run these checks on desktop and at 320 px                                                                                                     |
| **T03 · Editor**         | `todo` | • Apply the writing layout<br>• Restyle dialogs, Mermaid, and source fallback<br>• Verify formatting preserves selection<br>• Verify explorer toggles preserve drafts and undo history                                                                                                             |
| **T04 · Release checks** | `todo` | • Compare screenshots in both themes<br>• Test slow and failed saves, retries, and conflicts with isolated SQLite<br>• Test navigation and export with unsaved edits in that workspace<br>• Check that untouched Markdown exports byte-for-byte<br>• Check that layout changes send no note writes |

Run the repository’s formatting, type, lint, unit, browser, build, and production checks. Record results and any remaining limits here. [Repository checks](../README.md#checks)
