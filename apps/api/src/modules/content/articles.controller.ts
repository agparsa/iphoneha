import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { articleListQuerySchema } from '@iphoneha/shared';
import { ZodQuery } from '../../common/zod-validation.pipe';
import { ArticlesService } from './articles.service';

@ApiTags('content')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @ApiOperation({ summary: 'Published magazine articles, newest first' })
  list(@Query(new ZodQuery(articleListQuerySchema)) query: { page: number; pageSize: number }) {
    return this.articles.listPublished(query.page, query.pageSize);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One published article, with its Markdown body' })
  get(@Param('slug') slug: string) {
    return this.articles.bySlug(slug);
  }
}
