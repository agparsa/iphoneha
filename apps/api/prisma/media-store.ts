import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Writes and removes media for the standalone scripts (seed, catalogue sync),
 * which do not boot Nest. Same layout as the API's storage module: the key is
 * the path under the storage root (or the S3 object key), served at /media/<key>.
 */
async function s3() {
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });
  return { client, PutObjectCommand, DeleteObjectCommand, bucket: process.env.S3_BUCKET ?? 'iphoneha-media' };
}

const localRoot = () => resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');

export async function putMedia(key: string, data: Buffer, contentType = 'image/webp'): Promise<string> {
  if ((process.env.STORAGE_DRIVER ?? 'local') === 's3') {
    const { client, PutObjectCommand, bucket } = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } else {
    const file = join(localRoot(), key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return `/media/${key}`;
}

/** Best effort: a file that is already gone is not an error. */
export async function deleteMedia(key: string): Promise<void> {
  try {
    if ((process.env.STORAGE_DRIVER ?? 'local') === 's3') {
      const { client, DeleteObjectCommand, bucket } = await s3();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } else {
      await unlink(join(localRoot(), key));
    }
  } catch {
    /* nothing to remove */
  }
}
