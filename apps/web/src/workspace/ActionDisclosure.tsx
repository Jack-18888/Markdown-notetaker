import { useEffect, useRef, type ReactNode } from 'react';

export default function ActionDisclosure({
  label,
  iconOnly = false,
  children,
}: {
  label: string;
  iconOnly?: boolean;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  useEffect(() => {
    const dismiss = (event: Event) => {
      const element = details.current;
      // Keep the invoking control available for native dialog focus restoration.
      if (
        element?.open &&
        event.target instanceof Node &&
        !element.contains(event.target) &&
        !document.querySelector('dialog[open]')
      ) {
        if (element.contains(document.activeElement)) summary.current?.focus();
        element.open = false;
      }
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
      className="action-disclosure"
      ref={details}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        summary.current?.focus();
      }}
    >
      <summary
        className={
          iconOnly ? 'quiet-button action-disclosure-icon' : 'quiet-button'
        }
        ref={summary}
        role="button"
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        {iconOnly ? <span aria-hidden="true">⋯</span> : label}
      </summary>
      <div className="action-disclosure-items">{children}</div>
    </details>
  );
}
