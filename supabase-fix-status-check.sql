-- Atualiza a constraint de status da agenda para suportar o novo status "em_atendimento" e "concluido" (Checkout/PDV)
ALTER TABLE public.agenda_events DROP CONSTRAINT IF EXISTS agenda_events_status_check;
ALTER TABLE public.agenda_events ADD CONSTRAINT agenda_events_status_check CHECK (status in ('confirmado', 'pendente', 'cancelado', 'concluido', 'noshow', 'em_atendimento'));
