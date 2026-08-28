-- 1. Banco de Dados: Adicionar coluna metadata JSONB nas tabelas principais
-- Isso permite o comportamento "Camaleão" de dados sem sujar o schema base.

ALTER TABLE IF EXISTS public.clientes 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.agenda_events 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.estabelecimento 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.profissionais 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Atualizar as RPCs para aceitarem metadata

create or replace function create_cliente_safe(p_data jsonb)
returns public.clientes language plpgsql security invoker as $$
declare
  v_res public.clientes;
begin
  insert into public.clientes (estabelecimento_id, nome, telefone, email, nascimento, observacoes, ultima_visita, faltas, metadata)
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'nome',
    p_data->>'telefone',
    p_data->>'email',
    (p_data->>'nascimento')::date,
    p_data->>'observacoes',
    (p_data->>'ultima_visita')::timestamp,
    coalesce((p_data->>'faltas')::integer, 0),
    coalesce(p_data->'metadata', '{}'::jsonb)
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function update_cliente_safe(p_id uuid, p_changes jsonb)
returns setof public.clientes language plpgsql security invoker as $$
begin
  update public.clientes 
  set 
    nome = coalesce(p_changes->>'nome', nome),
    telefone = coalesce(p_changes->>'telefone', telefone),
    email = coalesce(p_changes->>'email', email),
    nascimento = coalesce((p_changes->>'nascimento')::date, nascimento),
    observacoes = coalesce(p_changes->>'observacoes', observacoes),
    ultima_visita = coalesce((p_changes->>'ultima_visita')::timestamptz, ultima_visita),
    faltas = coalesce((p_changes->>'faltas')::integer, faltas),
    metadata = coalesce(p_changes->'metadata', metadata)
  where id = p_id;
  return query select * from public.clientes where id = p_id;
end; $$;

create or replace function create_agenda_event_safe(p_data jsonb)
returns public.agenda_events language plpgsql security invoker as $$
declare
  v_res public.agenda_events;
begin
  insert into public.agenda_events (
    estabelecimento_id, title, start, "end", "backgroundColor", "allDay", 
    cliente_id, servico_id, profissional_id, status, observacoes, metadata
  )
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'title',
    (p_data->>'start')::timestamptz,
    (p_data->>'end')::timestamptz,
    coalesce(p_data->>'backgroundColor', '#1a73e8'),
    coalesce((p_data->>'allDay')::boolean, false),
    (p_data->>'cliente_id')::uuid,
    (p_data->>'servico_id')::uuid,
    (p_data->>'profissional_id')::uuid,
    coalesce(p_data->>'status', 'pendente'),
    p_data->>'observacoes',
    coalesce(p_data->'metadata', '{}'::jsonb)
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function update_event_safe(p_id uuid, p_changes jsonb)
returns setof public.agenda_events language plpgsql security invoker as $$
begin
  update public.agenda_events 
  set 
    title = coalesce(p_changes->>'title', title),
    start = coalesce((p_changes->>'start')::timestamptz, start),
    "end" = coalesce((p_changes->>'end')::timestamptz, "end"),
    status = coalesce(p_changes->>'status', status),
    observacoes = coalesce(p_changes->>'observacoes', observacoes),
    profissional_id = coalesce((p_changes->>'profissional_id')::uuid, profissional_id),
    metadata = coalesce(p_changes->'metadata', metadata)
  where id = p_id;
  return query select * from public.agenda_events where id = p_id;
end; $$;
