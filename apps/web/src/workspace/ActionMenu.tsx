import { useEffect, useRef, type ReactNode } from 'react';

/** Native disclosure: Tab visits actions; Escape and outside clicks return to the page. */
export default function ActionMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        ref.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, []);
  return (
    <details
      className="action-menu"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          ref.current?.removeAttribute('open');
          ref.current?.querySelector('summary')?.focus();
        }
      }}
    >
      <summary role="button" aria-label={label} title={label}>
        <span aria-hidden="true">···</span>
      </summary>
      <div className="action-menu-items" role="group" aria-label={label}>
        {children}
      </div>
    </details>
  );
}
