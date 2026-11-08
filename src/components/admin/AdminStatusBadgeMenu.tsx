import { useEffect, useId, useRef, useState } from "react";
import StatusBadge, { getStatusLabel } from "../ui/StatusBadge";

type StatusContext = "order" | "procurement" | "fulfillment";
type MenuAlignment = "left" | "right";

export type AdminStatusOption = {
  value: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
};

type Props = {
  context: StatusContext;
  label: string;
  status: string;
  options: AdminStatusOption[];
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: string) => void;
};

export default function AdminStatusBadgeMenu({ context, label, status, options, disabled = false, busy = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [alignment, setAlignment] = useState<MenuAlignment>("left");
  const [menuMaxWidth, setMenuMaxWidth] = useState(256);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  const menuId = useId();

  function updateMenuPlacement() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const availableRight = Math.max(0, viewportWidth - 16 - rect.left);
    const availableLeft = Math.max(0, rect.right - 16);
    const alignLeft = availableRight >= availableLeft;
    const availableSpace = alignLeft ? availableRight : availableLeft;

    setAlignment(alignLeft ? "left" : "right");
    setMenuMaxWidth(Math.min(256, availableSpace));
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPlacement);
    window.visualViewport?.addEventListener("resize", updateMenuPlacement);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPlacement);
      window.visualViewport?.removeEventListener("resize", updateMenuPlacement);
    };
  }, [open]);

  useEffect(() => {
    if (wasBusy.current && !busy) triggerRef.current?.focus();
    wasBusy.current = busy;
  }, [busy]);

  function choose(value: string) {
    setOpen(false);
    triggerRef.current?.focus();
    onChange(value);
  }

  return (
    <div
      className="relative inline-flex max-w-full"
      onBlurCapture={event => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
      ref={rootRef}
    >
      <button
        aria-busy={busy}
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={`Cambiar estado de ${label}. Actual: ${getStatusLabel(context, status)}`}
        className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        disabled={disabled}
        onClick={() => {
          if (!open) updateMenuPlacement();
          setOpen(current => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <StatusBadge context={context} status={status} size="compact" />
        <svg aria-hidden="true" className="size-3.5 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <div
        aria-label={`Opciones de ${label}`}
        className={`absolute ${alignment === "left" ? "left-0" : "right-0"} top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border-subtle bg-admin-surface-elevated p-1.5 text-text-primary shadow-[0_12px_28px_-4px_rgba(134,54,93,0.16)]`}
        hidden={!open}
        id={menuId}
        role="group"
        style={{ maxWidth: `${menuMaxWidth}px` }}
      >
        {options.map(option => {
          const selected = option.value === status;
          const unavailable = option.disabled || selected;
          return (
            <button
              aria-pressed={selected}
              className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${selected ? "bg-brand-primary-soft text-brand-primary" : "text-text-primary hover:bg-admin-hover"} disabled:cursor-not-allowed disabled:opacity-65`}
              disabled={disabled || unavailable}
              key={option.value}
              onClick={() => choose(option.value)}
              title={option.disabledReason}
              type="button"
            >
              <span>{option.label}</span>
              {selected ? <span className="text-xs">Actual</span> : option.disabledReason ? <span className="text-right text-[10px] font-medium leading-4 text-text-secondary">{option.disabledReason}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
