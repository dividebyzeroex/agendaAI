-- ============================================================
-- AgendaAi — Módulo de Profissionais
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela de profissionais
CREATE TABLE IF NOT EXISTS public.profissionais (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  nome             text    NOT NULL,
  especialidade    text,
  bio              text,
  foto_url         text,
  telefone         text,
  email            text,
  cor_agenda       text    DEFAULT '#1a73e8',  -- cor na agenda
  valor_hora       numeric(10,2) DEFAULT 0,
  ativo            boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- Disponibilidades do profissional (por dia da semana)
CREATE TABLE IF NOT EXISTS public.profissional_disponibilidades (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id  uuid    REFERENCES public.profissionais(id) ON DELETE CASCADE,
  dia_semana       int     NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  dia_nome         text    NOT NULL,
  ativo            boolean DEFAULT true,
  hora_inicio      time,
  hora_fim         time
);

-- Especializações/habilidades do profissional
CREATE TABLE IF NOT EXISTS public.profissional_servicos (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id  uuid    REFERENCES public.profissionais(id) ON DELETE CASCADE,
  servico_id       uuid    REFERENCES public.servicos(id) ON DELETE CASCADE,
  valor_proprio    numeric(10,2),  -- pode ter valor diferente do serviço padrão
  UNIQUE(profissional_id, servico_id)
);

-- RLS: SELECT público (para o portal do profissional e agendamento)
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_disponibilidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pub_select_profissionais"          ON public.profissionais;
DROP POLICY IF EXISTS "pub_select_prof_disp"             ON public.profissional_disponibilidades;
DROP POLICY IF EXISTS "pub_select_prof_servicos"         ON public.profissional_servicos;
DROP POLICY IF EXISTS "admin_all_profissionais"          ON public.profissionais;
DROP POLICY IF EXISTS "admin_all_prof_disp"              ON public.profissional_disponibilidades;
DROP POLICY IF EXISTS "admin_all_prof_servicos"          ON public.profissional_servicos;

CREATE POLICY "pub_select_profissionais"  ON public.profissionais
  FOR SELECT USING (ativo = true);

CREATE POLICY "pub_select_prof_disp" ON public.profissional_disponibilidades
  FOR SELECT USING (true);

CREATE POLICY "pub_select_prof_servicos" ON public.profissional_servicos
  FOR SELECT USING (true);

CREATE POLICY "admin_all_profissionais"  ON public.profissionais
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_prof_disp" ON public.profissional_disponibilidades
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_prof_servicos" ON public.profissional_servicos
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed: disponibilidades padrão para novos profissionais (via trigger optional)
-- Verificação
SELECT 'profissionais' AS tabela, COUNT(*) FROM public.profissionais;
