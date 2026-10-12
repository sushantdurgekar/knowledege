/** Full-page navigation, behind an object so tests can replace it (jsdom cannot navigate). */
export const pageNavigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
