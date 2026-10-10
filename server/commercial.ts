import { createHmac, timingSafeEqual } from 'node:crypto';
export const TERMS_VERSION = '2026-10-10';
export function unsubscribeToken(id: string, secret: string): string { return createHmac('sha256',secret).update(`unsubscribe:${id}`).digest('hex'); }
export function validUnsubscribe(id: string, token: string, secret: string): boolean {
 if (!secret || !/^[a-f0-9]{64}$/.test(token)) return false;
 return timingSafeEqual(Buffer.from(token),Buffer.from(unsubscribeToken(id,secret)));
}
export function eligible(p: {email?:string|null;consent_at?:string|null;unsubscribed_at?:string|null;status:string}): boolean {
 return !!p.email && !!p.consent_at && !p.unsubscribed_at && !['unsubscribed','lost','replied'].includes(p.status);
}
export function nextStage(p: {status:string;created_at:string;last_contact_at?:string|null}, trialEnd?:string|null, now=Date.now()): string|null {
 if (p.last_contact_at && now-Date.parse(p.last_contact_at)<3*86400000) return null;
 if (p.status==='won') return now-Date.parse(p.created_at)>=30*86400000?'retention':'paid-welcome';
 if (trialEnd) {
  const days=(Date.parse(trialEnd)-now)/86400000;
  if(days<=0) return 'trial-ended';
  if(days<=3) return 'trial-ending';
  if(now-Date.parse(p.created_at)>=7*86400000) return 'activation';
  return 'welcome';
 }
 if(p.status==='qualified') return 'invitation';
 if(p.status==='contacted' && now-Date.parse(p.created_at)>=7*86400000) return 'follow-up';
 return null;
}
export function messageFor(stage: string,business:string,url:string):{subject:string;body:string} {
 const intro=`Olá, equipe ${business}.\n\nSou o assistente comercial automatizado da AgendaAI.`;
 const content: Record<string,[string,string]>={
 'paid-welcome':['Sua assinatura está ativa','Obrigado por escolher a AgendaAI. Mantenha os horários atualizados, revise a disponibilidade da equipe e acompanhe seus agendamentos no painel. Você pode consultar faturas e gerenciar sua renovação na área de faturamento.'],
 'retention':['A AgendaAI está ajudando na sua rotina?','Queremos saber como está a experiência da sua equipe. Qual tarefa ainda exige trabalho manual? Responda com seu feedback para orientar as próximas melhorias. Confira também se os serviços e horários publicados continuam atualizados.'],
 'invitation':['Sua agenda merece menos trabalho manual','Que tal reunir agendamentos, cadastro de clientes, equipe e controle do atendimento em um só lugar? A AgendaAI oferece 30 dias de teste, sem cartão e sem cobrança automática. Você configura seus serviços, compartilha seu link e avalia a rotina com seu próprio negócio. Os planos mensais começam em R$ 97. Recursos de mensageria dependem da configuração dos canais e dos limites do plano.'],
 'follow-up':['Uma forma prática de avaliar a AgendaAI','Se organizar horários e acompanhar clientes ainda toma tempo da sua equipe, o teste de 30 dias pode ajudar você a avaliar uma alternativa. Comece por um serviço e um profissional; acompanhe os agendamentos antes de decidir. Sem promessa de resultado garantido e sem cobrança automática ao fim do teste.'],
 'welcome':['Seu teste de 30 dias: vamos preparar o primeiro agendamento','Bem-vindo à AgendaAI. Para começar: cadastre um serviço, defina o horário de atendimento e compartilhe o link da sua agenda. Faça uma reserva de teste para conferir a experiência do cliente. Você pode responder a este e-mail se precisar de ajuda.'],
 'activation':['Como está a primeira semana com a AgendaAI?','Você já publicou seu link de agendamento? Confira os horários, cadastre sua equipe e revise o cadastro dos clientes. O objetivo do teste é você avaliar se a plataforma simplifica a sua rotina. Conte por resposta o que está faltando; seu retorno fica com a equipe responsável.'],
 'trial-ending':['Seu teste está chegando ao fim','Seu período de avaliação termina nos próximos três dias. Para continuar, escolha um plano na área de faturamento. Starter: R$ 97/mês; Business Pro: R$ 197/mês; Premium: R$ 349/mês. Nenhuma assinatura é iniciada sem sua contratação no checkout.'],
 'trial-ended':['Seu período de avaliação terminou','Obrigado por experimentar a AgendaAI. O teste terminou e não gerou cobrança automática. Você pode consultar as opções de assinatura na área de faturamento. Se ainda houver uma dúvida para decidir, responda a este e-mail.']
 };
 const [subject,body]=content[stage]||content['welcome'];
 return {subject,body:`${intro}\n\n${body}\n\nAcesse: ${url}${['invitation','follow-up'].includes(stage)?'/login?trial=30':'/admin'}\nConheça os termos: ${url}/termos\n\nEquipe AgendaAI`};
}
