CREATE TABLE public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  playbook text NOT NULL,
  sequence_order integer NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  ai_content text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to lead_tasks" ON public.lead_tasks FOR ALL USING (true) WITH CHECK (true);