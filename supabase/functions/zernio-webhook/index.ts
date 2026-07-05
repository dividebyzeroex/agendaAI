import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import { GoogleGenAI } from "npm:@google/genai";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const zernioApiKey = Deno.env.get("ZERNIO_API_KEY") || "MOCK_ZERNIO_API_KEY";

console.log("Zernio Webhook Function Starting...");

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received Zernio Webhook:", JSON.stringify(body, null, 2));

    if (body.event !== "message.received" || !body.data) {
       return new Response("Event ignored", { status: 200 });
    }

    const channelId = body.data.channel_id; // Identificador da subconta/canal no Zernio
    const userPhone = body.data.contact?.id; // ID do contato no whatsapp/insta
    const userMessage = body.data.message?.text;

    if (!userMessage || !userPhone || !channelId) {
      return new Response("Missing required fields", { status: 200 });
    }
    
    // Broadcast nova mensagem recebida para o Realtime (para Toasts e UI global)
    await supabaseAdmin.channel('zernio_messages').send({
      type: 'broadcast', event: 'new_message',
      payload: { channelId, userPhone, contactName: body.data.contact?.name, message: userMessage }
    });

    // Identificar Estabelecimento usando o channelId do Zernio
    const { data: integrations } = await supabaseAdmin
      .from("chatbot_integrations")
      .select("establishment_id, channel, config")
      .eq("status", "active")
      .contains("config", { zernio_channel_id: channelId });

    let estabelecimentoId = null;
    let integrationChannel = "whatsapp";

    if (integrations && integrations.length > 0) {
      estabelecimentoId = integrations[0].establishment_id;
      integrationChannel = integrations[0].channel;
    } else {
      console.log(`Nenhuma integração encontrada para Zernio Channel ID: ${channelId}`);
      // Fallback para dev local se n achar
      const { data: all } = await supabaseAdmin.from("chatbot_integrations").select("establishment_id, channel").limit(1);
      if (all && all.length > 0) {
         estabelecimentoId = all[0].establishment_id;
         integrationChannel = all[0].channel;
         console.log("Usando fallback de fallback", estabelecimentoId);
      } else {
         return new Response("OK", { status: 200 });
      }
    }

    // Carregar a Persona (Alma do Robô)
    const { data: robots } = await supabaseAdmin
      .from("chatbot_robots")
      .select("*")
      .eq("estabelecimento_id", estabelecimentoId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const robot = (robots && robots.length > 0) ? robots[0] : null;
    const robotName = robot ? robot.name : "Assistente";
    const robotTone = robot ? robot.tone : "Amigável e profissional";
    const robotRole = robot ? robot.role : "Agendador";

    // Buscar Histórico Real do Zernio
    console.log("Buscando histórico na Zernio API...");
    let rawHistory: any[] = [];
    try {
      const histReq = await fetch(`https://zernio.com/api/v1/inbox/conversations/${userPhone}/messages?accountId=${channelId}&limit=15&sort_order=asc`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${zernioApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (histReq.ok) {
        const histData = await histReq.json();
        if (histData.messages && Array.isArray(histData.messages)) {
          rawHistory = histData.messages.map((msg: any) => ({
             role: msg.direction === 'outgoing' ? "model" : "user",
             text: typeof msg.message === 'string' ? msg.message : (msg.message?.text || msg.text || "")
          })).filter((m: any) => m.text !== "");
        }
      }
    } catch (e) {
      console.error("Erro ao buscar histórico do Zernio", e);
    }

    if (userMessage) {
      rawHistory.push({ role: "user", text: userMessage });
    }

    const mergedHistory: any[] = [];
    for (const msg of rawHistory) {
      if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === msg.role) {
        mergedHistory[mergedHistory.length - 1].parts[0].text += "\n" + msg.text;
      } else {
        mergedHistory.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
    }

    // Configurar o Gemini
    
    const functionDeclarations = [
      { name: "get_services", description: "Retorna a lista de serviços oferecidos com preços e duração.", parameters: { type: "OBJECT", properties: {} } },
      { name: "get_professionals", description: "Retorna a lista de profissionais disponíveis no estabelecimento.", parameters: { type: "OBJECT", properties: {} } },
      { name: "check_availability", description: "Verifica horários livres para uma data específica.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "Data YYYY-MM-DD" }, professional_id: { type: "STRING", description: "ID do profissional (opcional)" } }, required: ["date"] } },
      { name: "create_appointment", description: "Cria um agendamento.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, time: { type: "STRING", description: "HH:MM" }, service_id: { type: "STRING" }, professional_id: { type: "STRING" }, client_name: { type: "STRING" } }, required: ["date", "time", "service_id", "client_name"] } },
      { name: "reschedule_appointment", description: "Reagenda um serviço futuro do cliente.", parameters: { type: "OBJECT", properties: { new_date: { type: "STRING", description: "YYYY-MM-DD" }, new_time: { type: "STRING", description: "HH:MM" } }, required: ["new_date", "new_time"] } },
      { name: "add_to_waitlist", description: "Adiciona o cliente à fila de espera para uma data.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, service_id: { type: "STRING" } }, required: ["date"] } },
      { name: "signal_intent", description: "Avisa o sistema sobre a intenção atual do cliente (ex: 'Consultando', 'Agendando', 'Reagendando'). Chame isso sempre que a intenção mudar.", parameters: { type: "OBJECT", properties: { intent: { type: "STRING", description: "A intenção curta (ex: 'Agendando', 'Dúvida')" } }, required: ["intent"] } }
    ];

    console.log("Chamando Gemini API...");

    // Broadcast bot is typing
    await supabaseAdmin.channel('zernio_messages').send({
      type: 'broadcast', event: 'bot_typing',
      payload: { channelId, userPhone, isTyping: true, name: robotName }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: mergedHistory,
      config: {
        systemInstruction: `
Você é ${robotName}, atuando como ${robotRole}.
Seu tom de voz é: ${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços de forma natural e amigável.
ANTES de responder sobre preços ou serviços, USE a ferramenta get_services.
ANTES de confirmar um horário, USE a ferramenta check_availability.
Se o cliente quiser reagendar, USE reschedule_appointment.
Sempre que você detectar a intenção do cliente (ex: quer agendar, só consultando preço, quer reagendar), USE a ferramenta signal_intent IMEDIATAMENTE para atualizar o painel.
`,
        temperature: 0.2,
        tools: [{ functionDeclarations }],
      }
    });

    let botResponseText = "";
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log("Gemini chamou a function:", call.name, call.args);
      let functionResult = {};

      if (call.name === "signal_intent") {
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: call.args.intent }
         });
         functionResult = { success: true };
      } else if (call.name === "get_services") {
         const { data: servs } = await supabaseAdmin.from('servicos').select('id, titulo, preco, duracao_min').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         functionResult = { services: servs || [] };
      } else if (call.name === "get_professionals") {
         const { data: profs } = await supabaseAdmin.from('profissionais').select('id, nome, especialidade').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         functionResult = { professionals: profs || [] };
      } else if (call.name === "check_availability") {
         // Lógica simplificada de disponibilidade: Puxar agendamentos do dia
         const { data: eventos } = await supabaseAdmin.rpc('get_public_events_by_day', {
            p_estab_id: estabelecimentoId,
            p_date_start: `${call.args.date} 00:00:00`,
            p_date_end: `${call.args.date} 23:59:59`
         });
         functionResult = { date: call.args.date, occupied_events: eventos || [], info: "O bot deve sugerir horários comerciais padrão (09h-18h) que NÃO estejam conflitantes com os ocupados listados." };
      } else if (call.name === "create_appointment") {
         // Primeiro buscar/criar cliente
         let { data: clienteReq } = await supabaseAdmin.from('clientes').select('id').eq('telefone', userPhone).limit(1);
         let clienteId = null;
         if (!clienteReq || clienteReq.length === 0) {
             const { data: newCli } = await supabaseAdmin.from('clientes').insert({ estabelecimento_id: estabelecimentoId, nome: call.args.client_name, telefone: userPhone }).select();
             if (newCli) clienteId = newCli[0].id;
         } else {
             clienteId = clienteReq[0].id;
         }

         const startDate = new Date(`${call.args.date}T${call.args.time}:00`);
         const endDate = new Date(startDate.getTime() + 30 * 60000); // hardcoded 30min default
         const { data: serv } = await supabaseAdmin.from("agenda_events").insert({
            title: `Agendamento - ${call.args.client_name}`,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            type: "service",
            status: "scheduled",
            estabelecimento_id: estabelecimentoId,
            cliente_id: clienteId,
            servico_id: call.args.service_id,
            profissional_id: call.args.professional_id || null
         }).select();
         
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: '✅ Agendado!' }
         });
         functionResult = { success: true, event: serv ? serv[0] : null };
      } else if (call.name === "reschedule_appointment") {
         functionResult = { success: true, info: "Simulado com sucesso." };
      } else if (call.name === "add_to_waitlist") {
         functionResult = { success: true, info: "Adicionado à fila de espera." };
      }

      const followupResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...mergedHistory,
          { role: 'model', parts: [{ functionCall: call }] },
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: functionResult } }] }
        ],
        config: { systemInstruction: `
Você é ${robotName}, atuando como ${robotRole}.
Seu tom de voz é: ${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços de forma natural e amigável.
ANTES de responder sobre preços ou serviços, USE a ferramenta get_services.
ANTES de confirmar um horário, USE a ferramenta check_availability.
Se o cliente quiser reagendar, USE reschedule_appointment.
Sempre que você detectar a intenção do cliente (ex: quer agendar, só consultando preço, quer reagendar), USE a ferramenta signal_intent IMEDIATAMENTE para atualizar o painel.
`, temperature: 0.2, tools: [{ functionDeclarations }] }
      });

      botResponseText = followupResponse.text || "Entendido.";
    } else {
      botResponseText = response.text || "Desculpe, não entendi.";
    }

    console.log("Gemini Response:", botResponseText);

    // Removido: Não salvamos mais a resposta do Bot localmente, apenas enviamos via Zernio

    // Enviar mensagem via Zernio API (Usando Master Key)
    console.log("Enviando mensagem de volta via Zernio API...");
    try {
      const zernioReq = await fetch(`https://zernio.com/api/v1/inbox/conversations/${userPhone}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zernioApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId: channelId,
          message: botResponseText
        })
      });
      const zRes = await zernioReq.json().catch(() => ({}));
      console.log("Zernio Response:", zRes);
    } catch(err) {
      console.error("Erro chamando Zernio:", err);
    }

    // Broadcast event for UI to refresh in real-time
    console.log("Broadcasting to UI...");
    await supabaseAdmin.channel('zernio_messages').send({
      type: 'broadcast',
      event: 'new_message',
      payload: { channelId, userPhone }
    });

    return new Response("OK", { status: 200 });

  } catch (err: any) {
    console.error("Webhook Zernio Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
