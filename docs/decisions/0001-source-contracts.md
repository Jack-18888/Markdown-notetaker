# 0001: source imports and the contracts package

**Status:** Accepted for the private monorepo; verification scope is recorded in [T02](../../roadmaps/initial-project.md#t02).

## Context

The initial shared package exported generated JavaScript/declarations. That forced a package build before development/tests, needed a compiler watcher, and sent editor navigation to dist declarations. Its name described reuse without explaining what belonged inside it.

## Decision

Use packages/contracts, named @markdown-note-taker/contracts. It contains portable API/document validation schemas, inferred wire types, route descriptors, error definitions, and boundary limits. It is not a general utilities package. Export src/index.ts directly with explicit .ts imports between its source modules.

TypeScript uses noEmit and supports TypeScript import extensions. Vite, Vitest, and tsx consume source during development/tests. Production builds transform the same source into JavaScript: Vite for the browser, esbuild for the backend. The backend bundles contracts and leaves other npm packages external, keeping native/server dependencies out of the browser and out of the portable package.

## Alternatives and consequences

A compiled package with declaration maps could improve source navigation while retaining a publishable JavaScript artifact, but it keeps the prebuild/watch dependency. Conditional source/declaration exports add two resolution paths. This private monorepo does not need either complexity now.

Source exports require a TypeScript-aware runtime or bundler. Consumers cannot treat this package as a separately published plain-JavaScript library. Production must bundle contracts so npm start runs JavaScript without tsx. Reconsider package publication/build outputs if an external consumer appears.

The change replaces the T01 package-consumption workflow, not the stored document format or revision semantics. No persistence migration is involved.
