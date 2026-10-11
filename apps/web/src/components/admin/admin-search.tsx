'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Search box that writes `q` into the URL so the server component refetches. */
export function AdminSearch({ placeholder = 'جست‌وجو…' }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set('q', value.trim());
    else params.delete('q');
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <form onSubmit={submit} className="relative max-w-md">
      <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-faint" />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="h-11 ps-11 pe-10"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue('');
            const params = new URLSearchParams(searchParams.toString());
            params.delete('q');
            params.delete('page');
            const query = params.toString();
            router.push(query ? `${pathname}?${query}` : pathname);
          }}
          className="absolute end-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-faint hover:bg-surface"
          aria-label="پاک کردن جست‌وجو"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </form>
  );
}
