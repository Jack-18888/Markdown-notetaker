# Workspace navigation

The [workspace client](../../apps/web/src/workspace/api.ts) loads tree metadata separately from note detail, checks shared runtime schemas, verifies note identity, and accepts only public error envelopes with matching HTTP statuses. Network/protocol errors use fixed user-facing messages. Reads disable browser caching and accept cancellation signals. The UI and selected-note workflow are being added in T07.

The [hierarchy index](../../apps/web/src/workspace/tree.ts) rejects duplicate IDs, missing parents, and cycles before navigation renders them. It builds parent/child maps iteratively so validation does not recurse through deep folder paths. The root has a null folder ID; selection and expansion use resource IDs, never labels.

Navigation ordering is folders first, then notes. Each group sorts by label using an English numeric, case-insensitive collator; ties use the original spelling and then the resource ID. This is a display policy, not a persistence order. Duplicate names remain distinct resources. Breadcrumbs follow parent IDs from root to the selected resource's folder.

[Client tests](../../apps/web/src/workspace/__test__/api.test.ts) verify validation, identity, cancellation options, and safe failures. [Hierarchy tests](../../apps/web/src/workspace/__test__/tree.test.ts) cover nesting, ordering, duplicate labels, and invalid references. Real API/browser checks belong to the completed navigation workflow.
