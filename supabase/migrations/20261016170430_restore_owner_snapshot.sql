-- Restore the current Owner projection after an earlier migration was inadvertently replayed.
create or replace function public.owner_business_snapshot(p_days integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; tenants jsonb; begin
 if not private.is_platform_owner() then raise exception 'Acesso exclusivo do proprietário' using errcode='42501'; end if;
 base:=public.owner_business_snapshot_base(p_days);
 select coalesce(jsonb_agg(t || jsonb_build_object(
 'completed_bookings',(select count(*) from public.agenda_events a where a.estabelecimento_id=(t->>'id')::uuid and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'received_bookings',(select count(distinct a.id) from public.caixa_itens c join public.agenda_events a on a.id=c.agenda_event_id where c.estabelecimento_id=(t->>'id')::uuid and c.status_caixa='pago' and c.pago_em is not null and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'first_value_at',(select min(c.pago_em) from public.caixa_itens c join public.agenda_events a on a.id=c.agenda_event_id where c.estabelecimento_id=(t->>'id')::uuid and c.status_caixa='pago' and c.pago_em is not null and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'))),'[]') into tenants from jsonb_array_elements(base->'tenants') t;
 return jsonb_set(base,'{tenants}',tenants);
end $$;
revoke all on function public.owner_business_snapshot(integer) from public,anon;
grant execute on function public.owner_business_snapshot(integer) to authenticated;
