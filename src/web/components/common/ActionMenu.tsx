import { Children, isValidElement, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Keep secondary controls mounted in an accessible menu without changing handlers.
export function ActionMenu({
  children,
  label = "More actions",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
          <span>More</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="action-menu min-w-56 max-w-[calc(100vw-2rem)]"
      >
        {Children.map(children, (child) =>
          isValidElement<{ disabled?: boolean }>(child) ? (
            <DropdownMenuItem asChild disabled={child.props.disabled}>
              {child}
            </DropdownMenuItem>
          ) : null,
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
