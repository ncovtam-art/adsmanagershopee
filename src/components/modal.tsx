"use client";
import { useEffect, useRef } from "react";
export function Modal({
  children,
  labelledBy,
  onClose,
  pending,
  compact,
  sidePanel,
}: {
  children: React.ReactNode;
  labelledBy: string;
  onClose: () => void;
  pending?: boolean;
  compact?: boolean;
  sidePanel?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`modal ${compact ? "compact" : ""} ${sidePanel ? "side-panel" : ""}`}
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
    >
      {children}
    </dialog>
  );
}
