import { Router } from 'express';
import { apiContracts } from '@markdown-note-taker/contracts';
import { validate } from '../workspace/validation.js';
import type { WorkspaceService } from '../workspace/types.js';

/** HTTP adapters use the service; the workspace owns persistence and validation. */
export function workspaceRouter(workspace: WorkspaceService) {
  const router = Router();

  router.get(apiContracts.tree.path, (_request, response) => {
    response.status(apiContracts.tree.status).json(workspace.listTree());
  });

  router.get(apiContracts.getNote.path, (request, response) => {
    const { id } = validate(apiContracts.getNote.params, request.params);
    response.status(apiContracts.getNote.status).json(workspace.getNote(id));
  });

  return router;
}
