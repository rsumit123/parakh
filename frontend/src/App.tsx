import { useState } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ProfileMenu } from "./components/ProfileMenu";
import { addToHistory, loadHistory, clearHistory, type HistoryEntry } from "./session/history";
import type { Product, ScanResult } from "./api/types";

type View = "home" | "scan" | "history";

function Shell() {
  const { token, isGuest, email, guest, login, signOut } = useSession();
  const [view, setView] = useState<View>("home");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const handleResult = (r: ScanResult) => {
    setRemaining(r.remaining);
    setHistory(addToHistory(r.product, Date.now()));
    setResult(r);
  };

  const showProduct = (product: Product) => {
    setResult({ source: product.source, remaining: remaining ?? 0, product });
  };

  if (!token) {
    return <AuthScreen onGuest={guest} onEmailLogin={login} />;
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

  if (result) {
    return (
      <div style={{ position: "relative", minHeight: "100%" }}>
        {profile("dark")}
        <ResultScreen
          product={result.product}
          onScanAgain={() => { setResult(null); setView("home"); }}
        />
      </div>
    );
  }

  if (view === "history") {
    return (
      <HistoryScreen
        entries={history}
        onBack={() => setView("home")}
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
        onResult={handleResult}
        onBack={() => setView("home")}
        onAuthError={signOut}
      />
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      {profile("light")}
      <HomeScreen
        token={token}
        remaining={remaining}
        onResult={handleResult}
        onOpenCamera={() => setView("scan")}
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
