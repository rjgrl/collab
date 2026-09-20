import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import type { ComponentProps, ReactNode } from "react";

export function DataTable({
  headers,
  children,
  search,
  onSearch,
  searchPlaceholder,
  toolbar,
}: {
  headers: string[];
  children: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onSearch ? (
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder ?? "Search"}
            className="max-w-sm"
          />
        ) : (
          <div />
        )}
        {toolbar}
      </div>
      <div className="overflow-x-auto ring-1 ring-foreground/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="border-t border-border/70">{children}</tr>;
}

export function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={className ?? "px-3 py-2 align-top"}>{children}</td>;
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function QuietButton(props: ComponentProps<typeof Button>) {
  return <Button variant="outline" size="sm" {...props} />;
}
