import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
export function TablePagination({
  page,
  onPage,
  hasNext,
  pending,
}: {
  page: number;
  onPage: (page: number) => void;
  hasNext: boolean;
  pending: boolean;
}) {
  return (
    <nav aria-label="Table pagination" className="flex items-center justify-end gap-3 text-sm">
      <Button variant="outline" disabled={pending || page <= 1} onClick={() => onPage(page - 1)}>
        Previous page
      </Button>
      <span role="status">Page {page}</span>
      <Button variant="outline" disabled={pending || !hasNext} onClick={() => onPage(page + 1)}>
        Next page
      </Button>
    </nav>
  );
}
