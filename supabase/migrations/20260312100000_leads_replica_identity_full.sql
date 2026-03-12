-- Enable full replica identity so realtime UPDATE events include the complete row
-- Required for the scoring system to push score/tier updates to the frontend
ALTER TABLE public.leads REPLICA IDENTITY FULL;
