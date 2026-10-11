import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { mediaUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function ProductImage({
  src,
  alt,
  sizes = '(min-width: 768px) 320px, 45vw',
  className,
  priority,
  fit = 'contain',
}: {
  src: string | null | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fit?: 'contain' | 'cover';
}) {
  const url = mediaUrl(src);
  if (!url) {
    return (
      <div className={cn('grid place-items-center bg-surface text-muted-faint', className)}>
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      // the page's largest paint is decoded in the same frame it arrives in, instead of
      // in a later task that the hydration scripts tend to push back
      decoding={priority ? 'sync' : 'async'}
      className={cn(fit === 'contain' ? 'object-contain' : 'object-cover', className)}
    />
  );
}
