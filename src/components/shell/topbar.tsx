import Link from "next/link";
import { Fragment } from "react";
import { MobileMenuButton } from "./app-shell";

export type Crumb = { label: string; href?: string };

/** Topbar 64 px: trilha à esquerda, ferramentas da tela ao centro/direita (UI_LAYOUT §3.2). */
export function Topbar({ crumbs, children }: { crumbs: Crumb[]; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-4 border-b border-border bg-surface px-4 py-3 md:px-8">
      <MobileMenuButton />
      <nav aria-label="Trilha" className="min-w-0 text-sm font-semibold text-text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <li aria-hidden="true">/</li> : null}
                <li className="truncate">
                  {last || !c.href ? (
                    <span className={last ? "text-text" : undefined} aria-current={last ? "page" : undefined}>
                      {c.label}
                    </span>
                  ) : (
                    <Link href={c.href} className="hover:text-navy hover:underline">
                      {c.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
      {children ? <div className="flex flex-1 flex-wrap items-center justify-end gap-3">{children}</div> : null}
    </header>
  );
}

/** Contêiner de conteúdo: padding 28/32/40, max-width 1240 (1320 no editor). */
export function PageContent({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`flex w-full flex-col gap-6 px-4 pt-6 pb-10 md:px-8 md:pt-7 ${wide ? "max-w-[1320px]" : "max-w-[1240px]"}`}>{children}</div>;
}
