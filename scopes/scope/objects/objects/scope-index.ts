/* eslint max-classes-per-file: 0 */
import fs from 'fs-extra';
import { Mutex } from 'async-mutex';
import * as path from 'path';
import { LaneId } from '@teambit/lane-id';
import { logger } from '@teambit/legacy.logger';
import { InvalidIndexJson } from '@teambit/legacy.scope';
import { ModelComponent, Symlink } from '../models';
import Lane from '../models/lane';
import type BitObject from './object';
import type Ref from './ref';
import { difference } from 'lodash';

const COMPONENTS_INDEX_FILENAME = 'index.json';

export interface IndexItem {
  hash: string;
  toIdentifierString(): string;
}

export class ComponentItem implements IndexItem {
  constructor(
    public id: { scope: string | null; name: string },
    public isSymlink: boolean,
    public hash: string
  ) {}

  toIdentifierString(): string {
    const scope = this.id.scope ? `${this.id.scope}/` : '';
    return `component "${scope}${this.id.name}"`;
  }
}

export class LaneItem implements IndexItem {
  constructor(
    public id: { scope: string; name: string },
    public hash: string
  ) {}

  toIdentifierString() {
    const scope = this.id.scope ? `${this.id.scope}/` : '';
    return `lane "${scope}${this.id.name}"`;
  }

  toLaneId(): LaneId {
    return new LaneId({ name: this.id.name, scope: this.id.scope });
  }
}

export enum IndexType {
  components = 'components',
  lanes = 'lanes',
}

type Index = { [IndexType.components]: ComponentItem[]; [IndexType.lanes]: LaneItem[] };

export class ScopeIndex {
  indexPath: string;
  index: Index;
  _writeIndexMutex?: Mutex;
  constructor(indexPath: string, index: Index = { [IndexType.components]: [], [IndexType.lanes]: [] }) {
    this.indexPath = indexPath;
    this.index = index;
  }
  get writeIndexMutex() {
    if (!this._writeIndexMutex) {
      this._writeIndexMutex = new Mutex();
    }
    return this._writeIndexMutex;
  }
  static async load(basePath: string): Promise<ScopeIndex> {
    const indexPath = this._composePath(basePath);
    try {
      const indexRaw = await fs.readJson(indexPath);
      const getIndexWithBackwardCompatibility = (): Index => {
        if (Array.isArray(indexRaw)) {
          return { [IndexType.components]: indexRaw, [IndexType.lanes]: [] };
        }
        return indexRaw;
      };
      const indexObject = getIndexWithBackwardCompatibility();
      const index = {
        [IndexType.components]: indexObject[IndexType.components].map(
          (c) => new ComponentItem(c.id, c.isSymlink, c.hash)
        ),
        [IndexType.lanes]: indexObject[IndexType.lanes].map((l) => new LaneItem(l.id, l.hash)),
      };
      return new ScopeIndex(indexPath, index);
    } catch (err: any) {
      if (err.message.includes('Unexpected token')) {
        throw new InvalidIndexJson(indexPath, err.message);
      }
      throw err;
    }
  }
  static create(basePath: string): ScopeIndex {
    const indexPath = this._composePath(basePath);
    return new ScopeIndex(indexPath);
  }
  static async reset(basePath: string) {
    const indexPath = this._composePath(basePath);
    logger.debug(`ComponentsIndex, deleting the index file at ${indexPath}`);
    await fs.remove(indexPath);
  }
  async write() {
    // write only one at a time to avoid corrupting the json file.
    await this.writeIndexMutex.runExclusive(() => fs.writeJson(this.indexPath, this.index, { spaces: 2 }));
  }
  getAll(): IndexItem[] {
    return Object.values(this.index).flat();
  }

  getHashes(indexType: IndexType): string[] {
    // @ts-ignore how to tell TS that all this.index.prop are array?
    return this.index[indexType].map((indexItem: IndexItem) => indexItem.hash);
  }
  getHashesByQuery(indexType: IndexType, filter: Function): string[] {
    // @ts-ignore how to tell TS that all this.index.prop are array?
    return this.index[indexType].filter(filter).map((indexItem: IndexItem) => indexItem.hash);
  }
  getHashesIncludeSymlinks(): string[] {
    return this.index.components.map((indexItem) => indexItem.hash);
  }
  addMany(bitObjects: BitObject[]): boolean {
    const added = bitObjects.map((bitObject) => this.addOne(bitObject));
    return added.some((oneAdded) => oneAdded); // return true if one of the objects was added
  }
  addOne(bitObject: BitObject): boolean {
    if (!(bitObject instanceof ModelComponent) && !(bitObject instanceof Symlink) && !(bitObject instanceof Lane))
      return false;
    const hash = bitObject.hash().toString();

    if (bitObject instanceof Lane) {
      const found = this.find(hash) as LaneItem | undefined;
      if (found) {
        if ((found as LaneItem).toLaneId().isEqual(bitObject.toLaneId())) return false;
        found.id = bitObject.toLaneId();
      } else {
        const laneItem = new LaneItem(bitObject.toLaneId(), hash);
        this.index.lanes.push(laneItem);
      }
      return true;
    }
    if (bitObject instanceof ModelComponent || bitObject instanceof Symlink) {
      if (this._exist(hash)) return false;
      const componentItem = new ComponentItem(
        { scope: bitObject.scope || null, name: bitObject.name },
        bitObject instanceof Symlink,
        hash
      );
      this.index.components.push(componentItem);
    }
    return true;
  }
  removeMany(refs: Ref[]): boolean {
    const removed = refs.map((ref) => this.removeOne(ref.toString()));
    return removed.some((removedOne) => removedOne); // return true if one of the objects was removed
  }
  removeOne(hash: string): boolean {
    for (const entity of Object.keys(IndexType)) {
      const found = this.index[entity].find((indexItem) => indexItem.hash === hash);
      if (found) {
        this.index[entity] = difference(this.index[entity], [found]);
        return true;
      }
    }
    return false;
  }
  async deleteFile() {
    logger.debug(`ComponentsIndex, deleting the index file at ${this.indexPath}`);
    await fs.remove(this.indexPath);
  }
  getPath() {
    return this.indexPath;
  }
  /**
   * it's obviously not accurate. a local path might include 'bithub' as part of the path as well.
   * however, it's needed only for suppressing the error message when the indexJson is outdate,
   * so if it happens on a local scope it's okay.
   * for other purposes, don't rely on this.
   */
  isFileOnBitHub() {
    return this.indexPath.includes('/bithub/') || this.indexPath.includes('/tmp/scope-fs/');
  }
  find(hash: string): IndexItem | null {
    for (const entity of Object.keys(IndexType)) {
      const found = this.index[entity].find((indexItem) => indexItem.hash === hash);
      if (found) return found;
    }
    return null;
  }
  _exist(hash: string): boolean {
    return Boolean(this.find(hash));
  }
  static _composePath(basePath: string): string {
    return path.join(basePath, COMPONENTS_INDEX_FILENAME);
  }
}
