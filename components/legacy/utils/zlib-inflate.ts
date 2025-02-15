import { promisify } from 'util';
import zlib from 'zlib';

export default async function inflate(buffer: Buffer, filePath?: string): Promise<Buffer> {
  const inflateP = promisify(zlib.inflate);
  try {
    // @ts-ignore should be fixed
    return await inflateP(buffer);
  } catch (err: any) {
    const filePathStr = filePath ? ` of "${filePath}"` : '';
    throw new Error(`fatal: zlib.inflate${filePathStr} has failed with an error: "${err.message}"
try running bit import --all-history to fix the corrupted objects`);
  }
}
