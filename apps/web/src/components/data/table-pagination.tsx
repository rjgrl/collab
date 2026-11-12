import { useId } from "react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { FormSelect } from "@/components/forms/form-select";
import { PAGE_SIZES, type PageSize } from "@/components/data/page-controls";

/** Previous/next pager for server lists that do not report a total. */
export function TablePagination({
  label = "Table pagination",
  page,
  onPage,
  hasNext,
  pending,
  pageSize,
  onPageSize,
}: {
  label?: string;
  page: number;
  onPage: (page: number) => void;
  hasNext: boolean;
  pending: boolean;
  /** With onPageSize, shows a 10/25/50 rows-per-page select. */
  pageSize?: PageSize;
  onPageSize?: (size: PageSize) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {pageSize && onPageSize ? (
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
      ) : (
        <span />
      )}
      <nav aria-label={label} className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous page
        </Button>
        <span role="status" className="px-2 text-muted-foreground tabular-nums">
          Page {page}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !hasNext}
          onClick={() => onPage(page + 1)}
        >
          Next page
        </Button>
      </nav>
    </div>
  );
}
