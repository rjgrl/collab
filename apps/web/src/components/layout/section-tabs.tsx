import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

/**
 * Pill bar that switches between the sections of one page. Each tab is a router `Link` carrying
 * `sectionTabClass`; give section links `activeOptions={{ exact: true, includeSearch: true }}` so
 * only the open section is marked current.
 */
export function SectionTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      aria-label={label}
      className="flex w-full flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-card sm:w-fit"
    >
      {children}
    </nav>
  );
}

export const sectionTabClass =
  "inline-flex min-h-10 grow items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground pointer-coarse:min-h-11 sm:grow-0";

/**
 * Open section of a tabbed page, read from `?tab=` in the address. The first key is the default
 * and is written as no `tab` at all. An unknown or unavailable `tab` is replaced in the address,
 * so the address, the marked tab and the shown section always agree.
 */
export function useSectionTab<Key extends string>(
  keys: readonly Key[],
  fromHash?: (hash: string) => Key | undefined,
): Key {
  const router = useRouter();
  // Same location the tab links compare against; route search would keep stale or unknown keys.
  const { pathname, hash, requested } = useLocation({
    select: (location) => ({
      pathname: location.pathname,
      hash: location.hash,
      requested: (location.search as { tab?: unknown }).tab,
    }),
  });
  const [fallback] = keys;
  const tab =
    keys.find((key) => key === requested) ??
    (requested === undefined ? fromHash?.(hash) : undefined) ??
    fallback;
  const canonical = tab === fallback ? undefined : tab;

  useEffect(() => {
    if (requested === canonical) return;
    void router.navigate({
      href: `${pathname}${canonical ? `?tab=${canonical}` : ""}${hash ? `#${hash}` : ""}`,
      replace: true,
      resetScroll: false,
    });
  }, [requested, canonical, pathname, hash, router]);

  return tab;
}
