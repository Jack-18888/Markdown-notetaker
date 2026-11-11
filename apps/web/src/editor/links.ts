/** Shared by imported links and future link controls. Never normalize into trust. */
export function isSafeLink(href: string): boolean {
  if (
    !href ||
    href.includes('\\') ||
    [...href].some((character) => {
      const point = character.codePointAt(0)!;
      return (
        point <= 32 || (point >= 127 && point <= 159) || /\s/u.test(character)
      );
    })
  )
    return false;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1];
  if (scheme) return ['http', 'https', 'mailto'].includes(scheme.toLowerCase());
  return (
    !href.startsWith('//') &&
    !href.includes('&') &&
    !href.split(/[/?#]/, 1)[0]?.includes(':')
  );
}
