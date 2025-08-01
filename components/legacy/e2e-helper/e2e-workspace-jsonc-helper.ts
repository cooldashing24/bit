import { assign, parse, stringify } from 'comment-json';
import fs from 'fs-extra';
import * as path from 'path';

import { WORKSPACE_JSONC } from '@teambit/legacy.constants';
import type ScopesData from './e2e-scopes';

// TODO: improve this by combine into a base class shared between this and e2e-bit-json-helper
export default class WorkspaceJsoncHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(bitJsoncDir: string = this.scopes.localPath) {
    const bitJsoncPath = composePath(bitJsoncDir);
    if (fs.existsSync(bitJsoncPath)) {
      const content = fs.readFileSync(bitJsoncPath).toString();
      return parse(content) || {};
    }
    return {};
  }
  readRaw() {
    return fs.readFileSync(composePath(this.scopes.localPath)).toString();
  }
  write(workspaceJsonc: Record<string, any>, bitJsoncDir: string = this.scopes.localPath) {
    const bitJsoncPath = composePath(bitJsoncDir);
    const content = stringify(workspaceJsonc, null, 2);
    return fs.writeFileSync(bitJsoncPath, content);
  }
  addKeyVal(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const workspaceJsonc = this.read(bitJsoncDir);
    // Using this to keep the comments
    const obj = {
      [key]: val,
    };
    const updated = assign(workspaceJsonc, obj);
    this.write(updated, bitJsoncDir);
  }

  addToVariant(
    variant: string,
    key: string,
    val: any,
    replaceExisting = false,
    bitJsoncDir: string = this.scopes.localPath
  ) {
    const workspaceJsonc = this.read(bitJsoncDir);
    const variants = workspaceJsonc['teambit.workspace/variants'] || {};
    const newVariant = replaceExisting ? {} : (variants[variant] ?? {});
    assign(newVariant, { [key]: val });
    this.setVariant(bitJsoncDir, variant, newVariant);
  }

  /**
   * Replace the entire variant config with the provided config.
   * In case you only want to add new extension to variant you probably want to use addToVariant
   * @param bitJsoncDir
   * @param variant
   * @param config
   */
  setVariant(bitJsoncDir: string = this.scopes.localPath, variant: string, config: any) {
    const workspaceJsonc = this.read(bitJsoncDir);
    const variants = workspaceJsonc['teambit.workspace/variants'] || {};
    const newVariant = config;
    assign(variants, { [variant]: newVariant });
    this.addKeyVal('teambit.workspace/variants', variants, bitJsoncDir);
  }

  setPolicyToVariant(variant: string, policy: Record<string, any>) {
    const config = {
      'teambit.dependencies/dependency-resolver': {
        policy,
      },
    };
    this.setVariant(undefined, variant, config);
  }

  addKeyValToWorkspace(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const workspaceJsonc = this.read(bitJsoncDir);
    const workspace = workspaceJsonc['teambit.workspace/workspace'];
    assign(workspace, { [key]: val });
    this.addKeyVal('teambit.workspace/workspace', workspace, bitJsoncDir);
  }

  addKeyValToDependencyResolver(key: string, val: any, bitJsoncDir: string = this.scopes.localPath) {
    const workspaceJsonc = this.read(bitJsoncDir);
    const depResolver = workspaceJsonc['teambit.dependencies/dependency-resolver'];
    assign(depResolver, { [key]: val });
    this.addKeyVal('teambit.dependencies/dependency-resolver', depResolver, bitJsoncDir);
  }

  getPolicyFromDependencyResolver() {
    const workspaceJsonc = this.read();
    const depResolver = workspaceJsonc['teambit.dependencies/dependency-resolver'];
    return depResolver.policy;
  }

  addPolicyToDependencyResolver(policy: Record<string, any>) {
    const currentPolicy = this.getPolicyFromDependencyResolver();
    assign(currentPolicy, policy);
    this.addKeyValToDependencyResolver('policy', currentPolicy);
  }

  addDefaultScope(scope = this.scopes.remote) {
    this.addKeyValToWorkspace('defaultScope', scope);
  }
  getDefaultScope() {
    const workspaceJsonc = this.read();
    const workspace = workspaceJsonc['teambit.workspace/workspace'];
    return workspace.defaultScope;
  }

  setComponentsDir(compDir: string) {
    this.addKeyValToWorkspace('defaultDirectory', compDir);
  }

  setPackageManager(packageManager = 'teambit.dependencies/yarn') {
    this.addKeyValToDependencyResolver('packageManager', packageManager);
  }

  corrupt() {
    const bitJsoncPath = composePath(this.scopes.localPath);
    fs.writeFileSync(bitJsoncPath, '"corrupted');
  }
  disableMissingManuallyConfiguredPackagesIssue() {
    this.addKeyVal('teambit.component/issues', {
      ignoreIssues: ['MissingManuallyConfiguredPackages'],
    });
  }
  disablePreview() {
    this.addKeyVal('teambit.preview/preview', { disabled: true });
  }
  setupDefault() {
    this.disablePreview();
    this.addDefaultScope();
    // otherwise, "bit tag" and "bit status" will always fail with "MissingManuallyConfiguredPackages" for jest/babel
    // until "bit install" is running, because they're coming from the default env.
    this.disableMissingManuallyConfiguredPackagesIssue();
  }
}

function composePath(dir: string): string {
  return path.join(dir, WORKSPACE_JSONC);
}
