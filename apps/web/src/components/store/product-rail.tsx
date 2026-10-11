'use client';

import type { ProductCardDto } from '@iphoneha/shared';
import { useInstallmentEstimate } from '@/hooks/use-installment-estimate';
import { ProductCard } from './product-card';

export function ProductRail({ products }: { products: ProductCardDto[] }) {
  const monthlyFor = useInstallmentEstimate();
  if (products.length === 0) return null;
  return (
    <div className="rail">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} monthly={monthlyFor(product.minPrice)} compact />
      ))}
    </div>
  );
}

export function ProductGrid({ products }: { products: ProductCardDto[] }) {
  const monthlyFor = useInstallmentEstimate();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          monthly={monthlyFor(product.minPrice)}
          // the first row (two cards on a phone, four on a desktop)
          priority={i < 4}
        />
      ))}
    </div>
  );
}
