import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy*/waitFor wait up to 1 s by default. The full suite runs its files in parallel, and lazy
// route chunks or storage events can take longer than that on a busy CI runner, so wait up to
// 4 s: a broken page still fails, only later.
configure({ asyncUtilTimeout: 4000 });

// jsdom doesn't implement scrolling; Layout scrolls to the top on navigation.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
