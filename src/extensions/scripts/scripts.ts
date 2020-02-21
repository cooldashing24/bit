import { Paper } from '../paper';
import { RunCmd } from './run.cmd';
import { Workspace } from '../workspace';
import { Pipe } from './pipe';
import { getTopologicalWalker } from './walker';
import { ExtensionManifest, Harmony } from '../../harmony';
import { ScriptRegistry as Registry } from './registry';
import { Script } from './script';
import { ScriptsOptions } from './scripts-options';

export type ScriptDeps = [Paper, Workspace];

/**
 * default options
 */
const DEFAULT_OPTIONS: ScriptsOptions = {
  concurrency: 4,
  caching: true,
  traverse: 'both'
};

export class Scripts {
  constructor(
    /**
     * Bit's workspace
     */
    private workspace: Workspace,

    /**
     * script registry instance.
     */
    private registry: Registry
  ) {}

  private async buildComponents(components?: string[]) {
    if (components && components.length > 0) {
      const comps = await this.workspace.getMany(components);
      return this.workspace.load(comps.map(comp => comp.id.toString()));
    }

    const modified = await this.workspace.modified();
    const newComps = await this.workspace.newComponents();
    return this.workspace.load(modified.concat(newComps).map(comp => comp.id.toString()));
  }

  /**
   * register a script
   * @param manifest extension manifest
   * @param modulePath relative path of the module within the extension
   * @param name optional script name. can be used to register multiple script from one extension
   */
  register(manifest: ExtensionManifest, modulePath: string, name?: string) {
    this.registry.set(manifest, modulePath, name);
    return this;
  }

  /**
   * builds a pipe from array of definition.
   */
  pipe(raw: string[]) {
    const scripts = raw.map(elm => {
      const [extensionName, scriptName] = elm.split(':');
      const script = this.registry.get(extensionName, scriptName);
      if (script) return script;
      return Script.raw(elm);
    });

    return new Pipe(scripts);
  }

  async run(pipeline: string, components?: string[], options?: Partial<ScriptsOptions>) {
    const resolvedComponents = await this.buildComponents(components);
    // :TODO check if component config is sufficient before building capsules and resolving deps.
    const opts = Object.assign(DEFAULT_OPTIONS, options);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { walk, reporter } = await getTopologicalWalker(resolvedComponents, opts, this.workspace);

    return walk(async ({ component, capsule }) => {
      const config = component.config.extensions.scripts || {};
      // :TODO move both logs to a proper api for reporting missing pipes
      // eslint-disable-next-line no-console
      if (!config[pipeline])
        // eslint-disable-next-line no-console
        return console.warn(`script pipe "${pipeline}" was not defined for component: ${component.id.toString()}`);
      const pipe = this.pipe(config[pipeline]);
      // eslint-disable-next-line no-console
      console.log(`building component ${component.id.toString()}...`);

      return pipe.run(capsule);
    });
  }

  /**
   * provider method for the scripts extension.
   */
  static async provide(config: {}, [cli, workspace]: ScriptDeps, harmony: Harmony<unknown>) {
    const defaultScope = workspace ? workspace.consumer.config.defaultScope : undefined;
    const scripts = new Scripts(workspace, new Registry(harmony, defaultScope || null));
    cli.register(new RunCmd(scripts));
    return scripts;
  }
}
