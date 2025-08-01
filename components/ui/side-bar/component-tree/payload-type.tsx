import type { ComponentModel } from '@teambit/component';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

export class ScopePayload {
  get isScope() {
    return true;
  }
}

export type PayloadType = ComponentModel | ScopePayload | LaneModel | undefined;
