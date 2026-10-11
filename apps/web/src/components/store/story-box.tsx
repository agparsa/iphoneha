'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import { storySignature, type StoryAvatar, type StoryGroup } from '@/lib/story-types';
import { cn, mediaUrl } from '@/lib/utils';
import { PlanIcon } from '@/components/credit/plan-icon';
import { PaymentLogo } from './payment-logo';

// the viewer is only downloaded when someone opens a story (or points at the row)
const loadViewer = () => import('./story-viewer').then((module) => module.StoryViewer);
const StoryViewer = dynamic(loadViewer, { ssr: false });

const SEEN_KEY = 'ih:stories:seen';
const listeners = new Set<() => void>();

function readSeen(): string {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    // private mode or storage switched off: every story just stays «new»
    return '';
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function markSeen(group: StoryGroup): void {
  const signature = storySignature(group);
  const seen = readSeen().split('|').filter(Boolean);
  if (seen.includes(signature)) return;
  try {
    // only the latest few are worth remembering
    window.localStorage.setItem(SEEN_KEY, [...seen, signature].slice(-40).join('|'));
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

export function StoryAvatarView({
  avatar,
  color,
  size,
}: {
  avatar: StoryAvatar;
  color: string;
  size: number;
}) {
  if (avatar.kind === 'service') return <PaymentLogo method={avatar.method} size={size} rounded="full" />;
  if (avatar.kind === 'plan') return <PlanIcon method={avatar.method} color={color} size={size} />;
  const src = mediaUrl(avatar.src);
  return (
    <span
      className="relative block overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--story)_12%,white)]"
      style={{ width: size, height: size, '--story': color } as CSSProperties}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className={avatar.fit === 'cover' ? 'object-cover' : 'object-contain p-1.5'}
        />
      ) : null}
    </span>
  );
}

/**
 * «استوری»های بالای صفحهٔ اصلی: a row of rings, one per way to buy an iPhone
 * in instalments. A ring stays coloured until its story has been opened in
 * this browser, and turns grey after that; new slides make it colourful again.
 */
export function StoryBox({ groups }: { groups: StoryGroup[] }) {
  const seenRaw = useSyncExternalStore(subscribe, readSeen, () => '');
  const [open, setOpen] = useState<number | null>(null);
  if (groups.length === 0) return null;
  const seen = new Set(seenRaw.split('|'));
  const preload = () => void loadViewer();

  return (
    <section
      aria-label="استوری‌های خرید قسطی"
      className="-mx-4 sm:mx-0"
      onPointerEnter={preload}
      onFocus={preload}
    >
      <ul className="no-scrollbar flex gap-3 overflow-x-auto px-4 pt-1 pb-0.5 sm:gap-4 sm:px-0">
        {groups.map((group, index) => {
          const isSeen = seen.has(storySignature(group));
          return (
            <li key={group.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setOpen(index)}
                aria-label={`استوری ${group.label}${isSeen ? '' : '، تازه'}`}
                className="group flex w-[74px] flex-col items-center gap-1.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/50"
                style={{ '--story': group.color } as CSSProperties}
              >
                <span className="relative grid size-[68px] place-items-center transition-transform duration-200 group-hover:scale-[1.04] group-active:scale-95">
                  <span
                    aria-hidden
                    data-seen={isSeen || undefined}
                    className="story-ring absolute inset-0 rounded-full"
                  />
                  <span className="relative grid size-[63px] place-items-center rounded-full bg-canvas">
                    <StoryAvatarView avatar={group.avatar} color={group.color} size={57} />
                  </span>
                </span>
                <span
                  className={cn(
                    'w-full truncate text-center text-[11px] leading-4',
                    isSeen ? 'text-muted' : 'font-medium text-ink',
                  )}
                >
                  {group.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open !== null ? (
        <StoryViewer groups={groups} start={open} onClose={() => setOpen(null)} onSeen={markSeen} />
      ) : null}
    </section>
  );
}
