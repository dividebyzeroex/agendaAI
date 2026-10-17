LOCK TABLE public.horarios_funcionamento IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS private.horarios_duplicate_archive (id uuid PRIMARY KEY, row_data jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.horarios_duplicate_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.horarios_duplicate_archive FROM PUBLIC, anon, authenticated;
WITH ranked AS (
 SELECT id,row_number() OVER (PARTITION BY estabelecimento_id,dia_semana,abre,fecha,ativo,dia_nome ORDER BY id) AS n FROM public.horarios_funcionamento
), removed AS (
 DELETE FROM public.horarios_funcionamento h USING ranked r WHERE h.id=r.id AND r.n>1 RETURNING h.*
)
INSERT INTO private.horarios_duplicate_archive(id,row_data) SELECT id,to_jsonb(removed) FROM removed ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS horarios_estabelecimento_day_unique ON public.horarios_funcionamento(estabelecimento_id,dia_semana);
