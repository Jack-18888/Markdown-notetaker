const paths = {
  folder: 'M1.5 4h5l1.5 2h6.5v7h-13z',
  note: 'M4 1.5h5L12.5 5v9H4z M9 1.5V5h3.5 M6 8h4 M6 11h4',
  edit: 'm10 2 4 4-8 8H2v-4z M8.5 3.5l4 4',
  panel: 'M1.5 2h13v12h-13z M5.5 2v12 M3.5 5h.01 M3.5 8h.01',
  code: 'm5 4-4 4 4 4 M11 4l4 4-4 4 M9 2 7 14',
  link: 'm6 10 4-4 M5 7 3 9a3 3 0 0 0 4 4l2-2 M7 5l2-2a3 3 0 0 1 4 4l-2 2',
  undo: 'M5 3 1.5 6.5 5 10 M2 6.5h7a4 4 0 0 1 0 8',
  redo: 'm11 3 3.5 3.5L11 10 M14 6.5H7a4 4 0 0 0 0 8',
} as const;
export type IconName = keyof typeof paths;

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
