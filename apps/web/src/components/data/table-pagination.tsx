import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
export function TablePagination({
  label = "Table pagination",
  page,
  onPage,
  hasNext,
  pending,
}: {
  label?: string;
  page: number;
  onPage: (page: number) => void;
  hasNext: boolean;
  pending: boolean;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-end gap-2 text-sm">
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
  );
}
