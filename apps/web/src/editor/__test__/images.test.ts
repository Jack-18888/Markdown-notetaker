// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { DOMParser } from '@milkdown/kit/prose/model';
import { rich } from './editor-fixture.js';
import { assessSource } from '../source-policy.js';
import { isLocalImageUrl } from '@markdown-note-taker/contracts';

const src = '/api/images/123e4567-e89b-42d3-a456-426614174000';
it('renders local images with alt/title, selection, and a readable load failure', async () => {
  const { view, close } = await rich(`![Example](${src} "Title")`);
  try {
    const img = view.dom.querySelector<HTMLImageElement>('.note-image img')!;
    expect(img.getAttribute('src')).toBe(src);
    expect(img.alt).toBe('Example');
    expect(img.title).toBe('Title');
    img.dispatchEvent(new Event('error'));
    expect(img.hidden).toBe(true);
    expect(view.dom.textContent).toContain('Image unavailable: Example');
  } finally {
    close();
  }
});

it.each([
  'https://example.com/x.png',
  '//example.com/x',
  'data:image/png;base64,AA',
  'blob:x',
  '../image.png',
  '/api/images/invalid',
  `${src}?x=1`,
  `${src}/extra`,
])('blocks noncanonical image source %s', async (url) => {
  expect(isLocalImageUrl(url)).toBe(false);
  expect(assessSource(`![alt](${url})`)).toBe('unsupported');
  const { view, close } = await rich('Before');
  try {
    const dom = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', url);
    dom.append(img);
    const parsed = DOMParser.fromSchema(view.state.schema).parse(dom);
    expect(JSON.stringify(parsed.toJSON())).not.toContain('"type":"image"');
    const image = view.state.schema.nodes.image!.create({ src: url });
    view.dispatch(view.state.tr.insert(1, image));
    expect(view.dom.querySelector('img[src]')).toBeNull();
  } finally {
    close();
  }
});
