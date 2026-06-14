import type { ScanResult, Product } from "../api/types";
import type { MealEstimate } from "../api/diet";

/** Screen-stack navigation. stack[0] is always a tab root (home/explore/history);
 * the active screen is the top of the stack. The whole stack is serialized into
 * history.state so the device Back button can restore the previous stack. */

export type Tab = "home" | "explore" | "today" | "history";
export type Screen =
  | { t: "home" } | { t: "explore" } | { t: "history" }
  | { t: "today" }
  | { t: "mealCapture" }
  | { t: "confirmMeal"; estimate: MealEstimate }
  | { t: "targets" }
  | { t: "category"; category: string }
  | { t: "scan" }
  | { t: "result"; result: ScanResult }
  | { t: "compare"; a: Product; b: Product };
export type Stack = Screen[];

export function top(stack: Stack): Screen { return stack[stack.length - 1]; }
export function activeTab(stack: Stack): Tab { return stack[0].t as Tab; }
export function isTabRoot(s: Screen): boolean {
  return s.t === "home" || s.t === "explore" || s.t === "history" || s.t === "today";
}
export function push(stack: Stack, screen: Screen): Stack { return [...stack, screen]; }
export function selectTab(_stack: Stack, tab: Tab): Stack { return [{ t: tab }]; }
export function pushResultFromScan(stack: Stack, result: ScanResult): Stack {
  const base = top(stack).t === "scan" ? stack.slice(0, -1) : stack;
  return [...base, { t: "result", result }];
}
export function pop(stack: Stack): Stack {
  if (stack.length > 1) return stack.slice(0, -1);
  return stack[0].t === "home" ? stack : [{ t: "home" }];
}
