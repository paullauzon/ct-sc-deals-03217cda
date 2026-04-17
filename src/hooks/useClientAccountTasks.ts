import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClientAccountTask } from "@/types/clientAccount";

export function useClientAccountTasks(accountId: string | null) {
  const [tasks, setTasks] = useState<ClientAccountTask[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!accountId) { setTasks([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("client_account_tasks" as any)
      .select("*")
      .eq("account_id", accountId)
      .order("sequence_order", { ascending: true });
    if (!error) setTasks((data as any) || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const completeTask = useCallback(async (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done", completed_at: new Date().toISOString() } : t));
    await supabase.from("client_account_tasks" as any).update({
      status: "done", completed_at: new Date().toISOString()
    } as any).eq("id", taskId);
  }, []);

  return { tasks, loading, completeTask, refetch: fetchTasks };
}
