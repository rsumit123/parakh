/** Pure navigation-depth logic for back-button (History API) support.
 * Screen depth: 0 = Home, 1 = Scan/History/Result, 2 = Compare (over Result). */

export interface NavState {
  view: "home" | "scan" | "history";
  hasResult: boolean;
  hasCompare: boolean;
}

export function navDepth(s: NavState): 0 | 1 | 2 {
  if (s.hasCompare) return 2;
  if (s.hasResult || s.view === "scan" || s.view === "history") return 1;
  return 0;
}

/** Where the app should land when the browser pops back to `depth`. */
export function unwindTo(s: NavState, depth: number): NavState {
  if (depth <= 0) return { view: "home", hasResult: false, hasCompare: false };
  if (depth === 1) return { ...s, hasCompare: false };
  return s;
}
