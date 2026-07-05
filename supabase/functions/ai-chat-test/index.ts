import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import { GoogleGenAI } from "npm:@google/genai";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

console.log("AI Chat Test Function Starting...");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received AI Chat Test Request:", JSON.stringify(body, null, 2));

    const { estabelecimento_id, robot_id, history } = body;

    if (!estabelecimento_id || !history) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Identificar Robô
    let robotName = "Assistente Teste";
    let robotTone = "Amigável e profissional";
    let robotRole = "Agendador";

    if (robot_id) {
      const { data: robot } = await supabaseAdmin
        .from("chatbot_robots")
        .select("*")
        .eq("id", robot_id)
        .single();
      
      if (robot) {
        robotName = robot.name;
        robotTone = robot.tone;
        robotRole = robot.role;
      }
    }

    const mergedHistory: any[] = [];
    for (const msg of history) {
      if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === msg.role) {
        mergedHistory[mergedHistory.length - 1].parts[0].text += "\n" + msg.text;
      } else {
        mergedHistory.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
    }

    const functionDeclarations = [
      { name: "get_services", description: "Retorna a lista de serviços oferecidos com preços e duração.", parameters: { type: "OBJECT", properties: {} } },
      { name: "get_professionals", description: "Retorna a lista de profissionais disponíveis no estabelecimento.", parameters: { type: "OBJECT", properties: {} } },
      { name: "check_availability", description: "Verifica horários livres para uma data específica.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "Data YYYY-MM-DD" }, professional_id: { type: "STRING", description: "ID do profissional (opcional)" } }, required: ["date"] } },
      { name: "create_appointment", description: "Cria um agendamento.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, time: { type: "STRING", description: "HH:MM" }, service_id: { type: "STRING" }, professional_id: { type: "STRING" }, client_name: { type: "STRING" } }, required: ["date", "time", "service_id", "client_name"] } },
      { name: "reschedule_appointment", description: "Reagenda um serviço futuro do cliente.", parameters: { type: "OBJECT", properties: { new_date: { type: "STRING", description: "YYYY-MM-DD" }, new_time: { type: "STRING", description: "HH:MM" } }, required: ["new_date", "new_time"] } },
      { name: "add_to_waitlist", description: "Adiciona o cliente à fila de espera para uma data.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, service_id: { type: "STRING" } }, required: ["date"] } },
      { name: "signal_intent", description: "Avisa o sistema sobre a intenção atual do cliente (ex: 'Consultando', 'Agendando', 'Reagendando').", parameters: { type: "OBJECT", properties: { intent: { type: "STRING", description: "A intenção curta" } }, required: ["intent"] } }
    ];

    console.log("Chamando Gemini API (Test Mode)...");

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: mergedHistory,
      config: {
        systemInstruction: `
Você é ${robotName}, atuando como ${robotRole}.
Seu tom de voz é: ${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços de forma natural e amigável.
ANTES de responder sobre preços ou serviços, USE a ferramenta get_services.
ANTES de confirmar um horário, USE a ferramenta check_availability.
Se o cliente quiser reagendar, USE reschedule_appointment.
Sempre que você detectar a intenção do cliente, USE a ferramenta signal_intent IMEDIATAMENTE.
[ATENÇÃO] Você está operando em MODO TESTE (Sandbox) com o próprio administrador. Trate-o como um cliente real, mas saiba que ele está validando o sistema.
`,
        temperature: 0.2,
        tools: [{ functionDeclarations }],
      }
    });

    let botResponseText = "";
    let currentResponse = response;
    let currentHistory = [...mergedHistory];

    let loopCount = 0;
    while (loopCount < 5) {
      if (currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
        const call = currentResponse.functionCalls[0];
        console.log("Gemini chamou a function:", call.name, call.args);
        
        currentHistory.push({ role: 'model', parts: [{ functionCall: call }] });
        
        let functionResult: any = {};

        if (call.name === "signal_intent") {
           functionResult = { success: true };
        } else if (call.name === "get_services") {
           const { data: servs } = await supabaseAdmin.from('servicos').select('id, titulo, preco, duracao_min').eq('estabelecimento_id', estabelecimento_id).eq('ativo', true);
           functionResult = { services: servs || [] };
        } else if (call.name === "get_professionals") {
           const { data: profs } = await supabaseAdmin.from('profissionais').select('id, nome, especialidade').eq('estabelecimento_id', estabelecimento_id).eq('ativo', true);
           functionResult = { professionals: profs || [] };
        } else if (call.name === "check_availability") {
           const { data: eventos } = await supabaseAdmin.rpc('get_public_events_by_day', {
              p_estab_id: estabelecimento_id,
              p_date_start: `${call.args.date} 00:00:00`,
              p_date_end: `${call.args.date} 23:59:59`
           });
           functionResult = { date: call.args.date, occupied_events: eventos || [], info: "O bot deve sugerir horários comerciais padrão (09h-18h) que NÃO estejam conflitantes com os ocupados listados." };
        } else if (call.name === "create_appointment") {
           let userPhone = "5511999999999"; 
           let { data: clienteReq } = await supabaseAdmin.from('clientes').select('id').eq('telefone', userPhone).limit(1);
           let clienteId = null;
           if (!clienteReq || clienteReq.length === 0) {
               const { data: newCli } = await supabaseAdmin.from('clientes').insert({ estabelecimento_id, nome: "Testador IA", telefone: userPhone }).select();
               if (newCli) clienteId = newCli[0].id;
           } else {
               clienteId = clienteReq[0].id;
           }

           const startDate = new Date(`${call.args.date}T${call.args.time}:00`);
           const endDate = new Date(startDate.getTime() + 30 * 60000);
           const { data: serv } = await supabaseAdmin.from("agenda_events").insert({
              title: `[TESTE IA] ${call.args.client_name}`,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              type: "service",
              status: "scheduled",
              estabelecimento_id,
              cliente_id: clienteId,
              servico_id: call.args.service_id,
              profissional_id: call.args.professional_id || null
           }).select();
           
           functionResult = { success: true, event: serv ? serv[0] : null };
        } else if (call.name === "reschedule_appointment") {
           functionResult = { success: true, info: "Simulado com sucesso." };
        } else if (call.name === "add_to_waitlist") {
           functionResult = { success: true, info: "Adicionado à fila de espera." };
        }

        currentHistory.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: functionResult } }] });

        currentResponse = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: currentHistory,
          config: { systemInstruction: `
Você é ${robotName}, atuando como ${robotRole}.
Seu tom de voz é: ${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços de forma natural e amigável.
ANTES de responder sobre preços ou serviços, USE a ferramenta get_services.
ANTES de confirmar um horário, USE a ferramenta check_availability.
Se o cliente quiser reagendar, USE reschedule_appointment.
`, temperature: 0.2, tools: [{ functionDeclarations }] }
        });

        // Loop continuará se a nova resposta tiver outra function call
        loopCount++;
      } else {
        // Se a resposta tem texto, nós encerramos
        botResponseText = currentResponse.text || "Entendido.";
        break;
      }
    }

    console.log("Gemini Response:", botResponseText);

    return new Response(JSON.stringify({ response: botResponseText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("Test AI Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
