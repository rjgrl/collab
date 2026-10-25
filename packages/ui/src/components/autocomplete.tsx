import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { ChevronDownIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "./input";

export function Autocomplete({
  value,
  onValueChange,
  items,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  items: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <AutocompletePrimitive.Root
      items={items}
      value={value}
      onValueChange={onValueChange}
      disabled={props.disabled}
      readOnly={props.readOnly}
      openOnInputClick
      open={open}
      onOpenChange={setOpen}
    >
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <AutocompletePrimitive.Input {...props} render={<Input className="pr-10" />} />
        <AutocompletePrimitive.Trigger
          aria-label="Show suggestions"
          className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed"
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </AutocompletePrimitive.Trigger>
      </div>
      {open && (
        <AutocompletePrimitive.Portal>
          <AutocompletePrimitive.Positioner sideOffset={4} align="start" className="z-50">
            {/* shortcut: Base UI Popup hides the surrounding form; restore it when editable inputs support nonmodal focus. */}
            <div
              data-slot="autocomplete-content"
              className="max-h-[min(var(--available-height),20rem)] w-(--anchor-width) max-w-(--available-width) overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
            >
              <AutocompletePrimitive.Empty className="px-3 py-2.5 text-sm text-muted-foreground">
                Use your entered suffix.
              </AutocompletePrimitive.Empty>
              <AutocompletePrimitive.List>
                {(item: string) => (
                  <AutocompletePrimitive.Item
                    key={item}
                    value={item}
                    onClick={() => {
                      onValueChange(item);
                      setOpen(false);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-2.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {item}
                  </AutocompletePrimitive.Item>
                )}
              </AutocompletePrimitive.List>
            </div>
          </AutocompletePrimitive.Positioner>
        </AutocompletePrimitive.Portal>
      )}
    </AutocompletePrimitive.Root>
  );
}
