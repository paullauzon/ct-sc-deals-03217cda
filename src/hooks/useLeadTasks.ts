import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LeadTask {
  id: string;
  lead_id: string;
  playbook: string;
  sequence_order: number;
  task_type: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
  ai_content: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useLeadTasks(leadIds?: string[]) {
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    let query = supabase.from("lead_tasks").select("*").eq("status", "pending").order("due_date", { ascending: true });
    if (leadIds && leadIds.length > 0) {
      query = query.in("lead_id", leadIds);
    }
    const { data, error } = await query.limit(500);
    if (error) { console.error("Failed to fetch tasks:", error); return; }
    setTasks((data as LeadTask[]) || []);
    setLoading(false);
  }, [leadIds?.join(",")]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const completeTask = useCallback(async (taskId: string) => {
    const { error } = await supabase.from("lead_tasks").update({ status: "done", completed_at: new Date().toISOString() } as any).eq("id", taskId);
    if (!error) setTasks(prev => prev.filter(t => t.id !== taskId));
    return !error;
  }, []);

  const skipTask = useCallback(async (taskId: string) => {
    const { error } = await supabase.from("lead_tasks").update({ status: "skipped" } as any).eq("id", taskId);
    if (!error) setTasks(prev => prev.filter(t => t.id !== taskId));
    return !error;
  }, []);

  return { tasks, loading, completeTask, skipTask, refetch: fetchTasks };
}
