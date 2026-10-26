-- Competitive pricing: no additional fee or hard cap per professional
-- on the same AgendaAI establishment. Preserve all authorization/RLS and identity triggers.
-- A prior trigger rejected the 6th active professional for starter/basico.
drop trigger if exists enforce_professional_limit on public.profissionais;
comment on function private.enforce_professional_limit() is
  'Legacy cap check no longer attached: AgendaAI does not price by per-professional calendar.';
