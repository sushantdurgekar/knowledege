// Minimal typing for the slice of jsdom the bundle smoke test uses (avoids an @types dependency).
declare module "jsdom" {
  export interface ConstructorOptions {
    url?: string;
    runScripts?: "dangerously" | "outside-only";
    beforeParse?(window: Window): void;
  }
  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: Window & typeof globalThis;
  }
}
