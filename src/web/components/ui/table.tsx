import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }
>(({ className, containerClassName, ...props }, ref) => {
  const localRef = React.useRef<HTMLTableElement>(null);
  React.useImperativeHandle(ref, () => localRef.current!);
  React.useEffect(() => {
    const table = localRef.current;
    if (!table) return;
    const labelCells = () => {
      const labels = Array.from(table.querySelectorAll("thead th")).map(cell => cell.textContent?.trim() || "");
      table.querySelectorAll("tbody tr").forEach(row => {
        Array.from(row.children).forEach((cell, index) => {
          if (cell instanceof HTMLTableCellElement && cell.colSpan === 1) cell.dataset.label = labels[index] || "";
        });
      });
    };
    labelCells();
    const observer = new MutationObserver(labelCells);
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  });
  return <div className={cn("responsive-table relative w-full min-w-0 overflow-x-auto", containerClassName)}>
    <table ref={localRef} role="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>;
});
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} role="rowgroup" className={cn("border-b border-border", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} role="rowgroup" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    role="row"
    className={cn(
      "border-b border-border transition-colors hover:bg-white/[0.02]",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    role="columnheader"
    className={cn(
      "h-10 px-4 text-left align-middle text-xs font-semibold text-muted-foreground",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} role="cell" className={cn("p-4 align-middle text-sm", className)} {...props} />
));
TableCell.displayName = "TableCell";
