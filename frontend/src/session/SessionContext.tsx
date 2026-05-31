import { createContext, useContext, useState, type ReactNode } from "react";
import { loadToken, clearToken, guestLogin, emailLogin, loadEmail, isGuestToken } from "./session";

interface SessionValue {
  token: string | null;
  isGuest: boolean;
  email: string | null;
  guest: () => Promise<void>;
  login: (email: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [email, setEmail] = useState<string | null>(() => loadEmail());

  const guest = async () => {
    setToken(await guestLogin());
    setEmail(null);
  };
  const login = async (e: string) => {
    setToken(await emailLogin(e));
    setEmail(e);
  };
  const signOut = () => {
    clearToken();
    setToken(null);
    setEmail(null);
  };

  return (
    <SessionContext.Provider
      value={{ token, isGuest: isGuestToken(token), email, guest, login, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
