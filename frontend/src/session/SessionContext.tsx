import { createContext, useContext, useState, type ReactNode } from "react";
import { loadToken, clearToken, guestLogin, emailLogin } from "./session";

interface SessionValue {
  token: string | null;
  guest: () => Promise<void>;
  login: (email: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadToken());

  const guest = async () => setToken(await guestLogin());
  const login = async (email: string) => setToken(await emailLogin(email));
  const signOut = () => {
    clearToken();
    setToken(null);
  };

  return (
    <SessionContext.Provider value={{ token, guest, login, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
