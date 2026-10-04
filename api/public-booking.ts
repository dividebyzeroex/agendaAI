import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, isUuid } from '../server/security.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = adminClient();
    const {
      estabelecimento_id,
      servico_id,
      profissional_id,
      start,
      end,
      cliente_nome,
      cliente_telefone,
      title,
      event_metadata,
      cliente_metadata
    } = req.body || {};

    // Validation
    if (!estabelecimento_id || !servico_id || !start || !end || !cliente_nome || !cliente_telefone) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    if (!isUuid(estabelecimento_id) || !isUuid(servico_id) || (profissional_id && !isUuid(profissional_id)) || typeof cliente_nome !== 'string' || cliente_nome.trim().length < 2 || cliente_nome.length > 120 || typeof cliente_telefone !== 'string' || !/^\+?[\d\s()\-]{10,20}$/.test(cliente_telefone)) return res.status(400).json({ error: 'Dados inválidos.' });
    const {data:tenant}=await supabase.from('estabelecimento').select('active,slug,trial_ends_at,plano_expires_at').eq('id',estabelecimento_id).single();
    if(!tenant?.active||!tenant.slug||Math.max(Date.parse(tenant.trial_ends_at||'')||0,Date.parse(tenant.plano_expires_at||'')||0)<=Date.now())return res.status(403).json({error:'Agenda indisponível.'});
    const secret=process.env['PUBLIC_BOOKING_RATE_SECRET'];
    if(!secret)return res.status(503).json({error:'Agenda temporariamente indisponível.'});
    const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
    const key=createHmac('sha256',secret).update(`${estabelecimento_id}:${ip}`).digest('hex');
    const {data:allowed,error:rateError}=await supabase.rpc('consume_public_booking_limit',{p_key:key});
    if(rateError)return res.status(503).json({error:'Não foi possível verificar o limite de reservas.'});
    if(!allowed)return res.status(429).json({error:'Muitas tentativas. Tente novamente em 15 minutos.'});
    const starts = new Date(start).getTime(), ends = new Date(end).getTime();
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts <= Date.now() || starts > Date.now() + 180 * 86400000 || ends <= starts) return res.status(400).json({ error: 'Horário inválido.' });
    const { data: service } = await supabase.from('servicos').select('titulo,duracao_min').eq('id', servico_id).eq('estabelecimento_id', estabelecimento_id).eq('ativo', true).single();
    if (!service || ends - starts !== service.duracao_min * 60000) return res.status(400).json({ error: 'Serviço ou duração inválidos.' });
    if (profissional_id) {
      const { data: professional } = await supabase.from('profissionais').select('id').eq('id', profissional_id).eq('estabelecimento_id', estabelecimento_id).eq('ativo', true).single();
      if (!professional) return res.status(400).json({ error: 'Profissional inválido.' });
    }
    const zoned = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(start));
    const part = (type: string) => zoned.find(p => p.type === type)?.value || '';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
    const { data: hours } = await supabase.from('horarios_funcionamento').select('abre,fecha').eq('estabelecimento_id', estabelecimento_id).eq('dia_semana', weekday).eq('ativo', true).maybeSingle();
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const startMinutes = minutes(`${part('hour')}:${part('minute')}`);
    if (!hours?.abre || !hours.fecha || startMinutes < minutes(hours.abre) || startMinutes + service.duracao_min > minutes(hours.fecha)) return res.status(400).json({ error: 'Horário fora do expediente.' });
    let conflict = supabase.from('agenda_events').select('id').eq('estabelecimento_id', estabelecimento_id).neq('status', 'cancelado').lt('start', end).gt('end', start);
    if (profissional_id) conflict = conflict.eq('profissional_id', profissional_id);
    const { data: conflicts, error: conflictError } = await conflict.limit(1);
    if (conflictError) return res.status(503).json({ error: 'Não foi possível verificar a disponibilidade.' });
    if (conflicts?.length) return res.status(409).json({ error: 'Horário indisponível.' });

    // 1. Upsert cliente by phone (find or create)
    const { data: existingClientes } = await supabase
      .from('clientes')
      .select('id')
      .eq('estabelecimento_id', estabelecimento_id)
      .eq('telefone', cliente_telefone)
      .limit(1);

    let clienteId: string;

    if (existingClientes && existingClientes.length > 0) {
      clienteId = existingClientes[0].id;
    } else {
      const { data: newCliente, error: clienteError } = await supabase
        .from('clientes')
        .insert({
          estabelecimento_id,
          nome: cliente_nome,
          telefone: cliente_telefone,
          metadata: {}
        })
        .select('id')
        .single();

      if (clienteError) {
        console.error('[PublicBooking] Erro ao criar cliente:', clienteError);
        return res.status(500).json({ error: 'Falha ao registrar seus dados.' });
      }
      clienteId = newCliente.id;
    }

    // 2. Create the agenda event
    const eventPayload: any = {
      estabelecimento_id,
      title: `${cliente_nome.trim()} — ${service.titulo}`,
      start,
      end,
      cliente_id: clienteId,
      servico_id,
      status: 'confirmado',
      metadata: {}
    };

    if (profissional_id) {
      eventPayload.profissional_id = profissional_id;
    }

    const { data: event, error: eventError } = await supabase
      .from('agenda_events')
      .insert(eventPayload)
      .select('id, start, end, status')
      .single();

    if (eventError) {
      console.error('[PublicBooking] Erro ao criar evento:', eventError);

      // Check for overlap constraint
      if (eventError.message?.includes('overlap') || ['23505', '23P01'].includes(eventError.code)) {
        return res.status(409).json({ error: 'Este horário já foi reservado. Por favor, escolha outro.' });
      }
      return res.status(500).json({ error: 'Falha ao criar agendamento.' });
    }

    return res.status(201).json({
      success: true,
      event,
    });
  } catch (err: any) {
    console.error('[PublicBooking] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
