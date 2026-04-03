-- ============================================================
-- Correção RLS: Adicionar políticas de escrita para usuários autenticados
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/vvanjarfwdxtzklogysy/sql/new
-- ============================================================

-- SERVIÇOS — usuário autenticado pode gerenciar tudo
CREATE POLICY "Autenticado gerencia servicos INSERT"
  ON public.servicos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticado gerencia servicos UPDATE"
  ON public.servicos FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticado gerencia servicos DELETE"
  ON public.servicos FOR DELETE
  USING (auth.role() = 'authenticated');

-- HORÁRIOS — usuário autenticado pode gerenciar tudo
CREATE POLICY "Autenticado gerencia horarios INSERT"
  ON public.horarios_funcionamento FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticado gerencia horarios UPDATE"
  ON public.horarios_funcionamento FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticado gerencia horarios DELETE"
  ON public.horarios_funcionamento FOR DELETE
  USING (auth.role() = 'authenticated');

-- CLIENTES — corrigir policy genérica (a anterior era muito restrita)
DROP POLICY IF EXISTS "Admin clientes" ON public.clientes;

CREATE POLICY "Autenticado gerencia clientes"
  ON public.clientes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- WORKFLOWS — corrigir policy genérica
DROP POLICY IF EXISTS "Admin workflows" ON public.workflows;

CREATE POLICY "Autenticado gerencia workflows"
  ON public.workflows FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- AGENDA EVENTS — completar policies de insert para clientes não autenticados
-- (o portal público /agendar precisa inserir sem login)
DROP POLICY IF EXISTS "Clientes podem criar agenda" ON public.agenda_events;
DROP POLICY IF EXISTS "Admin agenda update/delete" ON public.agenda_events;
DROP POLICY IF EXISTS "Admin agenda delete" ON public.agenda_events;

CREATE POLICY "Qualquer um pode criar agendamento"
  ON public.agenda_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Autenticado atualiza agenda"
  ON public.agenda_events FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticado deleta agenda"
  ON public.agenda_events FOR DELETE
  USING (auth.role() = 'authenticated');
