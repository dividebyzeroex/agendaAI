# AgendaAI — auditoria emergencial de CPU PostgreSQL

Data do diagnóstico: 2026-10-18. Projeto: `supabase-agendai` (região us-west-2). Usuário informou CPU em 98%.

## Evidências observadas (janela de até 24 h, logs do projeto)
- `pg_cron`: 270 inícios do job 4 (`select private.dispatch_growth_worker()`), 260 conclusões e 9 timeouts de inicialização.
- `postgres_exporter`: 42 cancelamentos de SELECTs por `statement timeout`, inclusive leituras de `pg_stat_statements` e `pg_stat_activity`.
- `PostgREST`: 10 timeouts de consultas.
- Solicitações HTTP: `GET /rest/v1/connect_orders` 576, `rpc/get_or_create_establishment_key` 333, `rpc/claim_growth_worker` 230 e `rpc/finish_growth_worker` 226.
- Logs revelam cron antigo tentando chamar `https://xxx.supabase.co/functions/v1/cron-zernio-post` com `YOUR_ANON_KEY`, uma configuração de exemplo. Somente esse comando exato pode ser removido.

Os números acima são **ocorrências e requisições**, não porcentagens de CPU. Esses dados indicam pressão, mas NÃO provam que o worker representa 98% do consumo.

## Limitações da medição
A consulta SQL mais simples a `pg_stat_activity` expirou por timeout de conexão. O Performance Advisor falhou por timeout de leitura. Assim, não foi possível obter top SQL por tempo/calls, `EXPLAIN (ANALYZE, BUFFERS)`, índice não utilizado, `n_dead_tup`, `autovacuum`, bloat, CPU por processo, conexões ou lock waits. Evitar varrer `pg_stat_statements` com normalização de texto durante 98% de CPU.

## Alterações preventivas (PR, não necessariamente já em produção)
1. Reduzir `pg_cron` de 5 para 10 minutos sem pausar cobranças, lembretes e mensagens. Remover apenas o cron antigo com placeholders comprovados.
2. Em execuções automáticas, verificar renovações do clube uma vez por hora e manutenção fiscal a cada 20 minutos; preservar a verificação de sinais pendentes, reconciliação de pagamentos, campanhas e WhatsApp em todos os ciclos de 10 minutos. Execuções manuais mantêm todas as rotinas.
3. Desduplicar a RPC de chave criptográfica por estabelecimento em chamadas concorrentes. Troca de unidade invalida chave e promessas pendentes.
4. Agrupar alterações no Realtime da agenda (550 ms) e clientes (600 ms) antes de executar as RPCs que recarregam todos os registros; abas ocultas atualizam quando ganham foco. Descartar eventos de outro estabelecimento na UI.
5. No caixa sem cobranças pendentes, reduzir busca de `connect_orders` de 16 para 64 s; durante pagamento ativo manter 16 s e webhook Stripe como fonte definitiva de liquidação.

## Auditoria da segunda etapa (quando CPU permitir)
Executar as verificações abaixo isoladamente, em períodos de baixo tráfego. Não usar `EXPLAIN ANALYZE` em mutações financeiras da produção.

```sql
-- Top queries por TEMPO TOTAL acumulado (verificar extensão e reset dos contadores)
select queryid,calls,round(total_exec_time::numeric,1) as total_ms,
 round(mean_exec_time::numeric,2) as mean_ms,shared_blks_read,
 shared_blks_hit,left(query,160) as sample
from extensions.pg_stat_statements
order by total_exec_time desc limit 20;

-- Sessões / contenção
select state,wait_event_type,count(*) from pg_stat_activity
 where datname=current_database() group by 1,2 order by 3 desc;
select pid,usename,state,now()-query_start as elapsed,wait_event_type,
 left(query,140) as statement
from pg_stat_activity where datname=current_database() and
 state in ('active','idle in transaction') and now()-query_start>interval '30 seconds'
order by query_start limit 20;

-- I/O e VACUUM (não usar COUNT(*) em cada tabela)
select relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,
 last_autovacuum,last_autoanalyze
from pg_stat_user_tables order by n_dead_tup desc limit 20;

-- Índices para comparar com filtros de operações reais
select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in
('connect_orders','caixa_itens','agenda_events','clientes',
 'fiscal_documents','client_campaigns','campaign_recipients',
 'whatsapp_deliveries','club_contracts','club_cycles','booking_deposits')
order by tablename,indexname;
```

Priorizar a revisão de índices em `connect_orders(estabelecimento_id,purpose,status,created_at)`,
`fiscal_documents(status,updated_at)`, `campaign_recipients(campaign_id,status)`,
`agenda_events(estabelecimento_id,profissional_id,start)` e
`whatsapp_deliveries(status,...)`, sempre checando antes os índices existentes,
cardinalidade e planos `EXPLAIN`. **Não criar índices cegamente com CPU acima de 90%.**

## Verificação depois da implantação
- CPU média e pico comparados durante as mesmas janelas de 1/6/24h.
- Contagem de erros 5xx, timeouts, conexões ativas e locks.
- Conclusões do `dispatch_growth_worker` por execução e estado da lease.
- Tempo médio de confirmação do Pay Express, notificações e renovações; revisar SLAs se necessário.
- Consultas `get_or_create_establishment_key`, `connect_orders`, `get_agenda_events_by_estab` e `get_clientes_by_estab` por hora.
- Garantir que a alteração não gere envio duplicado de campanhas, renovações ou cobranças.
- Considerar **upgrade temporário de compute** se a capacidade continuar saturada e impedindo o diagnóstico: somente com análise de custo e autorização.

Fontes técnicas: https://supabase.com/docs/guides/observability/detecting e https://supabase.com/docs/guides/database/query-optimization
