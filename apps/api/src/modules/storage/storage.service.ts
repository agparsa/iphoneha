import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { Errors } from '../../common/errors';
import { randomToken } from '../../common/utils';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import type { StorageDriver, StoredObject } from './storage.driver';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/**
 * The upload re-encoded by sharp — which is also the proof that it is a
 * picture: a file that only claims an image type (or is broken) does not
 * decode, and that is the uploader's mistake, not a server failure.
 */
async function decodeImage<T>(decode: () => Promise<T>): Promise<T> {
  try {
    return await decode();
  } catch (error) {
    throw Errors.badRequest('INVALID_IMAGE', 'این فایل تصویر معتبری نیست', {
      reason: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly driver: StorageDriver;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.driver =
      config.STORAGE_DRIVER === 's3'
        ? new S3StorageDriver(config.S3_BUCKET, {
            endpoint: config.S3_ENDPOINT,
            region: config.S3_REGION,
            accessKey: config.S3_ACCESS_KEY as string,
            secretKey: config.S3_SECRET_KEY as string,
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
          })
        : new LocalStorageDriver(config.STORAGE_LOCAL_DIR);
    this.logger.log(`storage driver: ${this.driver.name}`);
  }

  urlFor(key: string): string {
    return `${this.config.mediaPublicBase}/${key}`;
  }

  /** Normalises an uploaded product photo to WebP and stores it. */
  async putProductImage(
    productId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<StoredObject & { width: number; height: number }> {
    if (file.size > MAX_UPLOAD_BYTES)
      throw Errors.badRequest('FILE_TOO_LARGE', 'حجم تصویر بیشتر از ۸ مگابایت است');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw Errors.badRequest('UNSUPPORTED_FILE', 'فقط تصاویر JPG، PNG، WebP یا AVIF پذیرفته می‌شود');
    }

    const resized = await decodeImage(async () => {
      const image = sharp(file.buffer, { failOn: 'error' }).rotate();
      const metadata = await image.metadata();
      return image
        .resize({ width: Math.min(metadata.width ?? 1600, 1600), withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    });

    const key = `products/${productId}/${randomToken(10)}.webp`;
    await this.driver.put(key, resized.data, 'image/webp');
    return {
      key,
      url: this.urlFor(key),
      size: resized.info.size,
      contentType: 'image/webp',
      width: resized.info.width,
      height: resized.info.height,
    };
  }

  /** A magazine cover: WebP, at most 1600 px wide (it is also the article's share picture). */
  async putArticleCover(
    articleId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<StoredObject & { width: number; height: number }> {
    if (file.size > MAX_UPLOAD_BYTES)
      throw Errors.badRequest('FILE_TOO_LARGE', 'حجم تصویر بیشتر از ۸ مگابایت است');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw Errors.badRequest('UNSUPPORTED_FILE', 'فقط تصاویر JPG، PNG، WebP یا AVIF پذیرفته می‌شود');
    }
    const resized = await decodeImage(() =>
      sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
    );
    const key = `articles/${articleId}/${randomToken(10)}.webp`;
    await this.driver.put(key, resized.data, 'image/webp');
    return {
      key,
      url: this.urlFor(key),
      size: resized.info.size,
      contentType: 'image/webp',
      width: resized.info.width,
      height: resized.info.height,
    };
  }

  /** Stores an already-prepared buffer (used by the seed script). */
  async putRaw(key: string, buffer: Buffer, contentType: string): Promise<StoredObject> {
    await this.driver.put(key, buffer, contentType);
    return { key, url: this.urlFor(key), size: buffer.byteLength, contentType };
  }

  async delete(key: string): Promise<void> {
    await this.driver
      .delete(key)
      .catch((error) => this.logger.warn(`failed to delete ${key}: ${String(error)}`));
  }

  read(key: string): Promise<Buffer | null> {
    return this.driver.read(key);
  }
}
