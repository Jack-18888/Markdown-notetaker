const breaks = /\r\n|\r|\n/g;

export function normalizedSource(source: string) {
  return source.replace(breaks, '\n');
}

/** A textarea normalizes newlines. Map its changed span onto the exact draft. */
export function reconcileSource(
  previous: string,
  next: string,
  pasted?: string,
) {
  const normalized = normalizedSource(previous);
  if (normalized === next) return previous;
  let start = 0;
  while (start < normalized.length && normalized[start] === next[start])
    start++;
  let end = normalized.length;
  let nextEnd = next.length;
  while (
    end > start &&
    nextEnd > start &&
    normalized[end - 1] === next[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  const offsets = [0];
  for (let index = 0; index < previous.length; index++) {
    if (previous[index] === '\r' && previous[index + 1] === '\n') index++;
    offsets.push(index + 1);
  }
  const inserted = next.slice(start, nextEnd);
  const exact =
    pasted !== undefined && normalizedSource(pasted) === inserted
      ? pasted
      : inserted.replaceAll('\n', previous.match(breaks)?.[0] ?? '\n');
  return (
    previous.slice(0, offsets[start]) + exact + previous.slice(offsets[end])
  );
}
