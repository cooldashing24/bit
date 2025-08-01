import type { ComponentID } from '@teambit/component';
import type { ExecutionContext } from '@teambit/envs';
import type { GetBitMapComponentOptions } from '@teambit/legacy.bit-map';
import type { PathOsBased } from '@teambit/toolbox.path.path';

import type { BrowserRuntimeSlot } from './bundler.main.runtime';

export type ComponentDir = {
  componentDir?: (
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options?: { relative: boolean }
  ) => PathOsBased | undefined;
};

/**
 * computes the bundler entry.
 */
export async function getEntry(context: ExecutionContext, runtimeSlot: BrowserRuntimeSlot): Promise<string[]> {
  // TODO: refactor this away from here and use computePaths instead
  const slotEntries = await Promise.all(
    runtimeSlot.values().map(async (browserRuntime) => browserRuntime.entry(context))
  );

  const slotPaths = slotEntries.reduce((acc, current) => {
    acc = acc.concat(current);
    return acc;
  });

  return slotPaths;
}
