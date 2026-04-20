DROP TRIGGER IF EXISTS trg_enforce_stage_v2_gates ON public.leads;
CREATE TRIGGER trg_enforce_stage_v2_gates
  BEFORE UPDATE OF stage ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_v2_gates();