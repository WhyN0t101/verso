/** Holds the PNG of the card on screen and the object URL that shows it. */
export interface CardSlot {
  /** The image that Download, Share and Copy act on; null while a new one is being drawn or after a failure. */
  readonly blob: Blob | null;
  /** Forgets the current image and frees its URL. Called when a new render starts, so no action can use a stale card. */
  clear(): void;
  /** Stores a finished image and returns the URL that displays it. */
  set(blob: Blob): string;
}

export function createCardSlot(urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL): CardSlot {
  let blob: Blob | null = null;
  let url: string | null = null;
  const clear = (): void => {
    if (url) urls.revokeObjectURL(url);
    blob = null;
    url = null;
  };
  return {
    get blob() {
      return blob;
    },
    clear,
    set(next) {
      clear();
      blob = next;
      url = urls.createObjectURL(next);
      return url;
    },
  };
}
