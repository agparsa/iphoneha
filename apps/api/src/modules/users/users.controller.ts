import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { addressSchema, updateProfileSchema, type AddressDto, type UserDto } from '@iphoneha/shared';
import { AuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { ZodBody } from '../../common/zod-validation.pipe';
import type { AuthUser } from '../../types/express';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.getProfile(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(updateProfileSchema)) body: { firstName: string; lastName: string },
  ): Promise<UserDto> {
    return this.users.updateProfile(user.id, body);
  }

  @Get('me/addresses')
  addresses(@CurrentUser() user: AuthUser): Promise<AddressDto[]> {
    return this.users.listAddresses(user.id);
  }

  @Post('me/addresses')
  createAddress(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(addressSchema)) body: Omit<AddressDto, 'id'>,
  ): Promise<AddressDto> {
    return this.users.createAddress(user.id, body);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodBody(addressSchema)) body: Omit<AddressDto, 'id'>,
  ): Promise<AddressDto> {
    return this.users.updateAddress(user.id, id, body);
  }

  @Post('me/addresses/:id/default')
  setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AddressDto> {
    return this.users.setDefaultAddress(user.id, id);
  }

  @Delete('me/addresses/:id')
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ deleted: true }> {
    await this.users.deleteAddress(user.id, id);
    return { deleted: true };
  }
}
