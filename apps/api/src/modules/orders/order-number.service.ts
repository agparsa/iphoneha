import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../infra/prisma/prisma.service';

/** Human friendly order numbers (IH100001, IH100002, …) from a DB sequence. */
@Injectable()
export class OrderNumberService {
  async next(tx: PrismaTx): Promise<string> {
    const rows = await tx.$queryRaw<{ value: bigint }[]>(
      Prisma.sql`SELECT nextval('order_number_seq')::bigint AS value`,
    );
    const value = rows[0]?.value ?? BigInt(Date.now());
    return `IH${value.toString().padStart(6, '0')}`;
  }
}
