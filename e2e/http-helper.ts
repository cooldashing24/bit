/* eslint no-console: 0 */
import chalk from 'chalk';
import type { ChildProcess } from 'child_process';
import childProcess from 'child_process';
import rightpad from 'pad-right';

import type { Helper } from '@teambit/legacy.e2e-helper';

const HTTP_TIMEOUT_FOR_MSG = 120000; // 2 min

const HTTP_SERVER_READY_MSG = 'UI server of teambit.scope/scope is listening to port';

export class HttpHelper {
  httpProcess: ChildProcess;
  constructor(private helper: Helper) {}
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = `${this.helper.command.bitBin} start --verbose --log`;
      const cwd = this.helper.scopes.remotePath;
      if (this.helper.debugMode) console.log(rightpad(chalk.green('cwd: '), 20, ' '), cwd); // eslint-disable-line no-console
      if (this.helper.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line
      this.httpProcess = childProcess.spawn(this.helper.command.bitBin, ['start', '--verbose', '--log'], { cwd });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        if (data.includes(HTTP_SERVER_READY_MSG)) {
          if (this.helper.debugMode) console.log('Bit server is up and running');
          resolve();
        }
      });
      let stderrData = '';
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
        stderrData += data.toString();
      });
      this.httpProcess.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
        reject(new Error(`http exited with code ${code}\n${stderrData}`));
      });
    });
  }
  async waitForHttpToPrintMsg(msg: string, timeoutAfter: number = HTTP_TIMEOUT_FOR_MSG) {
    return new Promise((resolve, reject) => {
      // create a timeout to reject promise if not resolved
      const timer = setTimeout(() => {
        reject(new Error(`http exceed the limit of ${timeoutAfter} ms, the message "${msg}" was not received`));
      }, timeoutAfter);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stdout.on('data', (data) => {
        if (data.includes(msg)) {
          clearTimeout(timer);
          resolve(data);
        }
      });
    });
  }
  killHttp() {
    const isWin = process.platform === 'win32';
    if (isWin) {
      if (!this.httpProcess.pid) throw new Error(`httpProcess.pid is undefined`);
      childProcess.execSync(`taskkill /pid ${this.httpProcess.pid.toString()} /f /t`);
    } else {
      this.httpProcess.kill('SIGINT');
    }
  }
  shouldIgnoreHttpError(data: string): boolean {
    const msgToIgnore = ['@rollup/plugin-replace'];
    return msgToIgnore.some((str) => data.startsWith(str));
  }
}
