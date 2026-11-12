# Editor UI redesign

**Status** · Implemented and verified; awaiting PR review

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
| **T01 · Visual system**  | `done` | • Capture baseline screenshots with synthetic notes<br>• Add shared colors and local fonts<br>• Check 4.5:1 text contrast and 3:1 focus and essential control contrast                                                                                                                             |
| **T02 · Workspace**      | `done` | • Build the explorer, header, and action menus<br>• Test keyboard navigation and focus return<br>• Check action targets and delete confirmation<br>• Run these checks on desktop and at 320 px                                                                                                     |
| **T03 · Editor**         | `done` | • Apply the writing layout<br>• Restyle dialogs, Mermaid, and source fallback<br>• Verify formatting preserves selection<br>• Verify explorer toggles preserve drafts and undo history                                                                                                             |
| **T04 · Release checks** | `done` | • Compare screenshots in both themes<br>• Test slow and failed saves, retries, and conflicts with isolated SQLite<br>• Test navigation and export with unsaved edits in that workspace<br>• Check that untouched Markdown exports byte-for-byte<br>• Check that layout changes send no note writes |

Run the repository’s formatting, type, lint, unit, browser, build, and production checks. Record results and any remaining limits here. [Repository checks](../README.md#checks)

## Verification

### T01 · Visual system

Captured four baseline screenshots using synthetic checklist/code/Mermaid notes in isolated SQLite at 1280 px and 320 px in both system themes (`.cache/ui-baseline/`, ignored). `editor-appearance.spec.ts` regenerates the corresponding current screenshots in `test-results/`; generated images are not committed. Fonts are installed packages bundled by Vite, with no runtime font CDN.

Shared tokens cover surfaces, text, focus, controls, dialogs, recovery, and editor blocks. WCAG relative-luminance calculations across writing, explorer, and selected-row backgrounds give minimum text/muted/accent contrast of 12.46/5.12/6.18 in light and 9.03/5.10/6.47 in dark. Essential control borders measure at least 3.15:1 in light and 3.47:1 in dark; focus uses the accent.

### T02 · Workspace

Implemented the explorer, sticky context header, scoped action disclosures, and empty-folder creation. Keyboard checks at 1280 px and 320 px verify explorer focus/return, menu traversal, modal cancellation, and no writes during those interactions. A failed mobile note load leaves the explorer available; a successful retry closes it and focuses content. Existing real API/SQLite lifecycle checks verify action targets, revision conflicts, deletion cancellation/confirmation, and failed-operation retention. Focused navigation, lifecycle, and export runs pass, including an export that drains newer edits during a delayed save. The complete suite is recorded with T04.

### T03 · Editor

Implemented the centered prose column, aligned title/edit control, compact named formatting icons, shared vector icons, and themed dialogs, source fallback, and Mermaid blocks. Diagram rendering uses application-owned theme tokens while retaining the strict input/SVG safety boundary. System-theme changes discard obsolete previews without editing their source.

Focused browser checks verify screenshots in both themes/widths, draft/undo preservation across explorer toggles/resizing/theme changes, slash insertion, formatting/link selection and focus, and safe source fallback. The mounted toolbar unit test uses accessible-name queries. The final repository checks are recorded with T04.

### T04 · Release checks

Verified on Windows with Node.js 24.18.0 and Chromium. Screenshot review compares the synthetic baseline with the final light/dark writing surfaces at 1280 px and 320 px. Checklist controls align with their text; long breadcrumb paths have bounded scrolling; the measured header height keeps explorer offsets correct; wide code and diagrams scroll inside their blocks.

[Release browser checks](../tests/e2e/editor-release.spec.ts) exercise slow/failed saves, draft retention, retry, conflict recovery from the sticky status, and live diagram theme changes. [Layout checks](../tests/e2e/editor-layout.spec.ts) verify draft/undo retention and zero writes from explorer toggles, resizing, and theme changes. The existing navigation/export suites verify pending-edit flushing and untouched UTF-8 bytes, including BOM, Unicode, and mixed line endings. All persistence and browser tests use isolated temporary SQLite data.

Conflict fixtures require a successful competing API write before entering the stale draft; timing-sensitive explicit-save scenarios pause autosave. Diagram readiness assertions allow bounded cold loading under parallel browser workers. These checks retain real API/database writes and inspect their outcomes.

The title checks exposed editor reattachment during an in-flight title save incorrectly treating an unchanged body as dirty. The coordinator now refreshes the unchanged body's baseline independently of title/request dirtiness. A unit regression reproduces the failure, and a real API/SQLite delayed-editor check verifies one title-only write and one revision increment. Font regression checks also verify that bold-italic prose and italic controls load their local faces without writing the note.

Final checks, 2026-11-12 UTC:

| Check                                         | Result                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`                           | Passed                                                                        |
| `npm run lint`                                | Passed                                                                        |
| `npm run format:check`                        | Passed                                                                        |
| `npm test`                                    | 441 passed across 34 files                                                    |
| `npm run test:e2e`                            | 111 passed with four Chromium workers                                         |
| `npm run build`                               | Passed; existing lazy vendor size warning                                     |
| `npm run test:production`                     | 3 passed: built workflows/restart, configuration failures, and backup/restore |
| Affected documentation links and package JSON | Valid                                                                         |

Remaining limits: verification covers Chromium on Windows, not other browsers or a complete screen-reader/WCAG audit. The existing lazy Mermaid vendor chunks still produce the build's size warning. Generated screenshots remain ignored local artifacts.
