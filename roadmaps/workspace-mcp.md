# Local workspace MCP server

## Goal and scope

Let a trusted local MCP client find, read, and organize saved notes. The first
workflow is to find notes about a project, summarize their decisions, and save
the summary beside them. The workspace stays local and single-user. An MCP
client may pass returned Markdown to its model provider, so setup must explain
what enabling access shares. See the [product requirements](../docs/requirements.md).

Browsing and reading are enabled by default. Explicit write access adds note
and folder creation and note edits, renames, and moves. Folder renames and moves,
permanent deletion, image upload, and bulk mutations are deferred. Moving notes
into an Archive folder provides a reversible cleanup workflow.

## Design

- Add a `stdio` entry point under `apps/server` using the official TypeScript
  MCP SDK. The MCP client starts a local subprocess. The web app and MCP each
  use the same workspace service and SQLite file, with independent connections.
  The web server and browser can be closed while MCP is running. Confirm
  protocol compatibility against the intended local client before choosing the
  SDK version. A client that requires an HTTP endpoint needs a separate access
  and authentication design. See the [MCP stdio guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html)
  and [local runtime design](../docs/architecture/runtime.md).
- Use the app's `DATA_DIR` resolution. Document how to pass a custom directory
  to the subprocess, including when the web app gets its value from `.env`.
  Open an existing, current-schema database. Keep initialization and upgrades
  in the normal app startup path. The MCP startup path should check migration
  history without applying changes and open SQLite in read-only mode unless
  writes are explicitly enabled. Report a missing or incompatible database
  with actionable, sanitized guidance. Close the connection when the client
  disconnects. Update backup guidance to account for both processes.
- Reuse the existing [workspace service](../apps/server/src/workspace/README.md)
  and [shared validation contracts](../packages/contracts/src/index.ts). Add
  bounded listing and literal keyword search to the service and repository,
  using parameterized queries. Keep transport schemas and tool registration in
  the MCP adapter. Use stable IDs, structured results, and sanitized operation
  errors. Reserve stdout for MCP messages and keep note text and search terms
  out of diagnostics. Treat Markdown returned to clients as untrusted data.

## Tool contract

| Tool            | Access | Behavior                                                                                                                                                                                            |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_folder`   | Read   | List direct child folders and note metadata for an explicit folder ID or `null` for the root. Return a bounded page in a deterministic order.                                                       |
| `search_notes`  | Read   | Search titles and saved Markdown for literal text. Omit `folderId` for the whole workspace, use `null` for root notes, or give a folder ID for its direct notes. Return a bounded page of metadata. |
| `get_note`      | Read   | Return the saved raw Markdown, ID, title, folder ID, and revision. Preserve the complete source, including Mermaid fences and local image links.                                                    |
| `create_folder` | Write  | Create a named folder under an explicit parent ID or `null` for the root. Return its ID and committed metadata.                                                                                     |
| `create_note`   | Write  | Create a titled note with optional Markdown under an explicit folder ID or `null` for the root. Return its ID and committed revision.                                                               |
| `update_note`   | Write  | Atomically change any supplied title, destination, or Markdown body. Require the note ID and `expectedRevision` and return the new revision. Omitted fields retain their values.                    |

A stale update returns `REVISION_CONFLICT` with the current revision and leaves
the saved note intact. The agent should re-read and reconsider the edit before
retrying. Create calls follow the existing non-idempotent semantics. If the
outcome is unknown after a disconnect, the client should check for the created
item before trying again. See the [existing API contracts](../docs/api.md).

## Graphite stack

1. **Design** (`codex/workspace-mcp-design`). Review this roadmap as the bottom
   PR on `main`.
2. **Read access**. Add the local entry point, existing-workspace startup,
   `list_folder`, `search_notes`, and `get_note`. Verify with a real stdio
   client and a temporary file-backed SQLite workspace. Test tool discovery,
   pagination, invalid inputs, source fidelity, missing or incompatible
   databases, and operation with the web server stopped.
3. **Opt-in writes**. Add the three mutation tools and document verified client
   setup. Exercise create, edit, rename, move, and reopen durability. Use the
   browser and MCP client against the same temporary database to check races in
   both directions. A stale agent write must fail after a browser save, and a
   stale browser save after an agent edit must preserve the browser draft and
   offer the existing conflict recovery choices. A clean reload must show the
   saved agent edit.

## Verification record

- `npm test` passed all 484 tests. The stdio tests use the official MCP client
  against temporary SQLite workspaces and check both protocol eras, pagination,
  literal search, source fidelity, startup failures, opt-in tool discovery,
  stale revisions, and saved changes after reopening SQLite.
- `npm run test:production` passed all four Chromium tests. The MCP scenario used
  the built server and the browser on the same temporary database. It verified
  conflicts in both directions, retention of the pending browser draft, recovery
  controls, and the committed agent edit after a clean reload. The development
  browser run could not start on its fixed port, so the production suite used
  an available loopback port.
- Codex CLI 0.169.0 discovered three read-only tools and six tools with `--write`
  when launching the built entry point against a temporary workspace. See
  [Codex setup](../docs/architecture/runtime.md#connect-codex-cli).
- `npm run typecheck`, `npm run lint`, and `npm run build` passed. Vite still
  reports the existing large-chunk warning.
