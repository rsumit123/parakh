import { useState } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import type { ScanResult } from "./api/types";

function Shell() {
  const { token, guest, login } = useSession();
  const [result, setResult] = useState<ScanResult | null>(null);

  if (!token) {
    return <AuthScreen onGuest={guest} onEmailLogin={login} />;
  }

  if (result) {
    return <ResultScreen product={result.product} onScanAgain={() => setResult(null)} />;
  }

  return (
    <ScanScreen
      token={token}
      remaining={result ? (result as ScanResult).remaining : undefined}
      onResult={setResult}
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
