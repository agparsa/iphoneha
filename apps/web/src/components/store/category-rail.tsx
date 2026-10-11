import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { formatNumberFa, formatToman, type ProductCardDto } from '@iphoneha/shared';
import { ProductImage } from './product-image';

export function CategoryRail({ products }: { products: ProductCardDto[] }) {
  if (products.length === 0) return null;
  return (
    <div className="rail lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible">
      {products.map((product) => (
        <Link
          key={product.id}
          href={`/iphone/${product.slug}`}
          className="card-interactive group flex w-[13.5rem] flex-col rounded-panel border border-line bg-canvas p-4 lg:w-auto"
        >
          <div className="relative mx-auto aspect-square w-full max-w-[9rem]">
            {product.maxDiscountPercent > 0 ? (
              <span className="absolute start-0 top-0 z-10 rounded-pill bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white tabular">
                {formatNumberFa(product.maxDiscountPercent)}٪
              </span>
            ) : null}
            <ProductImage
              src={product.variant.image?.url}
              alt={product.name}
              sizes="(min-width: 1024px) 200px, 160px"
              className="transition-transform duration-500 ease-out-quint group-hover:-translate-y-1.5 group-hover:scale-[1.04]"
            />
          </div>
          <p className="mt-3 text-[15px] font-semibold text-ink">{product.name}</p>
          <p className="mt-0.5 font-display text-[11px] text-muted">{product.nameEn}</p>
          <p className="mt-2 flex items-center gap-1.5">
            <span className="flex items-center -space-x-1 space-x-reverse" aria-hidden>
              {product.colors.slice(0, 4).map((color) => (
                <span
                  key={color.id}
                  className="size-3 rounded-full ring-2 ring-canvas"
                  style={{ backgroundColor: color.hex, boxShadow: 'inset 0 0 0 1px rgb(8 9 10 / 0.12)' }}
                />
              ))}
            </span>
            <span className="text-[11px] text-muted">
              {formatNumberFa(product.colors.length)} رنگ · {formatNumberFa(product.storages.length)} حافظه
            </span>
          </p>
          <p className="mt-3 text-[13px] text-muted">
            از <span className="font-medium text-ink tabular">{formatToman(product.minPrice)}</span>
          </p>
          <span className="mt-3 inline-flex items-center gap-0.5 text-[12px] font-medium text-ink">
            مشاهده
            <ChevronLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );
}
