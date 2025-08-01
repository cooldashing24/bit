import { ComponentIdList } from '@teambit/component-id';
import type { RemovedObjectSerialized } from '@teambit/legacy.scope';
import { RemovedObjects, loadScope } from '@teambit/legacy.scope';

export default async function remove({
  path,
  ids,
  force,
  lanes,
}: {
  path: string;
  ids: string[];
  force: boolean;
  lanes: boolean;
}): Promise<RemovedObjectSerialized> {
  const scope = await loadScope(path);
  if (lanes) {
    const removedLanes = await scope.lanes.removeLanes(scope, ids, force);
    const removedObjects = new RemovedObjects({ removedLanes });
    return removedObjects.serialize();
  }
  const bitIds = ComponentIdList.fromStringArray(ids);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const res = await scope.removeMany(bitIds, force);
  return res.serialize();
}
