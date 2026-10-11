import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { extname } from 'node:path';
import { Errors } from '../../common/errors';
import { StorageService } from './storage.service';

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/** Serves product images when the local storage driver is active. */
@ApiExcludeController()
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get('*key')
  async get(@Param('key') key: string | string[], @Res() res: Response): Promise<void> {
    const path = Array.isArray(key) ? key.join('/') : key;
    const buffer = await this.storage.read(path);
    if (!buffer) throw Errors.notFound('فایل پیدا نشد');
    const type = CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
    if (type === 'image/svg+xml') {
      // an SVG opened as a page could carry script; served as a picture only
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    res.type(type).set('Cache-Control', 'public, max-age=31536000, immutable').send(buffer);
  }
}
