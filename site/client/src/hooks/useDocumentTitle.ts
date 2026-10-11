import { useEffect } from 'react';

export const SITE_NAME = 'Study Hubs';

/** Sets `document.title` to "<page> · Study Hubs" (or just the site name when `page` is omitted). */
export function useDocumentTitle(page?: string): void {
  useEffect(() => {
    document.title = page ? `${page} · ${SITE_NAME}` : SITE_NAME;
  }, [page]);
}
