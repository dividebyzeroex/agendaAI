import { billingClients, BillingError } from '../server/billing.js';
import { assertCollectionAccount, depositReservationResponse } from '../server/growth-payments.js';
import { customerPortal } from '../server/customer-portal.js';
import { businessPublic } from '../server/business-public.js';
import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../server/http.js';
import { adminClient, isUuid } from '../server/security.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (String(req.query?.['action'] || '').startsWith('portal-')) return customerPortal(req, res);
  if (req.query?.['action']) return businessPublic(req, res);
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = adminClient();
    const attributeGrowth = async (tenant:string,eventId:string|undefined) => {
      const code = req.body?.campaign_code;
      if (!eventId || !isUuid(eventId) || !isUuid(code)) return;
      try {
        const {error}=await supabase.rpc('growth_attribute_booking',{
          p_tenant:tenant,p_event:eventId,p_code:code,
        });
        if (error) console.warn('[Growth attribution] Not recorded:',error.code);
      } catch { /* A tracking failure cannot invalidate a real booking. */ }
    };
    let {
      estabelecimento_id,
      servico_id,
      profissional_id,
      start,
      end,
      cliente_nome,
      cliente_telefone,
      title,
      event_metadata,
      cliente_metadata,
    } = req.body || {};

    const usingPortal = isUuid(req.body?.portal_token);
    const bookingMetadata: Record<string, string> = {};
    if (event_metadata && typeof event_metadata === 'object' && !Array.isArray(event_metadata)) {
      for (const key of [
        'pet_nome',
        'pet_raca',
        'pet_porte',
        'pet_cuidados',
        'aparelho',
        'defeito',
      ]) {
        if (typeof event_metadata[key] === 'string')
          bookingMetadata[key] = event_metadata[key]
            .trim()
            .slice(0, key === 'pet_cuidados' || key === 'defeito' ? 500 : 120);
      }
    }
    // Validation
    if (
      !estabelecimento_id ||
      !servico_id ||
      !start ||
      !end ||
      (!usingPortal && (!cliente_nome || !cliente_telefone))
    ) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    if (
      !isUuid(estabelecimento_id) ||
      !isUuid(servico_id) ||
      (profissional_id && !isUuid(profissional_id)) ||
      (!usingPortal &&
        (typeof cliente_nome !== 'string' ||
          cliente_nome.trim().length < 2 ||
          cliente_nome.length > 120 ||
          typeof cliente_telefone !== 'string' ||
          !/^\+?[\d\s()\-]{10,20}$/.test(cliente_telefone)))
    )
      return res.status(400).json({ error: 'Dados inválidos.' });
    const { data: tenant } = await supabase
      .from('estabelecimento')
      .select('active,slug,trial_ends_at,plano_expires_at')
      .eq('id', estabelecimento_id)
      .single();
    if (
      !tenant?.active ||
      !tenant.slug ||
      Math.max(
        Date.parse(tenant.trial_ends_at || '') || 0,
        Date.parse(tenant.plano_expires_at || '') || 0,
      ) <= Date.now()
    )
      return res.status(403).json({ error: 'Agenda indisponível.' });
    const secret = process.env['PUBLIC_BOOKING_RATE_SECRET'];
    if (!secret) return res.status(503).json({ error: 'Agenda temporariamente indisponível.' });
    const ip = String(
      req.headers['x-vercel-forwarded-for'] ||
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        'unknown',
    )
      .split(',')[0]
      .trim();
    const key = createHmac('sha256', secret).update(`${estabelecimento_id}:${ip}`).digest('hex');
    const { data: allowed, error: rateError } = await supabase.rpc('consume_public_booking_limit', {
      p_key: key,
    });
    if (rateError)
      return res.status(503).json({ error: 'Não foi possível verificar o limite de reservas.' });
    if (!allowed)
      return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    const starts = new Date(start).getTime(),
      ends = new Date(end).getTime();
    if (
      !Number.isFinite(starts) ||
      !Number.isFinite(ends) ||
      starts <= Date.now() ||
      starts > Date.now() + 180 * 86400000 ||
      ends <= starts
    )
      return res.status(400).json({ error: 'Horário inválido.' });
    const { data: service } = await supabase
      .from('servicos')
      .select('titulo,duracao_min')
      .eq('id', servico_id)
      .eq('estabelecimento_id', estabelecimento_id)
      .eq('ativo', true)
      .single();
    if (!service || ends - starts !== service.duracao_min * 60000)
      return res.status(400).json({ error: 'Serviço ou duração inválidos.' });
    const { data: professionals, error: professionalsError } = await supabase
      .from('profissionais')
      .select('id')
      .eq('estabelecimento_id', estabelecimento_id)
      .eq('ativo', true);
    if (professionalsError)
      return res.status(503).json({ error: 'Não foi possível verificar a equipe.' });
    if (professionals?.length && !profissional_id)
      return res.status(400).json({ error: 'Escolha um profissional.' });
    if (profissional_id && !professionals?.some((p) => p.id === profissional_id))
      return res.status(400).json({ error: 'Profissional inválido.' });
    if (profissional_id) {
      const { data: bindings, error: bindingsError } = await supabase
        .from('profissional_servicos')
        .select('servico_id')
        .eq('profissional_id', profissional_id)
        .eq('estabelecimento_id', estabelecimento_id);
      if (bindingsError)
        return res.status(503).json({ error: 'Não foi possível verificar os serviços.' });
      if (bindings?.length && !bindings.some((b) => b.servico_id === servico_id))
        return res.status(400).json({ error: 'Serviço não atendido pelo profissional.' });
    }
    const zoned = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(start));
    const part = (type: string) => zoned.find((p) => p.type === type)?.value || '';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
    const { data: hours } = await supabase
      .from('horarios_funcionamento')
      .select('abre,fecha')
      .eq('estabelecimento_id', estabelecimento_id)
      .eq('dia_semana', weekday)
      .eq('ativo', true)
      .maybeSingle();
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const startMinutes = minutes(`${part('hour')}:${part('minute')}`);
    if (
      !hours?.abre ||
      !hours.fecha ||
      startMinutes < minutes(hours.abre) ||
      startMinutes + service.duracao_min > minutes(hours.fecha)
    )
      return res.status(400).json({ error: 'Horário fora do expediente.' });
    if (profissional_id) {
      const { data: availability, error: availabilityError } = await supabase
        .from('profissional_disponibilidades')
        .select('ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim')
        .eq('profissional_id', profissional_id)
        .eq('estabelecimento_id', estabelecimento_id)
        .eq('dia_semana', weekday)
        .maybeSingle();
      if (availabilityError)
        return res.status(503).json({ error: 'Não foi possível verificar o expediente.' });
      if (
        !availability?.ativo ||
        !availability.hora_inicio ||
        !availability.hora_fim ||
        startMinutes < minutes(availability.hora_inicio) ||
        startMinutes + service.duracao_min > minutes(availability.hora_fim) ||
        (availability.intervalo_inicio &&
          availability.intervalo_fim &&
          startMinutes < minutes(availability.intervalo_fim) &&
          startMinutes + service.duracao_min > minutes(availability.intervalo_inicio))
      )
        return res.status(400).json({ error: 'Profissional indisponível nesse horário.' });
    }
    const { data: preferences, error: preferencesError } = await supabase
      .from('business_settings')
      .select('approval_required,deposit_percent')
      .eq('estabelecimento_id', estabelecimento_id)
      .maybeSingle();
    if (preferencesError && !['42P01', 'PGRST205'].includes(preferencesError.code))
      return res.status(503).json({ error: 'Não foi possível conferir as regras da agenda.' });
    let depositStripe: any = null,
      reservationFingerprint = '';
    const reservationKey = req.body?.reservation_key;
    const portalToken = req.body?.portal_token;
    let portalIdentity: any = null;
    if (portalToken) {
      if (!isUuid(portalToken) || !isUuid(reservationKey))
        return res.status(400).json({ error: 'Link ou tentativa inválida.' });
      const { data: identity, error: identityError } = await supabase.rpc('portal_identity', {
        p_token: portalToken,
      });
      if (identityError || !identity || identity.tenant !== estabelecimento_id)
        return res.status(403).json({ error: 'Link inválido ou expirado.' });
      portalIdentity = identity;
      cliente_nome = identity.name;
      cliente_telefone = identity.phone || '';
    }
    if (
      portalIdentity &&
      ((req.body?.pass_id && !isUuid(req.body.pass_id)) ||
        (req.body?.portal_event && !isUuid(req.body.portal_event)))
    )
      return res.status(400).json({ error: 'Reserva inválida.' });
    const portalCommand =
      portalIdentity &&
      (!!req.body?.pass_id || !!req.body?.portal_event || !preferences?.deposit_percent);
    if (!portalCommand && preferences?.deposit_percent > 0) {
      if (!isUuid(reservationKey))
        return res.status(400).json({ error: 'Atualize a página para reservar com sinal.' });
      reservationFingerprint = createHmac('sha256', secret)
        .update(
          JSON.stringify([
            estabelecimento_id,
            servico_id,
            profissional_id || null,
            new Date(start).toISOString(),
            new Date(end).toISOString(),
            cliente_nome.trim(),
            cliente_telefone,
            bookingMetadata,
            ...(portalIdentity ? [portalIdentity.customer] : []),
          ]),
        )
        .digest('hex');
      const { data: previous, error: previousError } = await supabase
        .from('booking_deposits')
        .select('fingerprint,event_id,receipt_id,amount')
        .eq('estabelecimento_id', estabelecimento_id)
        .eq('request_key', reservationKey)
        .maybeSingle();
      if (previousError)
        return res.status(503).json({ error: 'Não foi possível conferir a tentativa anterior.' });
      depositStripe = billingClients().stripe;
      if (previous) {
        if (previous.fingerprint !== reservationFingerprint)
          return res.status(409).json({
            error: 'A tentativa corresponde a outra reserva. Escolha o horário novamente.',
          });
        const { data: event } = await supabase
          .from('agenda_events')
          .select('id,start,end,status')
          .eq('id', previous.event_id)
          .single();
        const { data: receipt } = await supabase
          .from('caixa_itens')
          .select('token_publico')
          .eq('id', previous.receipt_id)
          .single();
        if (!event || !receipt)
          return res.status(503).json({ error: 'Não foi possível conferir a reserva.' });
        return res.status(200).json(
          await depositReservationResponse(supabase, depositStripe, {
            event,
            receipt_id: previous.receipt_id,
            deposit_token: receipt.token_publico,
            amount: previous.amount,
          }),
        );
      }
      const { data: price } = await supabase
        .from('servicos')
        .select('preco')
        .eq('id', servico_id)
        .single();
      const { data: rule, error: priceError } = profissional_id
        ? await supabase
            .from('profissional_servicos')
            .select('valor_proprio')
            .eq('profissional_id', profissional_id)
            .eq('servico_id', servico_id)
            .eq('estabelecimento_id', estabelecimento_id)
            .maybeSingle()
        : { data: null, error: null };
      if (priceError)
        return res.status(503).json({ error: 'Não foi possível conferir o valor do serviço.' });
      if (Number(rule?.valor_proprio ?? price?.preco) < 4) depositStripe = null;
      else {
        if (starts < Date.now() + 45 * 60000)
          return res.status(400).json({
            error: 'Reserve com pelo menos 45 minutos de antecedência para pagar o sinal.',
          });
        await assertCollectionAccount(depositStripe, supabase, estabelecimento_id);
      }
    }
    if (portalCommand) {
      const { data: prior, error: priorError } = await supabase
        .from('portal_requests')
        .select('event_id')
        .eq('estabelecimento_id', estabelecimento_id)
        .eq('request_key', reservationKey)
        .maybeSingle();
      if (priorError)
        return res.status(503).json({ error: 'Não foi possível conferir a reserva anterior.' });
      if (prior) {
        const { data, error } = await supabase.rpc('portal_reserve', {
          p_token: portalToken,
          p_key: reservationKey,
          p_pass: req.body?.pass_id || null,
          p_event: req.body?.portal_event || null,
          p_data: {
            estabelecimento_id,
            servico_id,
            profissional_id: profissional_id || null,
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            metadata: bookingMetadata,
          },
        });
        if (error)
          return res
            .status(409)
            .json({ error: 'A tentativa corresponde a outra reserva. Confira seus horários.' });
        return res.status(200).json(data);
      }
    }
    let conflict = supabase
      .from('agenda_events')
      .select('id')
      .eq('estabelecimento_id', estabelecimento_id)
      .neq('status', 'cancelado')
      .lt('start', end)
      .gt('end', start);
    if (profissional_id)
      conflict = conflict.or(`profissional_id.eq.${profissional_id},profissional_id.is.null`);
    if (portalIdentity && isUuid(req.body?.portal_event))
      conflict = conflict.neq('id', req.body.portal_event);
    const { data: conflicts, error: conflictError } = await conflict.limit(1);
    if (conflictError)
      return res.status(503).json({ error: 'Não foi possível verificar a disponibilidade.' });
    if (conflicts?.length) return res.status(409).json({ error: 'Horário indisponível.' });

    if (portalCommand) {
      if (
        (req.body?.pass_id && !isUuid(req.body.pass_id)) ||
        (req.body?.portal_event && !isUuid(req.body.portal_event))
      )
        return res.status(400).json({ error: 'Reserva inválida.' });
      const { data, error } = await supabase.rpc('portal_reserve', {
        p_token: portalToken,
        p_key: reservationKey,
        p_pass: req.body?.pass_id || null,
        p_event: req.body?.portal_event || null,
        p_data: {
          estabelecimento_id,
          servico_id,
          profissional_id: profissional_id || null,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          metadata: bookingMetadata,
        },
      });
      if (error)
        return res
          .status(['23505', '23P01'].includes(error.code) ? 409 : 400)
          .json({ error: error.message || 'Não foi possível reservar.' });
      return res.status(201).json(data);
    }
    // 1. Upsert cliente by phone (find or create)
    const { data: existingClientes } = portalIdentity
      ? { data: [{ id: portalIdentity.customer }] }
      : await supabase
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
          metadata: { origin: 'public_booking', ...bookingMetadata },
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
      title: `${cliente_nome.trim()} — ${service.titulo}${bookingMetadata['pet_nome'] ? ' · ' + bookingMetadata['pet_nome'] : ''}`,
      start,
      end,
      cliente_id: clienteId,
      servico_id,
      status: preferences?.approval_required ? 'pendente' : 'confirmado',
      metadata: { origin: 'public_booking', ...bookingMetadata },
      ...(bookingMetadata['pet_nome']
        ? {
            observacoes: `Pet: ${bookingMetadata['pet_nome']}. Raça/espécie: ${bookingMetadata['pet_raca'] || 'Não informada'}. Porte: ${bookingMetadata['pet_porte'] || 'Não informado'}. Cuidados: ${bookingMetadata['pet_cuidados'] || 'Nenhum informado'}`,
          }
        : {}),
    };

    if (profissional_id) {
      eventPayload.profissional_id = profissional_id;
    }

    if (depositStripe) {
      const { data: reservation, error: reservationError } = await supabase.rpc(
        'reserve_with_deposit',
        { p_data: eventPayload, p_key: reservationKey, p_fingerprint: reservationFingerprint },
      );
      if (reservationError)
        return res.status(['23505', '23P01'].includes(reservationError.code) ? 409 : 400).json({
          error: ['23505', '23P01'].includes(reservationError.code)
            ? 'Este horário já foi reservado. Escolha outro.'
            : reservationError.message || 'Não foi possível reservar com sinal.',
        });
      await attributeGrowth(estabelecimento_id,reservation?.event?.id);
      return res
        .status(201)
        .json(await depositReservationResponse(supabase, depositStripe, reservation));
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
        return res
          .status(409)
          .json({ error: 'Este horário já foi reservado. Por favor, escolha outro.' });
      }
      return res.status(500).json({ error: 'Falha ao criar agendamento.' });
    }

    await attributeGrowth(estabelecimento_id,event.id);
    return res.status(201).json({
      success: true,
      event,
    });
  } catch (err: any) {
    if (err instanceof BillingError) return res.status(err.status).json({ error: err.message });
    console.error('[PublicBooking] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
