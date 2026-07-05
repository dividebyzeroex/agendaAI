import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import { GoogleGenAI } from "npm:@google/genai";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const zernioApiKey = Deno.env.get("ZERNIO_API_KEY");
const grokApiKey = Deno.env.get("GROK_API_KEY");

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

console.log("Zernio Webhook Starting...");

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received Webhook from Zernio:", JSON.stringify(body, null, 2));

    const { type, payload } = body;
    if (type !== 'message.received') {
      return new Response("Not a message event", { status: 200 });
    }

    const { message, conversation, account } = payload;
    const channelId = account.id; 
    const userPhone = conversation.phone || conversation.contactId; 
    const incomingText = message.text;

    const { data: estab } = await supabaseAdmin
      .from('zernio_channels')
      .select('estabelecimento_id')
      .eq('channel_id', channelId)
      .single();

    if (!estab) {
      console.log("Canal não mapeado para um estabelecimento.");
      return new Response("Not mapped", { status: 200 });
    }
    const estabelecimentoId = estab.estabelecimento_id;

    const { data: convData } = await supabaseAdmin
      .from('chatbot_conversations')
      .select('id, robot_id')
      .eq('estabelecimento_id', estabelecimentoId)
      .eq('client_phone', userPhone)
      .single();

    let robotId = null;
    if (convData) robotId = convData.robot_id;

    let robotName = "Assistente";
    let robotTone = "Amigável e profissional";
    let robotRole = "Agendador";
    if (robotId) {
      const { data: robot } = await supabaseAdmin
        .from("chatbot_robots")
        .select("*")
        .eq("id", robotId)
        .single();
      if (robot) {
        robotName = robot.name;
        robotTone = robot.tone;
        robotRole = robot.role;
      }
    }

    const { data: dbHistory } = await supabaseAdmin
      .from('chatbot_messages')
      .select('sender, text')
      .eq('estabelecimento_id', estabelecimentoId)
      .eq('client_phone', userPhone)
      .order('created_at', { ascending: true })
      .limit(20);

    const mergedHistory: any[] = [];
    if (dbHistory) {
      for (const msg of dbHistory) {
        const role = msg.sender === 'bot' ? 'model' : 'user';
        if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === role) {
          mergedHistory[mergedHistory.length - 1].parts[0].text += "\n" + msg.text;
        } else {
          mergedHistory.push({ role, parts: [{ text: msg.text }] });
        }
      }
    }
    
    // Anexar a mensagem atual se ela não estiver no histórico do BD (pode haver race condition com Zernio)
    if (mergedHistory.length === 0 || mergedHistory[mergedHistory.length - 1].parts[0].text !== incomingText) {
       mergedHistory.push({ role: 'user', parts: [{ text: incomingText }] });
    }

        const functionDeclarations = [
      { name: "get_services", description: "Retorna a lista de serviços oferecidos com preços e duração.", parameters: { type: "OBJECT", properties: {} } },
      { name: "get_professionals", description: "Retorna a lista de profissionais disponíveis no estabelecimento.", parameters: { type: "OBJECT", properties: {} } },
      { name: "check_availability", description: "Verifica horários livres para uma data específica.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "Data YYYY-MM-DD" }, professional_id: { type: "STRING", description: "ID do profissional (opcional)" } }, required: ["date"] } },
      { name: "create_appointment", description: "Cria um agendamento.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, time: { type: "STRING", description: "HH:MM" }, service_id: { type: "STRING" }, professional_id: { type: "STRING" }, client_name: { type: "STRING" } }, required: ["date", "time", "service_id", "client_name"] } },
      { name: "reschedule_appointment", description: "Reagenda um serviço futuro do cliente.", parameters: { type: "OBJECT", properties: { old_date: { type: "STRING", description: "Data do agendamento atual YYYY-MM-DD" }, new_date: { type: "STRING", description: "YYYY-MM-DD" }, new_time: { type: "STRING", description: "HH:MM" } }, required: ["old_date", "new_date", "new_time"] } },
      { name: "add_to_waitlist", description: "Adiciona o cliente à fila de espera para uma data.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, service_id: { type: "STRING", description: "ID do serviço (opcional)" } }, required: ["date"] } },
      { name: "signal_intent", description: "Avisa o sistema sobre a intenção atual do cliente (ex: 'Consultando', 'Agendando', 'Reagendando').", parameters: { type: "OBJECT", properties: { intent: { type: "STRING", description: "A intenção curta" } }, required: ["intent"] } }
    ];

    console.log("Chamando Gemini API...");

    await supabaseAdmin.channel('zernio_messages').send({
      type: 'broadcast', event: 'bot_typing',
      payload: { channelId, userPhone, isTyping: true, name: robotName }
    });

    const systemInstruction = `Você é ${robotName}, atuando como ${robotRole}. Seu tom de voz é: ${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços de forma natural e amigável.
ANTES de responder sobre preços ou serviços, USE a ferramenta get_services.
ANTES de confirmar um horário, USE a ferramenta check_availability.
Se o cliente quiser reagendar, USE reschedule_appointment.
Sempre que você detectar a intenção do cliente, USE a ferramenta signal_intent IMEDIATAMENTE para atualizar o painel.`;

        const executeTool = async (callName: string, callArgs: any) => {
      if (callName === "signal_intent") {
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: callArgs.intent }
         });
         return { success: true };
      } else if (callName === "get_services") {
         const { data: servs } = await supabaseAdmin.from('servicos').select('id, titulo, preco, duracao_min').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         return { services: servs || [] };
      } else if (callName === "get_professionals") {
         const { data: profs } = await supabaseAdmin.from('profissionais').select('id, nome, especialidade').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         return { professionals: profs || [] };
      } else if (callName === "check_availability") {
         const { data: horarios } = await supabaseAdmin.from('horarios_funcionamento').select('*').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         const { data: eventos } = await supabaseAdmin.rpc('get_public_events_by_day', {
            p_estab_id: estabelecimentoId,
            p_date_start: `${callArgs.date} 00:00:00`,
            p_date_end: `${callArgs.date} 23:59:59`
         });
         return { date: callArgs.date, business_hours: horarios || [], occupied_events: eventos || [], info: "NÃO sugira horários fora do expediente ou em dias fechados (ativo=false) conforme business_hours (0=Dom, 1=Seg...). Se o dia_semana consultado não estiver no business_hours, considere FECHADO." };
      } else if (callName === "create_appointment") {
         let { data: clienteReq } = await supabaseAdmin.from('clientes').select('id').eq('telefone', userPhone).limit(1);
         let clienteId = null;
         if (!clienteReq || clienteReq.length === 0) {
             const { data: newCli } = await supabaseAdmin.from('clientes').insert({ estabelecimento_id: estabelecimentoId, nome: callArgs.client_name || "Cliente", telefone: userPhone }).select();
             if (newCli) clienteId = newCli[0].id;
         } else {
             clienteId = clienteReq[0].id;
         }

         const startDate = new Date(`${callArgs.date}T${callArgs.time}:00`);
         const endDate = new Date(startDate.getTime() + 30 * 60000);
         const { data: serv } = await supabaseAdmin.from("agenda_events").insert({
            title: `Agendamento - ${callArgs.client_name}`,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            type: "service",
            status: "scheduled",
            estabelecimento_id: estabelecimentoId,
            cliente_id: clienteId,
            servico_id: callArgs.service_id,
            profissional_id: callArgs.professional_id || null
         }).select();
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: '✅ Agendado!' }
         });
         return { success: true, event: serv ? serv[0] : null };
      } else if (callName === "reschedule_appointment") {
         let { data: clienteReq } = await supabaseAdmin.from('clientes').select('id').eq('telefone', userPhone).limit(1);
         if (!clienteReq || clienteReq.length === 0) return { error: "Cliente não encontrado" };
         
         const oldStart = new Date(`${callArgs.old_date}T00:00:00`).toISOString();
         const oldEnd = new Date(`${callArgs.old_date}T23:59:59`).toISOString();
         
         let { data: eventoExistente } = await supabaseAdmin.from('agenda_events')
            .select('id, title, servico_id, profissional_id')
            .eq('cliente_id', clienteReq[0].id)
            .gte('start', oldStart)
            .lte('start', oldEnd)
            .limit(1);
            
         if (!eventoExistente || eventoExistente.length === 0) return { error: "Nenhum agendamento encontrado nessa data para reagendar." };

         const startDate = new Date(`${callArgs.new_date}T${callArgs.new_time}:00`);
         const endDate = new Date(startDate.getTime() + 30 * 60000);
         
         const { data: updated } = await supabaseAdmin.from('agenda_events')
            .update({ start: startDate.toISOString(), end: endDate.toISOString() })
            .eq('id', eventoExistente[0].id)
            .select();
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: '✅ Agendado!' }
         });
         return { success: true, event: updated ? updated[0] : null };
      } else if (callName === "add_to_waitlist") {
         let { data: clienteReq } = await supabaseAdmin.from('clientes').select('id').eq('telefone', userPhone).limit(1);
         let clienteId = null;
         if (!clienteReq || clienteReq.length === 0) {
             const { data: newCli } = await supabaseAdmin.from('clientes').insert({ estabelecimento_id: estabelecimentoId, nome: "Cliente", telefone: userPhone }).select();
             if (newCli) clienteId = newCli[0].id;
         } else {
             clienteId = clienteReq[0].id;
         }
         const { data: waitlist } = await supabaseAdmin.from('fila_espera').insert({
            estabelecimento_id: estabelecimentoId,
            cliente_id: clienteId,
            servico_id: callArgs.service_id || null,
            data_desejada: callArgs.date
         }).select();
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: '📋 Na Fila!' }
         });
         return { success: true, waitlist_entry: waitlist ? waitlist[0] : null };
      }
      return {};
    };

    let botResponseText = "";
    
    try {
      let currentResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: mergedHistory,
        config: {
          systemInstruction,
          temperature: 0.2,
          tools: [{ functionDeclarations }],
        }
      });
  
      let currentHistory = [...mergedHistory];
      let loopCount = 0;
  
      while (loopCount < 5) {
        if (currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
          const call = currentResponse.functionCalls[0];
          console.log("Gemini chamou a function:", call.name, call.args);
          currentHistory.push({ role: 'model', parts: [{ functionCall: call }] });
          
          let functionResult = await executeTool(call.name, call.args);
  
          currentHistory.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: functionResult } }] });
          currentResponse = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: currentHistory,
            config: { systemInstruction, temperature: 0.2, tools: [{ functionDeclarations }] }
          });
          loopCount++;
        } else {
          botResponseText = currentResponse.text || "Entendido.";
          break;
        }
      }
    } catch (geminiError: any) {
      console.error("Gemini failed, falling back to Grok:", geminiError.message);
      
      if (!grokApiKey) {
        throw new Error("Gemini failed and GROK_API_KEY is not configured.");
      }

      const grokMessages = [
        { role: "system", content: systemInstruction },
        ...mergedHistory.map((m: any) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.parts && m.parts[0] ? m.parts[0].text : ""
        }))
      ];

      const grokTools = functionDeclarations.map(fd => {
        let properties = fd.parameters.properties || {};
        let openaiProperties: any = {};
        for (const key in properties) {
          openaiProperties[key] = {
            type: properties[key].type.toLowerCase(),
            description: properties[key].description
          };
        }
        return {
          type: "function",
          function: {
            name: fd.name,
            description: fd.description,
            parameters: {
              type: "object",
              properties: openaiProperties,
              required: fd.parameters.required || []
            }
          }
        };
      });

      let currentGrokMessages = [...grokMessages];
      let loopCount = 0;
      let finalResponseText = "";

      while (loopCount < 5) {
        const grokReq = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${grokApiKey}`
          },
          body: JSON.stringify({
            model: "grok-4.3",
            messages: currentGrokMessages,
            temperature: 0.2,
            tools: grokTools
          })
        });

        if (!grokReq.ok) {
          const errorText = await grokReq.text();
          throw new Error("Grok API failed: " + errorText);
        }

        const grokData = await grokReq.json();
        const message = grokData.choices[0].message;
        currentGrokMessages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
          const call = message.tool_calls[0];
          const callName = call.function.name;
          const callArgs = JSON.parse(call.function.arguments);
          console.log("Grok chamou a function:", callName, callArgs);

          let functionResult = await executeTool(callName, callArgs);

          currentGrokMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(functionResult)
          });
          loopCount++;
        } else {
          finalResponseText = message.content || "Entendido.";
          break;
        }
      }
      botResponseText = finalResponseText;
    }

    console.log("AI Final Response:", botResponseText);

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
