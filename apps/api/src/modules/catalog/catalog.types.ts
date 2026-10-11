import type { Prisma } from '@prisma/client';

export const variantInclude = {
  color: true,
  storage: true,
  inventory: true,
} satisfies Prisma.ProductVariantInclude;

export const productInclude = {
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  variants: {
    include: variantInclude,
    orderBy: [{ price: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude;

export type VariantWithRelations = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;
export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
