/* eslint max-classes-per-file: 0 */
import { fork } from 'child_process';
import hashObj from 'object-hash';
import os from 'os';
import * as path from 'path';
import { isNil, isEmpty, filter } from 'lodash';
import { serializeError } from 'serialize-error';
import uniqid from 'uniqid';
import yn from 'yn';
import { getConfig, setGlobalConfig } from '@teambit/config-store';
import type { CLIArgs } from '@teambit/cli';
import {
  CFG_ANALYTICS_ANONYMOUS_KEY,
  CFG_ANALYTICS_ENVIRONMENT_KEY,
  CFG_ANALYTICS_ERROR_REPORTS_KEY,
  CFG_ANALYTICS_REPORTING_KEY,
  CFG_ANALYTICS_USERID_KEY,
  CFG_USER_EMAIL_KEY,
  CFG_USER_NAME_KEY,
  DEFAULT_BIT_ENV,
} from '@teambit/legacy.constants';
import { analyticsPrompt, errorReportingPrompt } from '@teambit/legacy.cli.prompts';
import { getBitVersionGracefully } from '@teambit/bit.get-bit-version';

const LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  FATAL: 'fatal',
};

class Breadcrumb {
  category: string;
  message: string;
  data: Record<string, any>;

  constructor(category: string, message: string, data: Record<string, any>) {
    this.category = category;
    this.message = message;
    this.data = data;
  }
}
class Analytics {
  static username: string;
  static command: string;
  static release: string;
  static args: CLIArgs;
  static flags: Record<string, any> = {};
  static success = true;
  static nodeVersion: string;
  static os: string;
  static extra: Record<string, any> | null | undefined = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static level: keyof typeof LEVEL;
  static error: Error | string | Record<string, any>;
  static breadcrumbs: Array<Breadcrumb> = [];
  static analytics_usage: boolean;
  static error_usage: boolean;
  static anonymous: boolean;
  static environment: string;

  static getID(): string {
    const id = getConfig(CFG_ANALYTICS_USERID_KEY);
    if (id) return id;
    const newId = uniqid();
    setGlobalConfig(CFG_ANALYTICS_USERID_KEY, newId);
    return newId;
  }

  static promptAnalyticsIfNeeded(): Promise<void> {
    const cmd = process.argv.slice(2);
    function shouldPromptForAnalytics() {
      // do not prompt analytics approval for bit config command (so you can configure it in CI envs)
      if (cmd.length && cmd[0] !== 'config' && !process.env.CI) {
        const analyticsReporting = getConfig(CFG_ANALYTICS_REPORTING_KEY);
        const errorReporting = getConfig(CFG_ANALYTICS_ERROR_REPORTS_KEY);
        return isNil(analyticsReporting) && isNil(errorReporting);
      }
      return false;
    }

    if (shouldPromptForAnalytics()) {
      const uniqId = uniqid();
      if (!getConfig(CFG_ANALYTICS_USERID_KEY)) setGlobalConfig(CFG_ANALYTICS_USERID_KEY, uniqId);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return analyticsPrompt().then(({ analyticsResponse }) => {
        setGlobalConfig(CFG_ANALYTICS_REPORTING_KEY, yn(analyticsResponse));
        if (!yn(analyticsResponse)) {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          return errorReportingPrompt().then(({ errResponse }) => {
            return setGlobalConfig(CFG_ANALYTICS_ERROR_REPORTS_KEY, yn(errResponse));
          });
        }
        return null;
      });
    }
    return Promise.resolve();
  }
  static _maskString(str: string): string {
    return str.replace(/[A-Za-z]/g, 'x');
  }
  static _hashLightly(value: any) {
    switch (typeof value) {
      case 'undefined':
      case 'number':
      case 'boolean':
        return value;
      case 'string':
        return this._maskString(value);
      case 'object':
        if (Array.isArray(value)) return value.map((item) => this._hashLightly(item));
        if (value === null) return value;
        return hashObj(value);
      default:
        return hashObj(value);
    }
  }
  static _hashFlags(flags: Record<string, any>) {
    const hashedFlags = {};
    const definedFlags = filter(flags, (flag) => typeof flag !== 'undefined');
    if (this.anonymous && !isEmpty(definedFlags)) {
      Object.keys(definedFlags).forEach((key) => {
        hashedFlags[key] = this._hashLightly(flags[key]);
      });
      return hashedFlags;
    }
    return definedFlags;
  }
  static _hashArgs(args: CLIArgs): CLIArgs {
    if (!this.anonymous) return args;
    return args.map((arg) => this._hashLightly(arg));
  }
  static init(command: string, flags: Record<string, any>, args: CLIArgs) {
    this.analytics_usage = yn(getConfig(CFG_ANALYTICS_REPORTING_KEY), { default: false });
    // Do not initialize analytics if the user didn't approve it
    if (!this.analytics_usage) return;
    this.anonymous = yn(getConfig(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true });
    this.command = command;
    this.flags = this._hashFlags(flags);
    this.release = getBitVersionGracefully() || 'unknown';
    this.args = this._hashArgs(args);
    this.nodeVersion = process.version;
    this.os = process.platform;
    (this.level as any) = LEVEL.INFO;
    this.username = !this.anonymous
      ? getConfig(CFG_USER_EMAIL_KEY) || getConfig(CFG_USER_NAME_KEY) || os.hostname() || this.getID()
      : this.getID();
    this.error_usage = this.analytics_usage ? true : yn(getConfig(CFG_ANALYTICS_ERROR_REPORTS_KEY), { default: false });
    this.environment = getConfig(CFG_ANALYTICS_ENVIRONMENT_KEY) || DEFAULT_BIT_ENV;
  }

  static sendData(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.analytics_usage || (this.error_usage && !this.success)) {
        const file = path.join(__dirname, 'analytics-sender.js');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const forked = fork(file, { silent: true }); // switch to `false` to debug the child
        // console.log('sending', this.toObject()); // un-comment to see the data sent to Analytics
        forked.send(this.toObject());
        forked.on('message', () => {
          // makes sure the data has been sent to the child.
          // without it, when the message is large, it exits before the child got the complete message
          resolve();
        });
        forked.on('error', (err) => {
          reject(err);
        });
      } else {
        resolve();
      }
    });
  }

  static setError(level: string = LEVEL.ERROR, err: Error): void {
    (this.level as string) = level;
    this.error = serializeError(err);
    this.success = false;
  }

  /**
   * eventually goes to the "ADDITIONAL DATA" section in Sentry
   */
  static setExtraData(key, value) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.extra[key] = value;
  }
  static incExtraDataKey(key, value) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.extra[key]) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.extra[key] += value || 1;
    } else {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.extra[key] = value || 1;
    }
  }
  static hashData(data: any) {
    if (this.anonymous) {
      return hashObj(data);
    }
    return data;
  }
  static addBreadCrumb(category: string, message: string, data?: Record<string, any>) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.breadcrumbs.push(new Breadcrumb(category, message, data));
  }
  static toObject() {
    return {
      username: this.username,
      command: this.command,
      flags: this.flags,
      args: this.args,
      release: this.release,
      extra: this.extra,
      nodeVersion: this.nodeVersion,
      os: this.os,
      level: this.level,
      error: this.error,
      success: this.success,
      breadcrumbs: this.breadcrumbs,
      analytics_usage: this.analytics_usage,
      error_usage: this.analytics_usage,
      environment: this.environment,
    };
  }
}

export { LEVEL, Analytics };
