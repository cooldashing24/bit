import type { DocReader } from '@teambit/docs';
import { Doc } from '@teambit/docs';
import { compile } from '@teambit/mdx.compilers.mdx-transpiler';

export class MDXDocReader implements DocReader {
  constructor(private extensions: string[]) {}

  async read(path: string, contents: Buffer) {
    const output = await compile(contents.toString('utf-8'), { filepath: path });
    const metadata = output.getMetadata();

    const doc = Doc.from(path, metadata);
    return doc;
  }

  isFormatSupported(format: string) {
    return this.extensions.includes(format);
  }
}
