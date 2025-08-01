import type { ComponentStatusLegacy } from './component-status-loader';

export type ModifyInfo = {
  hasModifiedFiles: boolean;
  hasModifiedDependencies: boolean;
};

export class ComponentStatus {
  constructor(
    /**
     * is the component modified.
     */
    readonly modifyInfo: ModifyInfo,

    /**
     * is the new component new.
     */
    readonly isNew: boolean,

    /**
     * is the component deleted from the workspace.
     */
    readonly isDeleted: boolean,

    /**
     * is the component staged.
     */
    readonly isStaged: boolean,

    /**
     * does the component exists in the workspace.
     */
    readonly isInWorkspace: boolean,

    /**
     * does the component exists in the scope.
     */
    readonly isInScope: boolean,

    /**
     * does the component is outdated (pending for update).
     */
    readonly isOutdated: boolean,

    /**
     * @deprecated this was relevant for legacy only. can be deleted if it's not used elsewhere
     * the component is not authored and not imported.
     */
    readonly nested?: boolean
  ) {}

  static fromLegacy(status: ComponentStatusLegacy, hasModifiedDependencies: boolean, isOutdated: boolean) {
    const modify: ModifyInfo = {
      hasModifiedFiles: !!status.modified,
      hasModifiedDependencies,
    };
    return new ComponentStatus(
      modify,
      !!status.newlyCreated,
      !!status.deleted,
      !!status.staged,
      !status.notExist,
      !status.missingFromScope,
      isOutdated
    );
  }
}
