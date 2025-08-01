import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import pMapSeries from 'p-map-series';
import type { LaneId } from '@teambit/lane-id';
import type { IssuesList } from '@teambit/component-issues';
import { IssuesClasses } from '@teambit/component-issues';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { LanesMain } from '@teambit/lanes';
import { LanesAspect } from '@teambit/lanes';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { Component, InvalidComponent } from '@teambit/component';
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect } from '@teambit/remove';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { ComponentsPendingImport } from '@teambit/legacy.consumer';
import { ComponentsList } from '@teambit/legacy.component-list';
import type { ModelComponent } from '@teambit/objects';
import type { InsightsMain } from '@teambit/insights';
import { InsightsAspect } from '@teambit/insights';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import type { IssuesMain } from '@teambit/issues';
import { IssuesAspect } from '@teambit/issues';
import { StatusCmd } from './status-cmd';
import { StatusAspect } from './status.aspect';
import type { MiniStatusOpts } from './mini-status-cmd';
import { MiniStatusCmd } from './mini-status-cmd';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { MergingMain } from '@teambit/merging';
import { MergingAspect } from '@teambit/merging';
import type { StatusFormatterOptions } from './status-formatter';
import { formatStatusOutput } from './status-formatter';

type DivergeDataPerId = { id: ComponentID; divergeData: SnapsDistance };
const BEFORE_STATUS = 'fetching status';

export type StatusResult = {
  newComponents: ComponentID[];
  modifiedComponents: ComponentID[];
  stagedComponents: { id: ComponentID; versions: string[] }[];
  componentsWithIssues: { id: ComponentID; issues: IssuesList }[];
  importPendingComponents: ComponentID[];
  autoTagPendingComponents: ComponentID[];
  invalidComponents: { id: ComponentID; error: Error }[];
  locallySoftRemoved: ComponentID[];
  remotelySoftRemoved: ComponentID[];
  outdatedComponents: { id: ComponentID; headVersion: string; latestVersion?: string }[];
  mergePendingComponents: DivergeDataPerId[];
  componentsDuringMergeState: ComponentID[];
  softTaggedComponents: ComponentID[];
  snappedComponents: ComponentID[];
  pendingUpdatesFromMain: DivergeDataPerId[];
  updatesFromForked: DivergeDataPerId[];
  unavailableOnMain: ComponentID[];
  currentLaneId: LaneId;
  forkedLaneId?: LaneId;
  workspaceIssues: string[];
  localOnly: ComponentID[];
};

export type MiniStatusResults = {
  modified: ComponentID[];
  newComps: ComponentID[];
  compWithIssues?: Component[];
};

export class StatusMain {
  constructor(
    private workspace: Workspace,
    private issues: IssuesMain,
    private insights: InsightsMain,
    private remove: RemoveMain,
    private lanes: LanesMain,
    private logger: Logger,
    private merging: MergingMain
  ) {}

  async status({
    lanes,
    ignoreCircularDependencies,
  }: {
    lanes?: boolean;
    ignoreCircularDependencies?: boolean;
  }): Promise<StatusResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    this.logger.setStatusLine(BEFORE_STATUS);
    const loadOpts = {
      loadDocs: false,
      loadCompositions: false,
    };
    const { components: allComps, invalidComponents: allInvalidComponents } =
      await this.workspace.listWithInvalid(loadOpts);
    const consumer = this.workspace.consumer;
    const laneObj = await this.workspace.getCurrentLaneObject();
    const componentsList = new ComponentsList(this.workspace);
    const newComponents: ConsumerComponent[] = (await componentsList.listNewComponents(
      true,
      loadOpts
    )) as ConsumerComponent[];
    const modifiedComponents = await this.workspace.modified(loadOpts);
    const stagedComponents: ModelComponent[] = await componentsList.listExportPendingComponents(laneObj);
    await this.addRemovedStagedIfNeeded(stagedComponents);
    const stagedComponentsWithVersions = await pMapSeries(stagedComponents, async (stagedComp) => {
      const id = stagedComp.toComponentId();
      const fromWorkspace = this.workspace.getIdIfExist(id);
      const versions = await stagedComp.getLocalTagsOrHashes(consumer.scope.objects, fromWorkspace);
      return {
        id,
        versions,
      };
    });

    const unavailableOnMain = await this.workspace.getUnavailableOnMainComponents();
    const autoTagPendingComponentsIds = await this.workspace.listAutoTagPendingComponentIds();
    const locallySoftRemoved = await componentsList.listLocallySoftRemoved();
    const remotelySoftRemoved = await componentsList.listRemotelySoftRemoved();
    const importPendingComponents = allInvalidComponents
      .filter((c) => c.err instanceof ComponentsPendingImport)
      .map((i) => i.id);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const invalidComponents = allInvalidComponents.filter((c) => !(c.error instanceof ComponentsPendingImport));
    const divergeInvalid = await this.divergeDataErrorsToInvalidComp(allComps);
    invalidComponents.push(...divergeInvalid);
    const idsDuringMergeState = componentsList.listDuringMergeStateComponents();
    const mergePendingComponents = await this.merging.listMergePendingComponents(componentsList);
    const mergePendingComponentsIds = ComponentIdList.fromArray(mergePendingComponents.map((c) => c.id));
    const outdatedComponents = await componentsList.listOutdatedComponents(mergePendingComponentsIds, loadOpts);
    if (allComps.length) {
      const issuesFromFlag = ignoreCircularDependencies ? [IssuesClasses.CircularDependencies.name] : [];
      const issuesToIgnore = [...this.issues.getIssuesToIgnoreGlobally(), ...issuesFromFlag];
      await this.issues.triggerAddComponentIssues(allComps, issuesToIgnore);
      this.issues.removeIgnoredIssuesFromComponents(allComps);
    }
    const componentsWithIssues = allComps.filter((component) => !component.state.issues.isEmpty());
    const softTaggedComponents = this.workspace.filter.bySoftTagged();
    const snappedComponents = await this.workspace.filter.bySnappedOnMain();
    const pendingUpdatesFromMain = lanes ? await this.lanes.listUpdatesFromMainPending(componentsList) : [];
    const updatesFromForked = lanes ? await this.lanes.listUpdatesFromForked(componentsList) : [];
    const currentLaneId = consumer.getCurrentLaneId();
    const currentLane = await consumer.getCurrentLaneObject();
    const forkedLaneId = currentLane?.forkedFrom;
    const workspaceIssues = this.workspace.getWorkspaceIssues();
    const localOnly = this.workspace.listLocalOnly();

    const sortObjectsWithId = <T>(objectsWithId: Array<T & { id: ComponentID }>): Array<T & { id: ComponentID }> => {
      return objectsWithId.sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
    };

    await consumer.onDestroy('status');
    return {
      newComponents: ComponentID.sortIds(newComponents.map((c) => c.id)),
      modifiedComponents: ComponentID.sortIds(modifiedComponents.map((c) => c.id)),
      stagedComponents: sortObjectsWithId(stagedComponentsWithVersions),
      componentsWithIssues: sortObjectsWithId(componentsWithIssues.map((c) => ({ id: c.id, issues: c.state.issues }))),
      importPendingComponents, // no need to sort, we use only its length
      autoTagPendingComponents: ComponentID.sortIds(autoTagPendingComponentsIds),
      invalidComponents: sortObjectsWithId(invalidComponents.map((c) => ({ id: c.id, error: c.err }))),
      locallySoftRemoved: ComponentID.sortIds(locallySoftRemoved),
      remotelySoftRemoved: ComponentID.sortIds(remotelySoftRemoved.map((c) => c.id)),
      outdatedComponents: sortObjectsWithId(
        outdatedComponents.map((c) => ({
          id: c.id,
          headVersion: c.headVersion,
          latestVersion: c.latestVersion,
        }))
      ),
      mergePendingComponents: sortObjectsWithId(
        mergePendingComponents.map((c) => ({ id: c.id, divergeData: c.diverge }))
      ),
      componentsDuringMergeState: ComponentID.sortIds(idsDuringMergeState),
      softTaggedComponents: ComponentID.sortIds(softTaggedComponents),
      snappedComponents: ComponentID.sortIds(snappedComponents),
      pendingUpdatesFromMain: sortObjectsWithId(pendingUpdatesFromMain),
      updatesFromForked: sortObjectsWithId(updatesFromForked),
      unavailableOnMain,
      currentLaneId,
      forkedLaneId,
      workspaceIssues: workspaceIssues.map((err) => err.message),
      localOnly,
    };
  }

  async statusMini(componentPattern?: string, opts: MiniStatusOpts = {}): Promise<MiniStatusResults> {
    const ids = componentPattern ? await this.workspace.idsByPattern(componentPattern) : this.workspace.listIds();
    const compFiles = await pMapSeries(ids, (id) => this.workspace.getFilesModification(id));
    const modified: ComponentID[] = [];
    const newComps: ComponentID[] = [];
    compFiles.forEach((comp) => {
      if (!comp.id.hasVersion()) newComps.push(comp.id);
      if (comp.isModified()) modified.push(comp.id);
    });
    const loadOpts = {
      loadDocs: false,
      loadCompositions: false,
    };
    const comps = opts.showIssues ? await this.workspace.getMany(ids, loadOpts) : [];
    if (opts.showIssues) {
      const issuesFromFlag = opts.ignoreCircularDependencies ? [IssuesClasses.CircularDependencies.name] : [];
      const issuesToIgnore = [...this.issues.getIssuesToIgnoreGlobally(), ...issuesFromFlag];
      await this.issues.triggerAddComponentIssues(comps, issuesToIgnore);
      this.issues.removeIgnoredIssuesFromComponents(comps);
    }
    const compWithIssues = comps.filter((c) => !c.state.issues.isEmpty());

    return { modified, newComps, compWithIssues };
  }

  async formatStatusOutput(
    statusResult: StatusResult,
    formatterOptions: StatusFormatterOptions = {}
  ): Promise<{ data: string; code: number }> {
    return formatStatusOutput(statusResult, formatterOptions);
  }

  private async addRemovedStagedIfNeeded(stagedComponents: ModelComponent[]) {
    const removedStagedIds = await this.remove.getRemovedStaged();
    if (!removedStagedIds.length) return;
    const nonExistsInStaged = removedStagedIds.filter(
      (id) => !stagedComponents.find((c) => c.toComponentId().isEqualWithoutVersion(id))
    );
    if (!nonExistsInStaged.length) return;
    const modelComps = await Promise.all(
      nonExistsInStaged.map((id) => this.workspace.scope.legacyScope.getModelComponent(id))
    );
    stagedComponents.push(...modelComps);
  }

  private async divergeDataErrorsToInvalidComp(components: Component[]): Promise<InvalidComponent[]> {
    const invalidComponents: InvalidComponent[] = [];
    await Promise.all(
      components.map(async (component) => {
        const comp = component.state._consumer as ConsumerComponent;
        if (!comp.modelComponent) return;
        await comp.modelComponent.setDivergeData(this.workspace.scope.legacyScope.objects, false, undefined, comp.id);
        const divergeData = comp.modelComponent.getDivergeData();
        if (divergeData.err) {
          invalidComponents.push({ id: component.id, err: divergeData.err });
        }
      })
    );
    return invalidComponents;
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    InsightsAspect,
    IssuesAspect,
    RemoveAspect,
    LanesAspect,
    LoggerAspect,
    MergingAspect,
  ];
  static runtime = MainRuntime;
  static async provider([cli, workspace, insights, issues, remove, lanes, loggerMain, merging]: [
    CLIMain,
    Workspace,
    InsightsMain,
    IssuesMain,
    RemoveMain,
    LanesMain,
    LoggerMain,
    MergingMain,
  ]) {
    const logger = loggerMain.createLogger(StatusAspect.id);
    const statusMain = new StatusMain(workspace, issues, insights, remove, lanes, logger, merging);
    cli.register(new StatusCmd(statusMain), new MiniStatusCmd(statusMain));
    return statusMain;
  }
}

StatusAspect.addRuntime(StatusMain);
