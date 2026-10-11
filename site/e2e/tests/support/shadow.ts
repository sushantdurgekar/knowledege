/**
 * Reaching into the bridge's CLOSED shadow roots (the AI modal and the floating menu).
 *
 * Page scripts and Playwright locators cannot see inside a closed shadow root, which is the
 * point of closing it. The Chrome DevTools Protocol can: DOM.describeNode with `pierce`
 * returns the flat tree, Accessibility.queryAXTree returns what assistive tech sees, and a
 * real mouse click at a node's box proves it is on top and clickable. Nothing is injected into
 * the page and the shadow roots stay closed. Chromium only (the suite is Chromium-only).
 */
import type { CDPSession, Page } from '@playwright/test';

export interface DomNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
  shadowRootType?: 'user-agent' | 'open' | 'closed';
}

export interface AxNode {
  role: string;
  name: string;
  ignored: boolean;
  backendDOMNodeId?: number;
}

export const AI_DIALOG_HOST = 'studyhubs-ai-dialog';
export const CHROME_HOST = 'studyhubs-chrome';

const sessions = new WeakMap<Page, Promise<CDPSession>>();

/** One CDP session per page, created on first use. */
export function cdp(page: Page): Promise<CDPSession> {
  let session = sessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  return session;
}

/** Run `fn` with a remote handle to `document.querySelector(selector)`, or null when absent. */
async function withElement<T>(page: Page, selector: string, fn: (objectId: string, s: CDPSession) => Promise<T>) {
  const session = await cdp(page);
  const objectGroup = `e2e-${Math.random().toString(36).slice(2)}`;
  try {
    const { result } = await session.send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      objectGroup,
    });
    if (!result.objectId) return null; // the selector matched nothing
    return await fn(result.objectId, session);
  } finally {
    await session.send('Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);
  }
}

/** The light-DOM element `hostSelector` with its whole subtree, closed shadow roots included. */
export async function shadowTree(page: Page, hostSelector: string): Promise<DomNode | null> {
  return withElement(page, hostSelector, async (objectId, s) => {
    const { node } = await s.send('DOM.describeNode', { objectId, depth: -1, pierce: true });
    return node as DomNode;
  });
}

/** Every node under `root` (children and shadow roots, depth first) that passes `pred`. */
export function findNodes(root: DomNode | null, pred: (n: DomNode) => boolean): DomNode[] {
  const out: DomNode[] = [];
  const walk = (n: DomNode) => {
    if (pred(n)) out.push(n);
    for (const c of n.shadowRoots ?? []) walk(c);
    for (const c of n.children ?? []) walk(c);
  };
  if (root) walk(root);
  return out;
}

/** Attribute value of an element node, or null. */
export function attr(node: DomNode, name: string): string | null {
  const a = node.attributes ?? [];
  for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1];
  return null;
}

export const byAttr =
  (name: string, value?: string) =>
  (n: DomNode): boolean =>
    n.nodeType === 1 && (value === undefined ? attr(n, name) !== null : attr(n, name) === value);

/** Text content of a node (style and script text excluded), whitespace collapsed. */
export function textOf(node: DomNode): string {
  const parts: string[] = [];
  const walk = (n: DomNode) => {
    if (n.nodeType === 3) parts.push(n.nodeValue);
    if (n.localName === 'style' || n.localName === 'script') return;
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** The first node under the host `hostSelector` matching `pred`; throws a readable error otherwise. */
export async function shadowNode(page: Page, hostSelector: string, pred: (n: DomNode) => boolean, what: string) {
  const tree = await shadowTree(page, hostSelector);
  if (!tree) throw new Error(`<${hostSelector}> is not in the page (looking for ${what})`);
  const [node] = findNodes(tree, pred);
  if (!node) throw new Error(`${what} not found inside <${hostSelector}>`);
  return node;
}

/**
 * Click the centre of a node with the real mouse. If something else covers it (hub content
 * over the menu, say), the click lands on that instead and the test's next assertion fails.
 */
export async function clickNode(page: Page, node: DomNode): Promise<void> {
  const s = await cdp(page);
  await s.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: node.backendNodeId });
  const { model } = await s.send('DOM.getBoxModel', { backendNodeId: node.backendNodeId });
  const q = model.border; // [x1,y1, x2,y2, x3,y3, x4,y4] in CSS px of the main frame viewport
  const x = (q[0] + q[2] + q[4] + q[6]) / 4;
  const y = (q[1] + q[3] + q[5] + q[7]) / 4;
  await page.mouse.click(x, y);
}

/** Accessibility nodes under the host `hostSelector` (flat tree) with this role and/or name. */
export async function axQuery(
  page: Page,
  hostSelector: string,
  query: { role?: string; name?: string },
): Promise<AxNode[]> {
  const nodes = await withElement(page, hostSelector, async (objectId, s) => {
    const res = await s.send('Accessibility.queryAXTree', {
      objectId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.name ? { accessibleName: query.name } : {}),
    });
    return res.nodes;
  });
  return (nodes ?? []).map((n) => ({
    role: String(n.role?.value ?? ''),
    name: String(n.name?.value ?? ''),
    ignored: !!n.ignored,
    backendDOMNodeId: n.backendDOMNodeId,
  }));
}

/** Names of the visible (non-ignored) dialogs the AI modal exposes to assistive tech. */
export async function visibleDialogs(page: Page): Promise<string[]> {
  const nodes = await axQuery(page, AI_DIALOG_HOST, { role: 'dialog' });
  return nodes.filter((n) => !n.ignored).map((n) => n.name);
}
