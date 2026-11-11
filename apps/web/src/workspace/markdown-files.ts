import {
  limits,
  markdownSchema,
  nameSchema,
} from '@markdown-note-taker/contracts';

export function importTitle(filename: string) {
  return filename.replace(/\.md$/i, '').trim() || 'Untitled';
}

/** Decode strictly and keep the BOM, whitespace, and line endings as source. */
export async function readMarkdownFile(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
): Promise<string> {
  if (!/\.md$/i.test(file.name)) throw new Error('Choose a .md Markdown file.');
  if (file.size > limits.markdownImportBytes)
    throw new Error('Choose a Markdown file of 256 KiB or less.');
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error('The file could not be read. Choose it again and retry.');
  }
  if (bytes.byteLength > limits.markdownImportBytes)
    throw new Error('Choose a Markdown file of 256 KiB or less.');
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error('The file is not valid UTF-8. Save it as UTF-8 and retry.');
  }
  if (!markdownSchema.safeParse(content).success)
    throw new Error(
      'The Markdown content is invalid. Check the file and retry.',
    );
  return content;
}

export function validImportTitle(title: string) {
  return nameSchema.safeParse(title).success;
}

/** A single portable filename, including on Windows; no paths or reserved names. */
export function markdownFilename(title: string): string {
  let stem = Array.from(title, (character) => {
    const point = character.codePointAt(0)!;
    return point < 32 ||
      (point >= 127 && point <= 159) ||
      (point >= 0x202a && point <= 0x202e) ||
      (point >= 0x2066 && point <= 0x2069)
      ? '_'
      : character;
  })
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '');
  stem = Array.from(stem)
    .slice(0, 60)
    .join('')
    .replace(/[. ]+$/g, '');
  if (!stem) stem = 'Untitled';
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem))
    stem = '_' + stem;
  return stem + '.md';
}

export function downloadMarkdown(title: string, content: string) {
  // Text bytes avoid platform newline conversion and retain a leading BOM.
  const url = URL.createObjectURL(
    new Blob([new TextEncoder().encode(content)], {
      type: 'text/markdown;charset=utf-8',
    }),
  );
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = markdownFilename(title);
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
