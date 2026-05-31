import { useState } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import type { ScanResult } from "./api/types";

function Shell() {
  const { token, guest, login, signOut } = useSession();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);

  const handleResult = (r: ScanResult) => {
    setRemaining(r.remaining);
    setResult(r);
  };

  if (!token) {
    return <AuthScreen onGuest={guest} onEmailLogin={login} />;
  }

  if (result) {
    return <ResultScreen product={result.product} onScanAgain={() => setResult(null)} />;
  }

  return (
    <ScanScreen
      token={token}
      remaining={remaining}
      onResult={handleResult}
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
