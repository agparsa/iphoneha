'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, TrendingUp } from 'lucide-react';
import { formatToman, type SearchSuggestionDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { useStoreConfig } from '@/providers/store-config-provider';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ProductImage } from './product-image';

const QUICK = ['آیفون ۱۷ پرو مکس', 'iPhone Air', '۲۵۶ گیگ', 'نارنجی کیهانی', 'آیفون ۱۷'];

export function SearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
        aria-label="جست‌وجو"
      >
        <Search className="size-[18px]" />
      </SheetTrigger>
      <SheetContent side="bottom" title="جست‌وجو" description="مدل، حافظه یا رنگ را بنویس">
        <SearchPanel onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function SearchPanel({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const { models } = useStoreConfig();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.suggest(debounced),
    queryFn: () => api.get<SearchSuggestionDto[]>('/products/search/suggest', { q: debounced, limit: 6 }),
    enabled: debounced.length > 1,
    staleTime: 60_000,
  });

  function submit(value: string) {
    const q = value.trim();
    if (!q) return;
    onNavigate();
    router.push(`/shop?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="flex max-h-[70dvh] flex-col">
      <form
        className="border-b border-line p-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(term);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-faint" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="مثلاً: آیفون ۱۷ پرو مکس ۲۵۶ نارنجی"
            className="ps-11"
            enterKeyHint="search"
            aria-label="عبارت جست‌وجو"
          />
          {isFetching ? (
            <Loader2 className="absolute end-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-faint" />
          ) : null}
        </div>
      </form>

      <div className="flex-1 overflow-y-auto p-4">
        {debounced.length > 1 && data ? (
          data.length > 0 ? (
            <ul className="grid gap-1">
              {data.map((item) => (
                <li key={`${item.productId}-${item.variantId ?? 'none'}`}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface"
                  >
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                      <ProductImage src={item.image} alt={item.name} sizes="56px" className="p-1" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                      <span className="block text-[11px] text-muted font-display">{item.nameEn}</span>
                    </span>
                    {item.price ? (
                      <span className="shrink-0 text-[13px] font-medium text-ink tabular">
                        {formatToman(item.price)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              نتیجه‌ای پیدا نشد. عبارت دیگری را امتحان کن.
            </p>
          )
        ) : (
          <>
            <p className="eyebrow mb-2">جست‌وجوهای پرتکرار</p>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => submit(item)}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:border-ink-muted"
                >
                  <TrendingUp className="size-3.5 text-muted-faint" />
                  {item}
                </button>
              ))}
            </div>

            <p className="eyebrow mt-6 mb-2">مدل‌ها</p>
            <div className="grid grid-cols-2 gap-2">
              {models.map((model) => (
                <Link
                  key={model.slug}
                  href={`/iphone/${model.slug}`}
                  onClick={onNavigate}
                  className="rounded-2xl border border-line px-3 py-2.5 text-[13px] text-ink transition-colors hover:bg-surface"
                >
                  {model.name}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
