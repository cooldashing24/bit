import type { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index-file';
import { taskFile } from './files/task-file';

export const buildTaskTemplate: ComponentTemplate = {
  name: 'build-task',
  hidden: true,
  description: 'create a custom build task for your component pipelines',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.task.ts`,
        content: taskFile(context),
      },
    ];
  },
  config: {
    'teambit.harmony/aspect': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/aspect',
    },
  },
};
