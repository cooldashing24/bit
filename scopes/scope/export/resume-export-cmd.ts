import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { ScopeMain } from '@teambit/scope';
import { resumeExport } from './export-scope-components';

export class ResumeExportCmd implements Command {
  name = 'resume-export <export-id> <remotes...>';
  description = 'EXPERIMENTAL. resume failed export';
  extendedDescription = `resume failed export to persist the pending objects on the given remotes.
the export-id is the id the client received in the error message during the failure.
alternatively, exporting to any one of the failed scopes, throws server-is-busy error with the export-id`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  group = 'advanced';
  private = true;
  remoteOp = true;

  constructor(private scope: ScopeMain) {}

  async report([exportId, remotes]: [string, string[]]): Promise<string> {
    const exportedIds = await resumeExport(this.scope.legacyScope, exportId, remotes);
    if (!exportedIds.length) return chalk.yellow('no components were left to persist for this export-id');
    return `the following components were persisted successfully:
${exportedIds.join('\n')}`;
  }
}
