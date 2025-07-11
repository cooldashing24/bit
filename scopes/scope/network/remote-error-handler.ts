import { LaneNotFound } from '@teambit/legacy.scope-api';
import { CustomError } from '@teambit/legacy.cli.error';
import {
  ComponentNotFound,
  MergeConflictOnRemote,
  ActionNotFound,
  ClientIdInUse,
  ServerIsBusy,
} from '@teambit/legacy.scope';
import { OldClientVersion, PermissionDenied, RemoteScopeNotFound, UnexpectedNetworkError } from './exceptions';
// eslint-disable-next-line complexity
export function remoteErrorHandler(code: number, parsedError: Record<string, any>, remotePath: string, err) {
  switch (code) {
    default:
      return new UnexpectedNetworkError(parsedError ? parsedError.message : err);
    case 127:
      return new ComponentNotFound((parsedError && parsedError.id) || err);
    case 128:
      return new PermissionDenied(remotePath);
    case 129:
      return new RemoteScopeNotFound((parsedError && parsedError.name) || err);
    case 130:
      return new PermissionDenied(remotePath);
    case 131: {
      const idsAndVersionsWithConflicts =
        parsedError && parsedError.idsAndVersionsWithConflicts ? parsedError.idsAndVersionsWithConflicts : [];
      const idsNeedUpdate = parsedError && parsedError.idsNeedUpdate ? parsedError.idsNeedUpdate : [];
      return new MergeConflictOnRemote(idsAndVersionsWithConflicts, idsNeedUpdate);
    }
    case 132:
      return new CustomError(parsedError && parsedError.message ? parsedError.message : err);
    case 133:
      return new OldClientVersion(parsedError && parsedError.message ? parsedError.message : err);
    case 135: {
      return new ActionNotFound((parsedError && parsedError.name) || err);
    }
    case 136: {
      return new ClientIdInUse((parsedError && parsedError.clientId) || err);
    }
    case 137: {
      return new ServerIsBusy(parsedError.queueSize, parsedError.currentExportId);
    }
    case 138: {
      return new LaneNotFound(parsedError.scopeName, parsedError.laneName);
    }
  }
}
