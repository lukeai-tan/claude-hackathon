import type { Deck } from '../model/types';
import { uid } from '../model/factory';

export const DECK_FILE_EXT = '.openslides.json';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(title: string): string {
  return (title || 'deck').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'deck';
}

export function exportDeckFile(deck: Deck) {
  const blob = new Blob([JSON.stringify({ format: 'openslides', ...deck })], { type: 'application/json' });
  downloadBlob(blob, `${safeFilename(deck.title)}${DECK_FILE_EXT}`);
}

/** Reads a .openslides.json file. Throws with a message the user can act on. */
export async function readDeckFile(file: File): Promise<Deck> {
  let data: any;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not an OpenSlides file. Choose a file ending in ${DECK_FILE_EXT}.`);
  }
  if (!data || !Array.isArray(data.slides) || !Array.isArray(data.layouts) || !data.theme || !data.size) {
    throw new Error(`${file.name} is missing slides or a theme, so it can't be opened.`);
  }
  const now = Date.now();
  const deck: Deck = {
    id: uid(),
    title: String(data.title ?? 'Imported deck'),
    version: 1,
    size: data.size,
    theme: data.theme,
    layouts: data.layouts,
    slides: data.slides,
    assets: data.assets ?? {},
    createdAt: now,
    updatedAt: now,
  };
  return deck;
}
