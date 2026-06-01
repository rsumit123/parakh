import { createContext, useContext, useState, type ReactNode } from "react";
import { loadToken, clearToken, guestLogin, googleLogin, loadEmail, isGuestToken } from "./session";

interface SessionValue {
  token: string | null;
  isGuest: boolean;
  email: string | null;
  guest: () => Promise<void>;
  loginGoogle: (credential: string) => Promise<void>;
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
  const loginGoogle = async (credential: string) => {
    const res = await googleLogin(credential);
    setToken(res.token);
    setEmail(res.email);
  };
  const signOut = () => {
    clearToken();
    setToken(null);
    setEmail(null);
  };

  return (
    <SessionContext.Provider
      value={{ token, isGuest: isGuestToken(token), email, guest, loginGoogle, signOut }}
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
