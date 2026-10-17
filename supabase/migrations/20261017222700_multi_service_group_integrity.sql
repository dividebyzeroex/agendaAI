-- Group bookings behave as a unit for cancellation/no-show. A staff slot may
-- still be removed through remove_attendance_service before checkout.
-- Do not let calendar drag/drop silently desynchronize group members.
create or replace function private.protect_multi_service_group_times()
returns trigger language plpgsql security definer set search_path to ''
as $fn$
begin
  if coalesce(old.metadata ? 'parent_event_id',false) then
    if (new.start is distinct from old.start or new."end" is distinct from old."end"
       or new.profissional_id is distinct from old.profissional_id)
       and exists(select 1 from public.agenda_events e
          where e.id=(old.metadata->>'parent_event_id')::uuid
            and e.estabelecimento_id=old.estabelecimento_id
            and e.status not in ('cancelado','noshow'))
    then
      raise exception 'Para reagendar, cancele e recrie o atendimento agrupado antes da cobrança';
    end if;
  elsif (
      new.start is distinct from old.start or new."end" is distinct from old."end"
      or new.profissional_id is distinct from old.profissional_id
    ) and exists(
      select 1 from public.agenda_events e where e.estabelecimento_id=old.estabelecimento_id
        and e.metadata->>'parent_event_id'=old.id::text
        and e.status not in ('cancelado','noshow')
    ) then
      raise exception 'Para reagendar um atendimento com múltiplos serviços, cancele e crie uma nova reserva';
  end if;
  return new;
end $fn$;

drop trigger if exists protect_multi_service_group_times on public.agenda_events;
create trigger protect_multi_service_group_times
before update of start,"end",profissional_id on public.agenda_events
for each row execute function private.protect_multi_service_group_times();

create or replace function private.cascade_multi_service_group_cancel()
returns trigger language plpgsql security definer set search_path to ''
as $fn$
begin
  if new.status in ('cancelado','noshow') and
    new.status is distinct from old.status and
    not (coalesce(new.metadata,'{}'::jsonb) ? 'parent_event_id') then
    update public.agenda_events e
      set status=new.status
      where e.estabelecimento_id=new.estabelecimento_id
        and e.metadata->>'parent_event_id'=new.id::text
        and e.status not in ('cancelado','noshow')
        and not e.cobranca_enviada;
  end if;
  return null;
end $fn$;

drop trigger if exists cascade_multi_service_group_cancel on public.agenda_events;
create trigger cascade_multi_service_group_cancel
after update of status on public.agenda_events
for each row execute function private.cascade_multi_service_group_cancel();
