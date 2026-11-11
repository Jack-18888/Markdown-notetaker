import { Router } from 'express';
import { apiContracts } from '@markdown-note-taker/contracts';
import { validate } from '../workspace/validation.js';
import type { WorkspaceService } from '../workspace/types.js';
import { jsonBody } from './protection.js';

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

  router.post(apiContracts.createFolder.path, jsonBody, (request, response) => {
    const folder = workspace.createFolder(request.body);
    response.status(apiContracts.createFolder.status).json(folder);
  });

  router.patch(
    apiContracts.updateFolder.path,
    jsonBody,
    (request, response) => {
      const { id } = validate(apiContracts.updateFolder.params, request.params);
      const folder = workspace.updateFolder(id, request.body);
      response.status(apiContracts.updateFolder.status).json(folder);
    },
  );

  router.delete(apiContracts.deleteFolder.path, (request, response) => {
    const { id } = validate(apiContracts.deleteFolder.params, request.params);
    workspace.deleteFolder(id);
    response.status(apiContracts.deleteFolder.status).end();
  });

  router.post(apiContracts.createNote.path, jsonBody, (request, response) => {
    const note = workspace.createNote(request.body);
    response.status(apiContracts.createNote.status).json(note);
  });

  router.patch(apiContracts.updateNote.path, jsonBody, (request, response) => {
    const { id } = validate(apiContracts.updateNote.params, request.params);
    const note = workspace.updateNote(id, request.body);
    response.status(apiContracts.updateNote.status).json(note);
  });

  router.delete(apiContracts.deleteNote.path, jsonBody, (request, response) => {
    const { id } = validate(apiContracts.deleteNote.params, request.params);
    workspace.deleteNote(id, request.body);
    response.status(apiContracts.deleteNote.status).end();
  });

  return router;
}
