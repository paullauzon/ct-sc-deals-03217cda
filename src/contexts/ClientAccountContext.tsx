import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClientAccount, CSStage } from "@/types/clientAccount";
import { toast } from "sonner";

interface CtxValue {
  accounts: ClientAccount[];
  loading: boolean;
  refresh: () => Promise<void>;
  updateAccount: (id: string, updates: Partial<ClientAccount>) => Promise<void>;
  moveToStage: (id: string, stage: CSStage, extra?: Partial<ClientAccount>) => Promise<void>;
}

const ClientAccountContext = createContext<CtxValue | null>(null);

export function ClientAccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_accounts" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to fetch client accounts:", error);
      setLoading(false);
      return;
    }
    setAccounts((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("client_accounts_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_accounts" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const updateAccount = useCallback(async (id: string, updates: Partial<ClientAccount>) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    const { error } = await supabase.from("client_accounts" as any).update(updates as any).eq("id", id);
    if (error) {
      toast.error("Failed to save changes");
      refresh();
    }
  }, [refresh]);

  const moveToStage = useCallback(async (id: string, stage: CSStage, extra: Partial<ClientAccount> = {}) => {
    await updateAccount(id, { cs_stage: stage, ...extra });
  }, [updateAccount]);

  const value = useMemo(() => ({ accounts, loading, refresh, updateAccount, moveToStage }), [accounts, loading, refresh, updateAccount, moveToStage]);

  return <ClientAccountContext.Provider value={value}>{children}</ClientAccountContext.Provider>;
}

export function useClientAccounts() {
  const ctx = useContext(ClientAccountContext);
  if (!ctx) throw new Error("useClientAccounts must be used within ClientAccountProvider");
  return ctx;
}
