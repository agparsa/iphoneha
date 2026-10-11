import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StorefrontConfigDto, StorefrontHomeDto, StorefrontSitemapDto } from '@iphoneha/shared';
import { StorefrontService } from './storefront.service';

@ApiTags('storefront')
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('config')
  @ApiOperation({ summary: 'Store settings, instalment terms and model list for the layout' })
  config(): Promise<StorefrontConfigDto> {
    return this.storefront.config();
  }

  @Get('home')
  @ApiOperation({ summary: 'Everything the home page renders, in one payload' })
  home(): Promise<StorefrontHomeDto> {
    return this.storefront.home();
  }

  @Get('sitemap')
  @ApiOperation({ summary: 'Active product slugs with their last change date, for sitemap.xml' })
  sitemap(): Promise<StorefrontSitemapDto> {
    return this.storefront.sitemap();
  }
}
