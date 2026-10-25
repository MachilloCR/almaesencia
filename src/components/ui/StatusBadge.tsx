import type { ReactNode } from "react";

type StatusContext = "product" | "order" | "procurement" | "fulfillment" | "payment";
type StatusBadgeProps = {
  context: StatusContext;
  status: string;
  size?: "compact" | "default";
};

type StatusStyle = { label: string; color: string; icon: "check" | "x" | "clock" | "info" | "progress" | "double-check" | "package" };

const statusStyles: Record<StatusContext, Record<string, StatusStyle>> = {
  product: {
    in_stock: { label: "Disponible", color: "bg-status-success", icon: "check" },
    on_order: { label: "Por encargo", color: "bg-status-warning", icon: "clock" },
    out_of_stock: { label: "Agotado", color: "bg-status-error", icon: "x" },
    inactive: { label: "Inactivo", color: "bg-status-neutral", icon: "x" },
    unavailable: { label: "No disponible", color: "bg-status-neutral", icon: "x" },
  },
  order: {
    pending_review: { label: "Pendiente de revisión", color: "bg-status-warning", icon: "clock" },
    confirmed: { label: "Confirmado", color: "bg-status-info", icon: "check" },
    cancelled: { label: "Cancelado", color: "bg-status-neutral", icon: "x" },
    completed: { label: "Completado", color: "bg-status-complete", icon: "double-check" },
  },
  procurement: {
    not_required: { label: "No requerido", color: "bg-status-neutral", icon: "info" },
    pending_supplier: { label: "Por solicitar", color: "bg-status-warning", icon: "clock" },
    ordered: { label: "Solicitado al proveedor", color: "bg-status-info", icon: "package" },
    received: { label: "Recibido", color: "bg-status-success", icon: "check" },
  },
  fulfillment: {
    pending: { label: "Pendiente", color: "bg-status-neutral", icon: "clock" },
    ready: { label: "Listo", color: "bg-status-process", icon: "progress" },
    delivered: { label: "Entregado", color: "bg-status-success", icon: "check" },
  },
  payment: {
    pending: { label: "Pendiente", color: "bg-status-warning", icon: "clock" },
    partial: { label: "Abono parcial", color: "bg-status-info", icon: "progress" },
    paid: { label: "Pagado", color: "bg-status-success", icon: "check" },
  },
};

export function getStatusLabel(context: StatusContext, status: string) {
  return statusStyles[context][status]?.label ?? status;
}

const iconPaths: Record<StatusStyle["icon"], ReactNode> = {
  check: <path d="m5 12 4 4L19 6" />,
  x: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  progress: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3" /></>,
  "double-check": <><path d="m2.5 12 4 4L16 6" /><path d="m10 14 2.5 2.5L21.5 7" /></>,
  package: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8m-9 5v9" /></>,
};

export default function StatusBadge({ context, status, size = "default" }: StatusBadgeProps) {
  const style = statusStyles[context][status];
  const label = getStatusLabel(context, status);

  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full ${style?.color ?? "bg-status-neutral"} px-3 py-1.5 text-xs font-semibold leading-4 text-white ${size === "compact" ? "px-2.5 py-1" : ""}`}>
      <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {iconPaths[style?.icon ?? "info"]}
      </svg>
      <span className="min-w-0 whitespace-normal">{label}</span>
    </span>
  );
}
