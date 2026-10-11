import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { upsertArticleSchema, type UpsertArticleInput } from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody } from '../../common/zod-validation.pipe';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { ArticlesService } from './articles.service';

@ApiTags('admin-content')
@Controller('admin/articles')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @RequirePermissions('content.read')
  list() {
    return this.articles.adminList();
  }

  @Get(':id')
  @RequirePermissions('content.read')
  get(@Param('id') id: string) {
    return this.articles.adminGet(id);
  }

  @Post()
  @RequirePermissions('content.write')
  create(
    @Body(new ZodBody(upsertArticleSchema)) body: UpsertArticleInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.articles.create(body, admin, client);
  }

  @Patch(':id')
  @RequirePermissions('content.write')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(upsertArticleSchema)) body: UpsertArticleInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.articles.update(id, body, admin, client);
  }

  @Delete(':id')
  @RequirePermissions('content.write')
  remove(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.articles.remove(id, admin, client);
  }

  @Post(':id/cover')
  @RequirePermissions('content.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  cover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    if (!file) throw Errors.badRequest('NO_FILE', 'فایلی ارسال نشده است');
    return this.articles.setCover(id, file, admin, client);
  }
}
