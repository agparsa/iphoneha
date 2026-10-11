import { Children, isValidElement, type ReactNode } from 'react';
import Link from 'next/link';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { headingId } from '@/lib/markdown';

/** The text inside rendered Markdown children (for heading anchors). */
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children);
      return '';
    })
    .join('');
}

const components: Components = {
  h2: ({ children }) => <h2 id={headingId(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={headingId(textOf(children))}>{children}</h3>,
  a: ({ href = '', children }) =>
    // links inside the site stay client-side; anything else opens in a new tab
    href.startsWith('/') || href.startsWith('#') ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table>{children}</table>
    </div>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element -- Markdown images carry no size for next/image
    <img
      src={typeof src === 'string' ? src : ''}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      className="rounded-2xl"
    />
  ),
};

/**
 * An article's Markdown as HTML. GitHub-flavoured (tables, lists); raw HTML in
 * the text is not rendered, so whatever is typed in the admin editor can only
 * ever produce these elements.
 */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="article-body">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
