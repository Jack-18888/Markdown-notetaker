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
