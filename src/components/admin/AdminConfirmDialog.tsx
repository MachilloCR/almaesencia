import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "primary",
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border-subtle bg-surface-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-text-primary shadow-[0_20px_40px_-8px_rgba(44,26,35,0.16)] backdrop:bg-admin-overlay/45 backdrop:backdrop-blur-sm sm:pb-5"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={event => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      ref={dialogRef}
    >
      <h2 className="font-display text-xl font-semibold" id={titleId}>{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary" id={descriptionId}>{description}</p>
      <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <button
          className="min-h-11 min-w-28 rounded-full border border-border-subtle px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait disabled:bg-admin-disabled-bg disabled:text-admin-disabled-text sm:w-auto"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {cancelLabel}
        </button>
        <button
          aria-busy={busy}
          className={tone === "danger"
            ? "min-h-11 min-w-28 rounded-full border border-admin-error px-4 text-sm font-semibold text-admin-error transition-colors hover:bg-admin-error-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-error disabled:cursor-wait disabled:border-border-subtle disabled:bg-admin-disabled-bg disabled:text-admin-disabled-text"
            : "min-h-11 min-w-28 rounded-full bg-brand-primary px-4 text-sm font-semibold text-admin-on-primary transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-admin-disabled-bg disabled:text-admin-disabled-text"}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
