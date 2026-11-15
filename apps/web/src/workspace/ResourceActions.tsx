import type { ReactNode } from 'react';
import ActionDisclosure from './ActionDisclosure.js';
import type { LifecycleAction, ResourceTarget } from './lifecycle.js';

export default function ResourceActions({
  target,
  onAction,
  children,
}: {
  target: ResourceTarget;
  onAction(action: LifecycleAction): void;
  children?: ReactNode;
}) {
  return (
    <ActionDisclosure
      key={target.value.id}
      label={target.kind === 'note' ? 'Note actions' : 'Folder actions'}
    >
      <button
        type="button"
        onClick={() => onAction({ kind: 'rename', target })}
      >
        Rename {target.kind}
      </button>
      <button type="button" onClick={() => onAction({ kind: 'move', target })}>
        Move {target.kind}
      </button>
      {children}
      <button
        type="button"
        className="action-danger"
        onClick={() => onAction({ kind: 'delete', target })}
      >
        Delete {target.kind}
      </button>
    </ActionDisclosure>
  );
}
