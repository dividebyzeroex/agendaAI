-- Emergency pressure relief; keeps workflows enabled, without touching payments or customer rows.
-- Observed: growth dispatch every five minutes and nine cron startup timeouts in 24h.
-- Finance/WhatsApp/email run every ten minutes; heavier maintenance is staggered in the worker.
do $$
declare stale_job bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    -- Reuses the named job (pg_cron updates its schedule), does not create a second worker.
    perform cron.schedule(
      'agendaai-growth-workers',
      '*/10 * * * *',
      'select private.dispatch_growth_worker()'
    );

    -- Remove ONLY the old placeholder integration which cannot authenticate.
    -- Never unschedule another customer-facing job by an arbitrary job number.
    for stale_job in
      select jobid from cron.job
      where command ilike '%https://xxx.supabase.co/%'
        and command ilike '%YOUR_ANON_KEY%'
    loop
      perform cron.unschedule(stale_job);
    end loop;
  end if;
end $$;
