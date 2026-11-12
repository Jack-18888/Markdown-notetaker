import type { LifecycleAction, ResourceTarget } from './lifecycle.js';

export default function ResourceActions({
  target,
  onAction,
}: {
  target: ResourceTarget;
  onAction(action: LifecycleAction): void;
}) {
  return (
    <>
      {(['rename', 'move', 'delete'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          className={kind === 'delete' ? 'action-danger' : undefined}
          onClick={() => onAction({ kind, target })}
        >
          {kind[0]!.toUpperCase() + kind.slice(1)} {target.kind}
        </button>
      ))}
    </>
  );
}
