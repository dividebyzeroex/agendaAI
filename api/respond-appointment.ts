/**
 * api/respond-appointment.ts — Vercel Serverless
 * Processa a resposta do colaborador (Aceitar/Recusar) via e-mail.
 */
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token, action } = req.query;

  if (!token || !action) {
    return res.status(400).send('Token ou ação inválidos.');
  }

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
  const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY']!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Busca o agendamento pelo token
  const { data: event, error: eventErr } = await supabase
    .from('agenda_events')
    .select('*, profissionais!profissional_id(nome, email)')
    .eq('token_confirmacao', token)
    .single();

  if (eventErr || !event) {
    return res.status(404).send('Agendamento não localizado ou link expirado.');
  }

  if (action === 'aceitar') {
    // Apenas aceita se ainda estiver pendente ou se quem está aceitando é o próprio (evita roubo de slot se já estiver aceito)
    if (event.status_confirmacao === 'aceito') {
      return res.send(`<html><body><h2 style="color: #34a853;">Agendamento já foi aceito!</h2><p>Você já confirmou este atendimento. Obrigado!</p></body></html>`);
    }

    await supabase
      .from('agenda_events')
      .update({ status_confirmacao: 'aceito', status: 'confirmado' })
      .eq('id', event.id);

    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #1a73e8;">✅ Confirmado!</h1>
          <p>O agendamento de <strong>${event.title}</strong> foi confirmado na sua agenda.</p>
          <p>Você pode fechar esta página agora.</p>
        </body>
      </html>
    `);
  }

  if (action === 'recusar') {
    // 1. Marca como recusado e limpa o profissional_id atual
    await supabase
      .from('agenda_events')
      .update({ 
        status_confirmacao: 'pendente', // Volta para pendente no leilão
        profissional_id: null,
        profissional_nome: 'Aguardando Colaborador'
      })
      .eq('id', event.id);

    // 2. BROADCAST: Envia e-mail para todos os outros profissionais ativos
    const { data: outrosProfs } = await supabase
      .from('profissionais')
      .select('nome, email')
      .eq('ativo', true);

    const { Resend } = require('resend');
    const resend = new Resend(process.env['RESEND_API_KEY']);
    
    if (outrosProfs && outrosProfs.length > 0) {
      for (const p of outrosProfs) {
        if (p.email === event.profissionais?.email) continue; // Pula quem recusou

        const baseUrl = process.env['PROJECT_URL'] || `https://${req.headers.host}`;
        const takeUrl = `${baseUrl}/api/respond-appointment?token=${event.token_confirmacao}&action=aceitar`;

        await resend.emails.send({
          from: 'AgendaAi <oportunidade@agendaai.com.br>',
          to: p.email,
          subject: `🔥 Oportunidade: Novo Serviço Disponível`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Olá, ${p.nome}!</h2>
              <p>Um novo serviço ficou disponível na equipe e você pode assumi-lo:</p>
              <div style="background: #fffbeb; border: 1px solid #f9ab00; padding: 15px; border-radius: 8px;">
                <strong>${event.title}</strong><br>
                📅 ${new Date(event.start).toLocaleString('pt-BR')}
              </div>
              <p>O primeiro que aceitar fica com a vaga!</p>
              <a href="${takeUrl}" style="background: #202124; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 20px;">ASSUMIR SERVIÇO</a>
            </div>
          `
        });
      }
    }

    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #64748b;">Agendamento Recusado</h1>
          <p>Entendido. O serviço foi liberado para outros colaboradores.</p>
        </body>
      </html>
    `);
  }

  return res.status(400).send('Ação desconhecida.');
}
