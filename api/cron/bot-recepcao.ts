/**
 * api/cron/bot-recepcao.ts — Vercel Cron Job (08:00 diário)
 *
 * Busca agendamentos do dia no Supabase e dispara SMS de lembrete
 * via Twilio para cada cliente com telefone cadastrado.
 */
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Segurança: só aceita do cron da Vercel em produção
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env['CRON_SECRET']}`) {
    if (process.env['NODE_ENV'] === 'production') {
      return res.status(401).json({ error: 'Unauthorized CRON.' });
    }
  }

  // --- Supabase ---
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'] || process.env['SUPABASE_ANON_KEY'];
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase vars ausentes.' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // --- Twilio ---
  const twilioSid   = process.env['TWILIO_ACCOUNT_SID'];
  const twilioToken = process.env['TWILIO_AUTH_TOKEN'];
  const twilioFrom  = process.env['TWILIO_PHONE_FROM'];
  const twilioClient = (twilioSid && twilioToken) ? twilio(twilioSid, twilioToken) : null;

  // Agendamentos de amanhã (lembrete com 1 dia de antecedência)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow); tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd   = new Date(tomorrow); tomorrowEnd.setHours(23, 59, 59, 999);

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

    if (!telefone) { skipped++; continue; }

    const horario = new Date(event.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const msg = `Olá, ${cliente.nome || 'cliente'}! 👋 Lembrete: você tem *${event.title}* amanhã às ${horario}. Responda com CONFIRMAR para garantir ou CANCELAR se não puder. — AgendaAi`;

    if (twilioClient && twilioFrom) {
      try {
        const toNormalized = normalizePhone(telefone);
        const result = await twilioClient.messages.create({ body: msg, from: twilioFrom, to: toNormalized });
        results.push({ to: toNormalized, sid: result.sid, status: result.status });
        sent++;
      } catch (e: any) {
        results.push({ to: telefone, error: e.message });
      }
    } else {
      // Modo simulado (sem credenciais Twilio)
      console.log(`[SIMULADO] SMS para ${telefone}: ${msg}`);
      results.push({ to: telefone, simulated: true });
      sent++;
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
