import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import type { AddressDto, UpdateProfileInput, UserDto } from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  static toDto(user: User): UserDto {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: fullName || null,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      profileComplete: Boolean(user.firstName && user.lastName),
    };
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw Errors.notFound('کاربر پیدا نشد');
    return user;
  }

  /** Creates the account on first successful OTP login. */
  async upsertByPhone(phone: string): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      if (!existing.isActive) throw Errors.forbidden('حساب کاربری شما غیرفعال است. با پشتیبانی تماس بگیرید');
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
      return { user, isNew: false };
    }
    const user = await this.prisma.user.create({ data: { phone, lastLoginAt: new Date() } });
    return { user, isNew: true };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { firstName: input.firstName, lastName: input.lastName },
    });
    return UsersService.toDto(user);
  }

  async getProfile(userId: string): Promise<UserDto> {
    return UsersService.toDto(await this.findByIdOrThrow(userId));
  }

  // ─── Addresses ─────────────────────────────────────────────────────────────

  static toAddressDto(address: Prisma.AddressGetPayload<object>): AddressDto {
    return {
      id: address.id,
      title: address.title,
      recipientName: address.recipientName,
      mobile: address.mobile,
      province: address.province,
      city: address.city,
      addressLine: address.addressLine,
      postalCode: address.postalCode,
      plaque: address.plaque,
      unit: address.unit,
      notes: address.notes,
      isDefault: address.isDefault,
    };
  }

  async listAddresses(userId: string): Promise<AddressDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map(UsersService.toAddressDto);
  }

  async getAddressOrThrow(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw Errors.notFound('آدرس پیدا نشد');
    return address;
  }

  async createAddress(userId: string, input: Omit<AddressDto, 'id'>): Promise<AddressDto> {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= 15) throw Errors.badRequest('TOO_MANY_ADDRESSES', 'حداکثر ۱۵ آدرس می‌توانید ذخیره کنید');
    const isDefault = input.isDefault || count === 0;
    const address = await this.prisma.$transaction(async (tx) => {
      if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...input, userId, isDefault } });
    });
    return UsersService.toAddressDto(address);
  }

  async updateAddress(userId: string, addressId: string, input: Omit<AddressDto, 'id'>): Promise<AddressDto> {
    await this.getAddressOrThrow(userId, addressId);
    const address = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { ...input } });
    });
    return UsersService.toAddressDto(address);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.getAddressOrThrow(userId, addressId);
    await this.prisma.address.delete({ where: { id: address.id } });
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<AddressDto> {
    await this.getAddressOrThrow(userId, addressId);
    const address = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
    return UsersService.toAddressDto(address);
  }
}
