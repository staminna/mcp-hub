import { useState, type ReactNode } from "react";
import type { HealthResult } from "../api.ts";

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="loading">
      <Spinner /> {label}
    </div>
  );
}

export type Health = HealthResult["status"] | "checking";

export function Lamp({ status, title }: { status: Health; title?: string }) {
  const text = { healthy: "Healthy", unhealthy: "Unhealthy", unknown: "Not checked", checking: "Checking…" }[status];
  return (
    <span className={`lamp lamp-${status}`} title={title ?? text}>
      <span className="lamp-dot" />
      <span className="lamp-text">{text}</span>
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** A button that asks for a second click instead of a browser confirm() dialog. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel,
  className = "btn btn-danger",
  disabled,
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="confirm">
      <button className="btn btn-ghost" onClick={() => setArmed(false)}>Keep</button>
      <button className={className} onClick={() => { setArmed(false); onConfirm(); }} disabled={disabled} autoFocus>
        {confirmLabel}
      </button>
    </span>
  ) : (
    <button className={className} onClick={() => setArmed(true)} disabled={disabled}>
      {children}
    </button>
  );
}

/** Summarise a sync result in one sentence. */
export function syncSummary(r: { added: string[]; updated: string[]; unmanaged: string[]; skipped: { id: string }[]; error?: string }): string {
  if (r.error) return r.error;
  const parts = [
    r.added.length && `${r.added.length} added`,
    r.updated.length && `${r.updated.length} updated`,
    r.unmanaged.length && `${r.unmanaged.length} unmanaged kept`,
    r.skipped.length && `${r.skipped.length} skipped (missing .env vars: ${r.skipped.map((s) => s.id).join(", ")})`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Already in sync";
}
