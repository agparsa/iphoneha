import type { ReactNode } from 'react';
import { breadcrumbLd, jsonLdScript } from '@/lib/seo';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Date the legal texts were last changed — shown on every legal page. */
export const LEGAL_UPDATED_AT = '۳ مهر ۱۴۰۵';

/** Shared frame of the about, contact, terms and privacy pages. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  path,
  sections,
  updatedAt,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  path: string;
  sections?: LegalSection[];
  updatedAt?: string;
  children?: ReactNode;
}) {
  return (
    <div className="container-page py-5 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbLd([
            { name: 'خانه', href: '/' },
            { name: title, href: path },
          ]),
        )}
      />

      <header className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">{title}</h1>
        <div className="mt-4 text-[14px] leading-8 text-muted">{intro}</div>
        {updatedAt ? (
          <p className="mt-3 text-[12px] text-muted-faint">آخرین به‌روزرسانی: {updatedAt}</p>
        ) : null}
      </header>

      {sections && sections.length > 0 ? (
        <>
          <nav aria-label="فهرست" className="mt-8 max-w-3xl rounded-panel border border-line p-5">
            <p className="text-[13px] font-semibold text-ink">فهرست</p>
            <ol className="mt-3 grid gap-2 text-[13px] text-muted sm:grid-cols-2">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="hover:text-ink">
                    {(index + 1).toLocaleString('fa-IR')}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-8 max-w-3xl space-y-8">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-[17px] font-semibold text-ink">
                  {(index + 1).toLocaleString('fa-IR')}. {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-[14px] leading-8 text-ink-muted">{section.body}</div>
              </section>
            ))}
          </div>
        </>
      ) : null}

      {children}
    </div>
  );
}
