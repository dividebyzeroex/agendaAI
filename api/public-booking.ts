import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY']!
  );

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      estabelecimento_id,
      servico_id,
      profissional_id,
      start,
      end,
      cliente_nome,
      cliente_telefone,
      title
    } = req.body;

    // Validation
    if (!estabelecimento_id || !servico_id || !start || !end || !cliente_nome || !cliente_telefone) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

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
      // Update last visit
      await supabase
        .from('clientes')
        .update({ ultima_visita: new Date().toISOString().split('T')[0] })
        .eq('id', clienteId);
    } else {
      const { data: newCliente, error: clienteError } = await supabase
        .from('clientes')
        .insert({
          estabelecimento_id,
          nome: cliente_nome,
          telefone: cliente_telefone,
          ultima_visita: new Date().toISOString().split('T')[0],
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
      title: title || `${cliente_nome}`,
      start,
      end,
      cliente_id: clienteId,
      servico_id,
      status: 'confirmado',
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
      if (eventError.message?.includes('overlap') || eventError.code === '23505') {
        return res.status(409).json({ error: 'Este horário já foi reservado. Por favor, escolha outro.' });
      }
      return res.status(500).json({ error: 'Falha ao criar agendamento.' });
    }

    return res.status(201).json({
      success: true,
      event,
      cliente_id: clienteId,
    });
  } catch (err: any) {
    console.error('[PublicBooking] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
