import { useEffect, useState } from 'react';

/** An object URL for the preview PNG of a recent document, or null while loading or when there is none. */
export function useThumbnail(path: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void window.victoria.recentThumbnail(path).then((bytes) => {
      if (!alive || !bytes) return;
      made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  return url;
}
