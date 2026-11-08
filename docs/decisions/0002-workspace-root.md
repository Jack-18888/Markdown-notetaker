# 0002: virtual workspace root and future ownership

**Status:** Accepted for the current single-user contract; persistence behavior is pending T03/T04.

## Decision

Represent the workspace root with null parentId for folders and null folderId for notes. It is a virtual location, not an ordinary folder row. A non-null value references an actual containing folder. Keep this explicit at the API boundary rather than guessing a root from omitted fields.

## Why not create a root folder row now?

A stored root can make child queries uniform and provide a folder-shaped place for root metadata or inherited permissions. It is a valid design when those behaviors are required. It also needs special invariants: initializing/discovering its ID, keeping it parentless, preventing moves/deletion, and distinguishing it from user-created folders. Root renaming/metadata would need product decisions as well.

The current release has one local workspace and no accounts, permissions, or persisted workspace entity. A virtual root needs no bootstrap record and cannot accidentally be moved or deleted. Folder records describe only user-created folders. Keep the smaller model until a requirement justifies a stored root.

## Ownership is a separate boundary

A per-user root folder alone cannot prevent a note or folder from being attached to another user's hierarchy. Multi-user support would require authenticated queries and explicit workspace/owner scoping on every resource, with same-workspace constraints on parent references.

One future option is Workspace(id, ownerId), with workspaceId on folders and notes and parent references scoped to that workspace. Each workspace could still have a virtual root; alternatively it could own a protected root folder. That choice should follow actual sharing/permission requirements. This is a possible future direction, not a schema or auth feature implemented now.

Changing persisted ownership/root representation later would require versioned migrations preserving existing notes. Introduce workspace/ownership records when a scoped multi-user design requires them; the current root representation leaves both future options available.
