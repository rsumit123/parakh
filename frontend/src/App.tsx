import { useState, useEffect, type ReactNode } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { CompareScreen } from "./screens/CompareScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ExploreScreen } from "./screens/ExploreScreen";
import { CategoryScreen } from "./screens/CategoryScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TabBar } from "./components/TabBar";
import { ProfileMenu } from "./components/ProfileMenu";
import { PortionSheet } from "./components/PortionSheet";
import {
  push, selectTab, pushResultFromScan, top, activeTab, type Stack, type Tab,
} from "./session/nav";
import { addToHistory, loadHistory, clearHistory, type HistoryEntry } from "./session/history";
import { defaultServingG } from "./diet/portion";
import { addLog, type Macros } from "./api/diet";
import type { Product, ScanResult } from "./api/types";

function Shell() {
  const { token, isGuest, email, guest, loginGoogle, signOut } = useSession();
  const [stack, setStack] = useState<Stack>([{ t: "home" }]);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [portionFor, setPortionFor] = useState<Product | null>(null);

  // Mirror the screen stack into browser history so the device Back button restores it.
  useEffect(() => {
    window.history.replaceState({ stack: [{ t: "home" }] }, "");
    const onPop = (e: PopStateEvent) => {
      const s = e.state?.stack as Stack | undefined;
      setStack(s && s.length ? s : [{ t: "home" }]);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: Stack, mode: "push" | "replace" = "push") => {
    setStack(next);
    if (mode === "replace") window.history.replaceState({ stack: next }, "");
    else window.history.pushState({ stack: next }, "");
  };
  const back = () => window.history.back();

  const handleResult = (r: ScanResult) => {
    setRemaining(r.remaining);
    setHistory(addToHistory(r.product, Date.now()));
    go(pushResultFromScan(stack, r), "replace");
  };
  const showProduct = (product: Product) => {
    go(push(stack, { t: "result", result: { source: product.source, remaining: remaining ?? 0, product } }));
  };

  const requireUser = (): boolean => {
    if (isGuest) { signOut(); return false; }
    return true;
  };
  const startAddToday = (product: Product) => { if (requireUser()) setPortionFor(product); };
  const confirmPortion = async (grams: number) => {
    const p = portionFor;
    if (!p || !token) return;
    setPortionFor(null);
    try {
      await addLog(token, { kind: "packaged", barcode: p.barcode, name: p.name,
        brand: p.brand, quantity_g: grams });
      go(selectTab(stack, "today"));
    } catch { /* surfaced on Today refetch */ }
  };

  if (!token) return <AuthScreen onGuest={guest} onGoogleLogin={loginGoogle} />;

  const cur = top(stack);
  const profile = (variant: "light" | "dark") => (
    <div style={{ position: "absolute", top: 16, right: 16, zIndex: 60 }}>
      <ProfileMenu label={email ?? "Guest"} isGuest={isGuest} variant={variant}
        onHistory={() => go(selectTab(stack, "history"))} onSignOut={signOut} />
    </div>
  );
  const tabbed = (node: ReactNode, variant: "light" | "dark") => (
    <div style={{ position: "relative", minHeight: "100dvh", paddingBottom: 64 }}>
      {profile(variant)}
      {node}
      <TabBar active={activeTab(stack) as Tab} onSelect={(t) => go(selectTab(stack, t))} />
    </div>
  );

  if (cur.t === "compare") {
    return <CompareScreen a={cur.a} b={cur.b} onBack={back} />;
  }
  if (cur.t === "result") {
    const r = cur.result;
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        {profile("dark")}
        <ResultScreen
          product={r.product}
          alternatives={r.alternatives ?? []}
          onCompare={(alt) => go(push(stack, { t: "compare", a: r.product, b: alt }))}
          onScanAgain={back}
          onAddToday={startAddToday}
        />
        {portionFor && (
          <PortionSheet title={`${portionFor.name} · ${portionFor.brand}`}
            per100g={portionFor.nutrition as Macros}
            defaultGrams={defaultServingG(portionFor.serving_size_g, portionFor.category ?? "")}
            onCancel={() => setPortionFor(null)} onConfirm={confirmPortion} />
        )}
      </div>
    );
  }
  if (cur.t === "scan") {
    return (
      <ScanScreen token={token} remaining={remaining} isGuest={isGuest}
        onResult={handleResult} onBack={back} onSignIn={signOut} onAuthError={signOut} />
    );
  }
  if (cur.t === "category") {
    return <CategoryScreen token={token} category={cur.category} onOpenProduct={showProduct} onBack={back} />;
  }
  if (cur.t === "explore") {
    return tabbed(
      <ExploreScreen token={token}
        onOpenCategory={(c) => go(push(stack, { t: "category", category: c }))}
        onOpenProduct={showProduct} />, "light");
  }
  if (cur.t === "history") {
    return tabbed(
      <HistoryScreen entries={history} onBack={back} onOpen={showProduct}
        onClear={() => { clearHistory(); setHistory([]); }} />, "light");
  }
  if (cur.t === "today") {
    if (isGuest) { signOut(); return null; }
    return tabbed(
      <TodayScreen token={token}
        onAddFood={() => go(push(stack, { t: "mealCapture" }))}
        onOpenTargets={() => go(push(stack, { t: "targets" }))} />, "light");
  }
  if (cur.t === "mealCapture" || cur.t === "confirmMeal" || cur.t === "targets") {
    return <div style={{ padding: 40 }}>Coming up next… <button onClick={back}>Back</button></div>;
  }
  return tabbed(
    <HomeScreen remaining={remaining} isGuest={isGuest} history={history}
      onOpenCamera={() => go(push(stack, { t: "scan" }))}
      onOpenProduct={showProduct} onSeeHistory={() => go(selectTab(stack, "history"))}
      onSignIn={signOut} />, "light");
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
