import { useId, useState } from "react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { FormSelect } from "@/components/forms/form-select";

export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageWindow(page: number, pages: number): (number | null)[] {
  const sorted = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  return sorted.flatMap((n, index) => (index > 0 && n - sorted[index - 1]! > 1 ? [null, n] : [n]));
}

/** Client-side paging over rows already loaded. Clamps the page when rows shrink. */
export function usePagedRows<T>(rows: readonly T[], initialSize: PageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  return {
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pageSize,
    total: rows.length,
    setPage,
    setPageSize: (size: PageSize) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

/** "Showing x–y of n", a rows-per-page select and numbered pages. Hidden when there are no rows. */
export function PageControls({
  label,
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pending = false,
}: {
  label: string;
  page: number;
  pageSize: PageSize;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  pending?: boolean;
}) {
  const id = useId();
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-muted-foreground tabular-nums">
          Showing {first}–{last} of {total}
        </p>
        <div className="flex items-center gap-2">
          <span id={`${id}-rows`} className="text-muted-foreground">
            Rows per page
          </span>
          <FormSelect
            aria-labelledby={`${id}-rows`}
            className="w-20"
            value={String(pageSize)}
            onValueChange={(value) => onPageSize(Number(value) as PageSize)}
            items={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          />
        </div>
      </div>
      {pages > 1 ? (
        <nav aria-label={label} className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => onPage(page - 1)}
          >
            Previous page
          </Button>
          {pageWindow(page, pages).map((n, index) =>
            n === null ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1">
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === page ? "default" : "ghost"}
                size="sm"
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
                disabled={pending && n !== page}
                onClick={() => onPage(n)}
              >
                {n}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages || pending}
            onClick={() => onPage(page + 1)}
          >
            Next page
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
