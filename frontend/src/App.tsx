import { useState } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import type { ScanResult } from "./api/types";

type View = "home" | "scan";

function Shell() {
  const { token, guest, login, signOut } = useSession();
  const [view, setView] = useState<View>("home");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);

  const handleResult = (r: ScanResult) => {
    setRemaining(r.remaining);
    setResult(r);
  };

  if (!token) {
    return <AuthScreen onGuest={guest} onEmailLogin={login} />;
  }

  // A result always takes precedence; "Scan another" returns to Home (camera off).
  if (result) {
    return (
      <ResultScreen
        product={result.product}
        onScanAgain={() => { setResult(null); setView("home"); }}
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
    <HomeScreen
      token={token}
      remaining={remaining}
      onResult={handleResult}
      onOpenCamera={() => setView("scan")}
      onAuthError={signOut}
    />
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
