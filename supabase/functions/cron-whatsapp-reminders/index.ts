import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";

const zernioApiKey = Deno.env.get("ZERNIO_API_KEY");

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar agendamentos nas próximas 2 a 4 horas que não receberam lembrete
    const now = new Date();
    const futureLimit = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    
    const { data: events, error } = await supabase
      .from('agenda_events')
      .select('*, clientes(nome, telefone), estabelecimento(nome)')
      .eq('lembrete_enviado', false)
      .eq('status', 'confirmado')
      .gte('start', now.toISOString())
      .lte('start', futureLimit.toISOString());

    if (error) throw error;
    if (!events || events.length === 0) return new Response("Nenhum lembrete pendente");

    for (const ev of events) {
      if (ev.clientes?.telefone) {
        const timeStr = new Date(ev.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const cancelUrl = `https://agenda-ai-xi.vercel.app/agendar/cancel?token=${ev.token_confirmacao}`;
        const rescheduleUrl = `https://agenda-ai-xi.vercel.app/agendar/reschedule?token=${ev.token_confirmacao}`;

        const text = `*Lembrete de Agendamento*\n\nOlá ${ev.clientes.nome}, seu horário em ${ev.estabelecimento?.nome || 'nosso estabelecimento'} é hoje às ${timeStr}.\n\nPara reagendar acesse: ${rescheduleUrl}\nPara cancelar acesse: ${cancelUrl}`;

        // Enviar via Zernio usando a função local ou API
        await fetch(`https://zernio.com/api/v1/inbox/conversations/${ev.clientes.telefone}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${zernioApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: text
          })
        });

        // Marcar como enviado
        await supabase.from('agenda_events').update({ lembrete_enviado: true }).eq('id', ev.id);
      }
    }

    return new Response(`Foram enviados ${events.length} lembretes.`);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});
