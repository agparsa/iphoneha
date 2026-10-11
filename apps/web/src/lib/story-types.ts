import type { CreditMethod, InstallmentMethod } from '@iphoneha/shared';

/**
 * The shape of the home page stories (built on the server by lib/stories.ts).
 * Kept free of the copy helpers so the story row adds almost nothing to the
 * home page's JavaScript.
 */

export type StoryAvatar =
  | { kind: 'image'; src: string; fit: 'contain' | 'cover' }
  | { kind: 'service'; method: InstallmentMethod }
  | { kind: 'plan'; method: CreditMethod };

export interface StoryPicture {
  src: string;
  /** plain <img> sources for the static banners (next/image serves the others) */
  srcSet?: string;
  alt: string;
  /** a service's own 4:5 banner fills the story; a phone floats; a cover sits on top */
  shape: 'banner' | 'product' | 'cover';
}

/** A figure in large type, e.g. «قسط ماهانه از ۱۲٬۰۰۰٬۰۰۰ تومان». */
export interface StoryStat {
  label: string;
  value: string;
  /** «تومان», set smaller after the figure */
  unit?: string;
  /** what the figure assumes, in small type under it */
  note?: string;
}

export interface StorySlide {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  /** short facts or steps, one per line */
  points?: string[];
  /** numbered steps rather than facts */
  ordered?: boolean;
  /** one or two figures side by side */
  stats?: StoryStat[];
  /** without one, the story's own icon or logo floats in the empty space */
  picture?: StoryPicture;
  cta: { label: string; href: string };
}

export interface StoryGroup {
  id: string;
  /** under the circle */
  label: string;
  color: string;
  avatar: StoryAvatar;
  slides: StorySlide[];
}

/** Changes whenever a story gets new slides, so an updated story shows as unseen again. */
export function storySignature(group: StoryGroup): string {
  return `${group.id}:${group.slides.map((slide) => slide.id).join(',')}`;
}
