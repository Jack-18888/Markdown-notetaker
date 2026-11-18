import {
  openDatabase,
  openExistingDatabase,
  type DatabaseOptions,
  type ExistingDatabaseOptions,
} from '../database/open.js';
import { createWorkspaceService } from './service.js';
import type { Workspace } from './types.js';

export type WorkspaceOptions = Pick<
  DatabaseOptions,
  'dataDirectory' | 'busyTimeoutMs'
>;

/** Expose validated operations while retaining ownership of the connection. */
export function openWorkspace(options: WorkspaceOptions = {}): Workspace {
  const databaseOptions: DatabaseOptions = {};
  if (options.dataDirectory !== undefined)
    databaseOptions.dataDirectory = options.dataDirectory;
  if (options.busyTimeoutMs !== undefined)
    databaseOptions.busyTimeoutMs = options.busyTimeoutMs;
  return workspaceFromDatabase(openDatabase(databaseOptions));
}

export function openExistingWorkspace(
  options: ExistingDatabaseOptions = {},
): Workspace {
  return workspaceFromDatabase(openExistingDatabase(options));
}

function workspaceFromDatabase(
  database: ReturnType<typeof openDatabase>,
): Workspace {
  try {
    const service = createWorkspaceService(database);
    return {
      service,
      close() {
        if (database.open) database.close();
      },
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
