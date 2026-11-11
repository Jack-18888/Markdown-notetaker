import { useLayoutEffect, useId, useRef, type ReactNode } from 'react';
import './dialogs.css';

export default function Modal({
  title,
  pending,
  onDismiss,
  children,
}: {
  title: string;
  pending: boolean;
  onDismiss(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="workspace-dialog"
      aria-labelledby={titleId}
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onDismiss();
      }}
    >
      <p className="workspace-eyebrow">Your workspace</p>
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
