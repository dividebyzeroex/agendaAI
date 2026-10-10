/**
 * api/cron/bot-recepcao.ts — Vercel Cron Job (08:00 diário)
 *
 * Busca agendamentos do dia no Supabase e dispara SMS de lembrete
 * via Twilio para cada cliente com telefone cadastrado.
 */
import type { VercelRequest, VercelResponse } from '../../server/http.js';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { checkAndIncrement } from '../../server/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const secret = process.env['CRON_SECRET'];
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized CRON.' });

  // --- Supabase ---
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase vars ausentes.' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // --- Twilio ---
  const twilioSid   = process.env['TWILIO_ACCOUNT_SID'];
  const twilioToken = process.env['TWILIO_AUTH_TOKEN'];
  const twilioFrom  = process.env['TWILIO_PHONE_FROM'];
  const twilioClient = (twilioSid && twilioToken) ? twilio(twilioSid, twilioToken) : null;

  if (!twilioClient || !twilioFrom) return res.status(503).json({ error: 'SMS não configurado.', sent: 0 });

  // Agendamentos de amanhã (lembrete com 1 dia de antecedência)
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
  const tomorrowStart = new Date(`${localDate}T00:00:00-03:00`);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000 - 1);

  const { data: events, error } = await supabase
    .from('agenda_events')
    .select('*, clientes(nome, telefone)')
    .gte('start', tomorrowStart.toISOString())
    .lte('start', tomorrowEnd.toISOString())
    .eq('status', 'confirmado');

  if (error) return res.status(400).json({ error: error.message });

  const results: any[] = [];
  let sent = 0;
  let skipped = 0;

  for (const event of events || []) {
    const cliente = (event as any).clientes;
    const telefone = cliente?.telefone;

    if (!telefone || !event.estabelecimento_id) { skipped++; continue; }
    const quota = await checkAndIncrement(event.estabelecimento_id, 'sms');
    if (!quota.allowed) { skipped++; continue; }

    const horario = new Date(event.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const msg = `Olá, ${cliente.nome || 'cliente'}! 👋 Lembrete: você tem *${event.title}* amanhã às ${horario}. Entre em contato com o estabelecimento para alterações. — AgendaAi`;

    if (twilioClient && twilioFrom) {
      try {
        const toNormalized = normalizePhone(telefone);
        const result = await twilioClient.messages.create({ body: msg, from: twilioFrom, to: toNormalized });
        results.push({ to: toNormalized, sid: result.sid, status: result.status });
        sent++;
      } catch (e: any) {
        results.push({ to: telefone, error: e.message });
      }
    }
  }

  return res.status(200).json({
    agent: 'Recepção Bot',
    date: tomorrowStart.toISOString().split('T')[0],
    total: events?.length || 0,
    sent,
    skipped,
    results,
  });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+55${digits}`;
}
