import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  default_brand: string;
  created_at: string;
}

export type AppRole = "admin" | "rep";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  role: null,
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

async function loadProfileAndRole(userId: string): Promise<{ profile: UserProfile | null; role: AppRole | null }> {
  const [profileRes, roleRes] = await Promise.all([
    supabase.from("profiles").select("id, name, email, default_brand, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  return {
    profile: (profileRes.data as UserProfile | null) ?? null,
    role: ((roleRes.data as any)?.role as AppRole) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      setRole(null);
      return;
    }
    // Defer to avoid blocking the auth callback
    setTimeout(async () => {
      const { profile, role } = await loadProfileAndRole(s.user.id);
      setProfile(profile);
      setRole(role);
    }, 0);
  };

  useEffect(() => {
    // CRITICAL: subscribe BEFORE getSession to avoid missing the initial event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      hydrate(newSession);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setLoading(false);
      hydrate(existing);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { profile, role } = await loadProfileAndRole(session.user.id);
    setProfile(profile);
    setRole(role);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role,
        isAdmin: role === "admin",
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
