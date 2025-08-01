import type { ReactNode } from 'react';
import React, { useContext, useMemo } from 'react';
import classNames from 'classnames';
import { ComponentTree } from '@teambit/ui-foundation.ui.side-bar';
import type { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import type { ComponentTreeSlot } from '@teambit/component-tree';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import type { ComponentModel } from '@teambit/component';
import type { TreeNode as TreeNodeType, TreeNodeRenderer } from '@teambit/design.ui.tree';
import type { ComponentTuple } from '@teambit/base-ui.utils.composer';
import { Composer } from '@teambit/base-ui.utils.composer';
import flatten from 'lodash.flatten';
import type { ComponentFilters } from '@teambit/component.ui.component-filters.component-filter-context';
import {
  ComponentFiltersProvider,
  ComponentFilterContext,
  runAllFilters,
} from '@teambit/component.ui.component-filters.component-filter-context';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import type { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import type { SlotRegistry } from '@teambit/harmony';
import type { ScopeModel } from '@teambit/scope.models.scope-model';
import type { WorkspaceModel } from '@teambit/workspace';
import { ComponentTreeLoader } from '@teambit/design.ui.skeletons.sidebar-loader';
import { ComponentFilterWidgetProvider, ComponentFilterWidgetContext } from './component-drawer-filter-widget.context';
import { ComponentTreeContext, ComponentTreeProvider } from './component-drawer-tree-widget.context';

import styles from './component-drawer.module.scss';

export type ComponentFiltersSlot = SlotRegistry<ComponentFilters>;
export type DrawerWidgetSlot = SlotRegistry<ReactNode[]>;
export type TransformTreeFn = (host?: WorkspaceModel | ScopeModel) => (rootNode: TreeNodeType) => TreeNodeType;

export type ComponentsDrawerProps = Omit<DrawerType, 'render'> & {
  useComponents: () => { components: ComponentModel[]; loading?: boolean };
  useLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
  emptyMessage?: ReactNode;
  plugins?: ComponentsDrawerPlugins;
  transformTree?: TransformTreeFn;
  assumeScopeInUrl?: boolean;
  useHost?: () => ScopeModel | WorkspaceModel;
};

export type ComponentsDrawerPlugins = {
  tree?: {
    customRenderer?: (
      treeNodeSlot?: ComponentTreeSlot,
      host?: ScopeModel | WorkspaceModel
    ) => TreeNodeRenderer<PayloadType>;
    widgets: ComponentTreeSlot;
  };
  filters?: ComponentFiltersSlot;
  drawerWidgets?: DrawerWidgetSlot;
};

export class ComponentsDrawer implements DrawerType {
  readonly id: string;
  readonly useComponents: () => { components: ComponentModel[]; loading?: boolean };
  readonly useLanes: () => { lanesModel?: LanesModel; loading?: boolean };
  name: ReactNode;
  tooltip?: string;
  order?: number;
  isHidden?: () => boolean;
  emptyMessage?: ReactNode;
  widgets: ReactNode[];
  plugins: ComponentsDrawerPlugins;
  assumeScopeInUrl: boolean;
  useHost?: () => ScopeModel | WorkspaceModel;
  transformTree?: TransformTreeFn;

  constructor(props: ComponentsDrawerProps) {
    Object.assign(this, props);
    this.useComponents = props.useComponents;
    this.useLanes = props.useLanes || useLanes;
    this.emptyMessage = props.emptyMessage;
    this.plugins = props.plugins || {};
    this.setWidgets(props.plugins?.drawerWidgets);
    this.assumeScopeInUrl = props.assumeScopeInUrl || false;
    this.useHost = props.useHost;
    this.transformTree = props.transformTree;
  }

  Context = ({ children }) => {
    const filters = flatten(this.plugins?.filters?.values() || []);
    const combinedContexts = [
      ComponentTreeProvider,
      ComponentFilterWidgetProvider,
      [ComponentFiltersProvider, { filters }] as ComponentTuple<{ children?: ReactNode; filters: any }>,
    ];
    return <Composer components={combinedContexts}>{children}</Composer>;
  };

  setWidgets = (widgets?: DrawerWidgetSlot) => {
    this.widgets = flatten(widgets?.values());
  };

  render = () => {
    const { useComponents, useLanes: useLanesFromInstance, emptyMessage, plugins, transformTree, useHost, id } = this;
    return (
      <ComponentsDrawerContent
        useComponents={useComponents}
        useLanes={useLanesFromInstance}
        emptyMessage={emptyMessage}
        plugins={plugins}
        transformTree={transformTree}
        useHost={useHost}
        id={id}
      />
    );
  };
}

function ComponentsDrawerContent({
  useComponents,
  useLanes: useLanesFromProps,
  emptyMessage,
  plugins,
  transformTree,
  useHost,
  id,
}: {
  useComponents: () => { components: ComponentModel[]; loading?: boolean };
  useLanes: () => { lanesModel?: LanesModel; loading?: boolean };
  emptyMessage: ReactNode;
  plugins: ComponentsDrawerPlugins;
  transformTree?: TransformTreeFn;
  useHost?: () => ScopeModel | WorkspaceModel;
  id: string;
}) {
  const { loading: loadingComponents, components } = useComponents();
  const { lanesModel: lanes, loading: loadingLanesModel } = useLanesFromProps();
  const componentFiltersContext = useContext(ComponentFilterContext);
  const filters = componentFiltersContext?.filters || [];
  const host = useHost?.();

  const filteredComponents = useMemo(() => {
    if (!filters.length) return components;
    return runAllFilters(filters, { components, lanes });
  }, [filters, components.length, lanes?.lanes.length, lanes?.viewedLane?.id.toString(), loadingLanesModel]);

  const Filters = <ComponentsDrawerRenderFilters components={components} lanes={lanes} plugins={plugins} />;

  const Tree = (
    <ComponentsDrawerRenderTree
      components={filteredComponents}
      host={host}
      plugins={plugins}
      transformTree={transformTree}
      lanesModel={lanes}
    />
  );

  const emptyDrawer = <span className={classNames(mutedItalic, ellipsis, styles.emptyDrawer)}>{emptyMessage}</span>;

  const loading = loadingComponents || loadingLanesModel || !lanes || !components;

  if (loading) return <ComponentTreeLoader />;

  return (
    <div key={id} className={styles.drawerContainer}>
      {Filters}
      {Tree}
      {filteredComponents.length === 0 && emptyDrawer}
    </div>
  );
}

function ComponentsDrawerRenderFilters({
  components,
  lanes,
  plugins,
}: {
  components: ComponentModel[];
  lanes?: LanesModel;
  plugins: ComponentsDrawerPlugins;
}) {
  const { filterWidgetOpen } = useContext(ComponentFilterWidgetContext);
  const filterPlugins = plugins.filters;

  const filters = useMemo(
    () =>
      (filterPlugins &&
        flatten(
          filterPlugins.toArray().map(([key, filtersByKey]) => {
            return filtersByKey.map((filter) => ({ ...filter, key: `${key}-${filter.id}` }));
          })
        ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) ||
      [],
    [filterPlugins?.map.size, filterPlugins?.values()?.length]
  );

  if (!filters.length) return null;

  return (
    <div className={classNames(styles.filtersContainer, filterWidgetOpen && styles.open)}>
      {filters.map((filter) => (
        <filter.render
          key={filter.key}
          components={components}
          lanes={lanes}
          className={classNames(styles.filter, filterWidgetOpen && styles.open)}
        />
      ))}
    </div>
  );
}

function ComponentsDrawerRenderTree({
  components,
  host,
  plugins,
  transformTree,
  lanesModel,
}: {
  components: ComponentModel[];
  host?: ScopeModel | WorkspaceModel;
  plugins: ComponentsDrawerPlugins;
  transformTree?: TransformTreeFn;
  lanesModel?: LanesModel;
}) {
  const { collapsed } = useContext(ComponentTreeContext);
  const { tree } = plugins;

  const TreeNode = useMemo(() => {
    return tree?.customRenderer && tree.customRenderer(tree.widgets, host);
  }, [tree?.customRenderer, tree?.widgets.map.size, tree?.widgets.values().length]);

  const isVisible = components.length > 0;

  if (!isVisible) return null;

  return (
    <div className={styles.drawerTreeContainer}>
      <ComponentTree
        transformTree={transformTree ? transformTree(host) : undefined}
        components={components}
        isCollapsed={collapsed}
        TreeNode={TreeNode}
        lanesModel={lanesModel}
      />
    </div>
  );
}

export function TreeToggleWidget() {
  const { collapsed, setCollapsed } = useContext(ComponentTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return (
    <div className={classNames(styles.widgetIcon, !collapsed && styles.open)}>
      <img src={icon} onClick={() => setCollapsed(!collapsed)} />
    </div>
  );
}

export function FilterWidget() {
  const { filterWidgetOpen, setFilterWidget } = useContext(ComponentFilterWidgetContext);
  return (
    <div className={classNames(styles.widgetIcon, styles.filterWidget, filterWidgetOpen && styles.open)}>
      <img src="https://static.bit.dev/bit-icons/filter.svg" onClick={() => setFilterWidget(!filterWidgetOpen)} />
    </div>
  );
}
