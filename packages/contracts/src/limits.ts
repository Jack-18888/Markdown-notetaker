/** Input caps for Markdown, HTTP, and import validation. */
export const limits = {
  /** Unicode code points per name/title. */
  nameCharacters: 200,
  /** UTF-8 bytes of raw Markdown content. */
  markdownBytes: 1024 * 1024,
  /** Incoming HTTP body bytes. */
  requestBytes: 2 * 1024 * 1024,
  /** Raw Markdown file bytes before import. */
  markdownImportBytes: 256 * 1024,
} as const;

/** UTF-8 size without Node/DOM APIs. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
