import type { ComponentID } from '@teambit/component';
import { Component, ComponentFS, Config, Snap, State, Tag, TagMap } from '@teambit/component';
import pMapSeries from 'p-map-series';
import type { Logger } from '@teambit/logger';
import { SemVer } from 'semver';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ModelComponent, Version } from '@teambit/objects';
import { VERSION_ZERO, Ref } from '@teambit/objects';
import { BitError } from '@teambit/bit-error';
import type { InMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { getMaxSizeForComponents, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import type { ScopeMain } from './scope.main.runtime';

export class ScopeComponentLoader {
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  private importedComponentsCache: InMemoryCache<boolean>;
  constructor(
    private scope: ScopeMain,
    private logger: Logger
  ) {
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.importedComponentsCache = createInMemoryCache({ maxAge: 1000 * 60 * 30 }); // 30 min
  }

  async get(id: ComponentID, importIfMissing = true, useCache = true): Promise<Component | undefined> {
    const fromCache = this.getFromCache(id);
    if (fromCache && useCache) {
      return fromCache;
    }
    const idStr = id.toString();
    this.logger.trace(`ScopeComponentLoader.get, loading ${idStr}`);
    const legacyId = id;
    let modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    // import if missing
    if (
      !modelComponent &&
      importIfMissing &&
      this.scope.isExported(id) &&
      !this.importedComponentsCache.get(id.toString())
    ) {
      await this.scope.import([id], { reason: `${id.toString()} because it's missing from the local scope` });
      this.importedComponentsCache.set(id.toString(), true);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    }
    // Search with scope name for bare scopes
    if (!modelComponent && !legacyId.scope) {
      id = id.changeScope(this.scope.name);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    }
    if (!modelComponent) return undefined;

    const versionStr = id.hasVersion()
      ? (id.version as string)
      : modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);

    if (versionStr === VERSION_ZERO) return undefined;
    const newId = id.changeVersion(versionStr);
    const version = await modelComponent.loadVersion(versionStr, this.scope.legacyScope.objects);
    const versionOriginId = version.originId;
    if (versionOriginId && !versionOriginId.isEqualWithoutVersion(id)) {
      throw new BitError(
        `version "${versionStr}" seem to be originated from "${versionOriginId.toString()}", not from "${id.toStringWithoutVersion()}"`
      );
    }
    const snap = await this.getHeadSnap(modelComponent);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = this.getTagMap(modelComponent);

    const component = new Component(newId, snap, state, tagMap, this.scope);
    this.componentsCache.set(idStr, component);
    return component;
  }

  async getFromConsumerComponent(consumerComponent: ConsumerComponent): Promise<Component> {
    const id = consumerComponent.id;
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    // :TODO move to head snap once we have it merged, for now using `latest`.
    const version =
      consumerComponent.pendingVersion ||
      (await modelComponent.loadVersion(id.version as string, this.scope.legacyScope.objects));
    const snap = await this.getHeadSnap(modelComponent);
    const state = await this.createStateFromVersion(id, version, consumerComponent);
    const tagMap = this.getTagMap(modelComponent);

    return new Component(id, snap, state, tagMap, this.scope);
  }

  /**
   * get a component from a remote without importing it
   */
  async getRemoteComponent(id: ComponentID, fromMain = false): Promise<Component> {
    const compImport = this.scope.legacyScope.scopeImporter;
    const objectList = await compImport.getRemoteComponent(id);
    // it's crucial to add all objects to the Repository cache. otherwise, later, when it asks
    // for the consumerComponent from the legacyScope, it won't work.
    objectList?.getAll().forEach((obj) => this.scope.legacyScope.objects.setCache(obj));
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const headAsTag = modelComponent.getHeadAsTagIfExist();
    const idToLoad = fromMain && headAsTag ? id.changeVersion(headAsTag) : id;
    const consumerComponent = await this.scope.legacyScope.getConsumerComponent(idToLoad);
    return this.getFromConsumerComponent(consumerComponent);
  }

  /**
   * get components from a remote without importing it
   */
  async getManyRemoteComponents(ids: ComponentID[]): Promise<Component[]> {
    const compImport = this.scope.legacyScope.scopeImporter;
    const legacyIds = ids.map((id) => id);
    const objectList = await compImport.getManyRemoteComponents(legacyIds);
    // it's crucial to add all objects to the Repository cache. otherwise, later, when it asks
    // for the consumerComponent from the legacyScope, it won't work.
    objectList?.getAll().forEach((obj) => this.scope.legacyScope.objects.setCache(obj));
    return pMapSeries(legacyIds, async (legacyId) => {
      const consumerComponent = await this.scope.legacyScope.getConsumerComponent(legacyId);
      return this.getFromConsumerComponent(consumerComponent);
    });
  }

  async getState(id: ComponentID, hash: string): Promise<State> {
    const version = (await this.scope.legacyScope.objects.load(new Ref(hash))) as Version;
    return this.createStateFromVersion(id, version);
  }

  async getSnap(id: ComponentID, hash: string): Promise<Snap> {
    const getVersionObject = async (): Promise<Version> => {
      try {
        const snap = await this.scope.legacyScope.objects.load(new Ref(hash), true);
        return snap as Version;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          const errMsg = `fatal: snap "${hash}" file for component "${id.toString()}" was not found in the filesystem`;
          this.logger.error(errMsg, err);
          throw new Error(errMsg);
        } else {
          throw err;
        }
      }
    };
    const version = await getVersionObject();
    return this.createSnapFromVersion(version);
  }

  clearCache() {
    this.componentsCache.deleteAll();
  }

  /**
   * make sure that not only the id-str match, but also the legacy-id.
   * this is needed because the ComponentID.toString() is the same whether or not the legacy-id has
   * scope-name, as it includes the defaultScope if the scope is empty.
   * as a result, when out-of-sync is happening and the id is changed to include scope-name in the
   * legacy-id, the component is the cache has the old id.
   */
  private getFromCache(id: ComponentID): Component | undefined {
    const idStr = id.toString();
    const fromCache = this.componentsCache.get(idStr);
    if (fromCache && fromCache.id.isEqual(id)) {
      return fromCache;
    }
    return undefined;
  }

  private getTagMap(modelComponent: ModelComponent): TagMap {
    const tagMap = new TagMap();
    const allVersions = modelComponent.versionsIncludeOrphaned;
    Object.keys(allVersions).forEach((versionStr: string) => {
      const tag = new Tag(allVersions[versionStr].toString(), new SemVer(versionStr));
      tagMap.set(tag.version, tag);
    });
    return tagMap;
  }

  private async getHeadSnap(modelComponent: ModelComponent): Promise<Snap | null> {
    const head = modelComponent.getHeadRegardlessOfLane();
    if (!head) {
      // happens for example when on main and merging a lane.
      return null;
    }
    const version = await modelComponent.loadVersion(head.toString(), this.scope.legacyScope.objects, false);
    if (!version) {
      // might happen when the component is just a dependency and a previous version was needed.
      return null;
    }
    return this.createSnapFromVersion(version);
  }

  private createSnapFromVersion(version: Version): Snap {
    return new Snap(
      version.hash().toString(),
      new Date(parseInt(version.log.date)),
      version.parents.map((p) => p.toString()),
      {
        displayName: version.log.username || 'unknown',
        email: version.log.email || 'unknown@anywhere',
      },
      version.log.message
    );
  }

  private async createStateFromVersion(
    id: ComponentID,
    version: Version,
    consumerComponentOptional?: ConsumerComponent
  ): Promise<State> {
    const consumerComponent = consumerComponentOptional || (await this.scope.legacyScope.getConsumerComponent(id));
    const state = new State(
      // We use here the consumerComponent.extensions instead of version.extensions
      // because as part of the conversion to consumer component the artifacts are initialized as Artifact instances
      new Config(consumerComponent),
      // todo: see the comment of this "createAspectListFromLegacy" method. the aspect ids may be incorrect.
      // find a better way to get the ids correctly.
      this.scope.componentExtension.createAspectListFromLegacy(consumerComponent.extensions),
      ComponentFS.fromVinyls(consumerComponent.files),
      version.dependencies,
      consumerComponent
    );
    return state;
  }
}
