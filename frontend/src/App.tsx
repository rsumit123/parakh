import { useState, useEffect } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { navDepth } from "./session/nav";
import { AuthScreen } from "./screens/AuthScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { CompareScreen } from "./screens/CompareScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ProfileMenu } from "./components/ProfileMenu";
import { addToHistory, loadHistory, clearHistory, type HistoryEntry } from "./session/history";
import type { Product, ScanResult } from "./api/types";

type View = "home" | "scan" | "history";

function Shell() {
  const { token, isGuest, email, guest, loginGoogle, signOut } = useSession();
  const [view, setView] = useState<View>("home");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [compare, setCompare] = useState<{ a: Product; b: Product } | null>(null);

  // Back-button support: push a browser history entry when navigating to a deeper
  // screen so the device Back button (and on-screen back) walk back through the app
  // (Compare→Result→Home, Scan/History→Home) instead of leaving the site.
  useEffect(() => {
    const depth = navDepth({ view, hasResult: !!result, hasCompare: !!compare });
    const current = (window.history.state?.depth as number | undefined) ?? 0;
    if (depth > current) window.history.pushState({ depth }, "");
  }, [view, result, compare]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const target = (e.state?.depth as number | undefined) ?? 0;
      if (target <= 0) {
        setCompare(null);
        setResult(null);
        setView("home");
      } else if (target === 1) {
        setCompare(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleResult = (r: ScanResult) => {
    setRemaining(r.remaining);
    setHistory(addToHistory(r.product, Date.now()));
    setResult(r);
  };

  const showProduct = (product: Product) => {
    setResult({ source: product.source, remaining: remaining ?? 0, product });
  };

  if (!token) {
    return <AuthScreen onGuest={guest} onGoogleLogin={loginGoogle} />;
  }

  // The profile menu floats top-right over every signed-in screen.
  const profile = (variant: "light" | "dark") => (
    <div style={{ position: "absolute", top: 16, right: 16, zIndex: 40 }}>
      <ProfileMenu
        label={email ?? "Guest"}
        isGuest={isGuest}
        variant={variant}
        onHistory={() => { setResult(null); setView("history"); }}
        onSignOut={signOut}
      />
    </div>
  );

  if (compare) {
    return <CompareScreen a={compare.a} b={compare.b} onBack={() => window.history.back()} />;
  }

  if (result) {
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        {profile("dark")}
        <ResultScreen
          product={result.product}
          alternatives={result.alternatives ?? []}
          onCompare={(alt) => setCompare({ a: result.product, b: alt })}
          onScanAgain={() => window.history.back()}
        />
      </div>
    );
  }

  if (view === "history") {
    return (
      <HistoryScreen
        entries={history}
        onBack={() => window.history.back()}
        onOpen={showProduct}
        onClear={() => { clearHistory(); setHistory([]); }}
      />
    );
  }

  if (view === "scan") {
    return (
      <ScanScreen
        token={token}
        remaining={remaining}
        isGuest={isGuest}
        onResult={handleResult}
        onBack={() => window.history.back()}
        onSignIn={signOut}
        onAuthError={signOut}
      />
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "100dvh" }}>
      {profile("light")}
      <HomeScreen
        token={token}
        remaining={remaining}
        isGuest={isGuest}
        history={history}
        onResult={handleResult}
        onOpenCamera={() => setView("scan")}
        onOpenProduct={showProduct}
        onSeeHistory={() => { setResult(null); setView("history"); }}
        onSignIn={signOut}
        onAuthError={signOut}
      />
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
