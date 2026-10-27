import type { AgendaEvent } from '../services/agenda-event.service';
import type { Cliente } from '../services/cliente.service';

export interface ContextAction {
  label: string;
  route: string;
}

export interface ContextInsight {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  action: ContextAction;
  tone: 'neutral' | 'attention' | 'positive';
}

export interface HomeContext {
  date: Date;
  appointments: AgendaEvent[];
  upcoming: AgendaEvent[];
  late: AgendaEvent[];
  totalToday: number;
  inProgress: number;
  completed: number;
  pending: number;
  clients: number;
  bookedMonthValue: number;
  insights: ContextInsight[];
}

const ACTIVE = new Set(['confirmado', 'pendente', 'em_atendimento', 'concluido']);
const WAITING = new Set(['confirmado', 'pendente']);

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function buildHomeContext(events: AgendaEvent[], clients: Cliente[], now = new Date()): HomeContext {
  const valid = events.filter((event) => Number.isFinite(new Date(event.start).getTime()));
  const appointments = valid
    .filter((event) => sameLocalDay(new Date(event.start), now) && event.status !== 'cancelado')
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const upcoming = appointments.filter((event) => WAITING.has(event.status || 'confirmado') && new Date(event.start).getTime() > now.getTime());
  const late = appointments.filter((event) => WAITING.has(event.status || 'confirmado') && now.getTime() - new Date(event.start).getTime() >= 10 * 60_000);
  const inProgress = appointments.filter((event) => event.status === 'em_atendimento').length;
  const completed = appointments.filter((event) => event.status === 'concluido').length;
  const pending = appointments.filter((event) => event.status === 'pendente').length;
  const bookedMonthValue = valid
    .filter((event) => event.status !== 'cancelado' && event.status !== 'noshow' && ACTIVE.has(event.status || 'confirmado') &&
      new Date(event.start).getMonth() === now.getMonth() && new Date(event.start).getFullYear() === now.getFullYear())
    .reduce((sum, event) => sum + (Number.isFinite(event.valor_total) ? Math.max(0, event.valor_total || 0) : 0), 0);

  const insights: ContextInsight[] = [];
  if (late.length) {
    insights.push({ id: 'late', eyebrow: 'Precisa da sua atenção', title: `${late.length} ${late.length === 1 ? 'horário precisa' : 'horários precisam'} de conferência`,
      description: 'O início previsto já passou, mas o atendimento continua marcado como pendente ou confirmado. Verifique antes de registrar uma falta.',
      action: { label: 'Conferir na agenda', route: '/admin/agenda' }, tone: 'attention' });
  }
  if (inProgress) {
    insights.push({ id: 'progress', eyebrow: 'Acontecendo agora', title: `${inProgress} ${inProgress === 1 ? 'atendimento em andamento' : 'atendimentos em andamento'}`,
      description: 'Acompanhe o andamento dos serviços e mantenha as comandas sincronizadas com o caixa.',
      action: { label: 'Acompanhar atendimentos', route: '/admin/agenda' }, tone: 'positive' });
  }
  if (upcoming.length) {
    const next = upcoming[0];
    const time = new Date(next.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    insights.push({ id: 'next', eyebrow: 'Seu próximo compromisso', title: `${time} · ${next.title || 'Atendimento agendado'}`,
      description: `${next.profissional_nome || 'Equipe a definir'} · Confira os detalhes antes de receber o cliente.`,
      action: { label: 'Abrir atendimento', route: next.id ? `/admin/agenda/atendimento/${encodeURIComponent(next.id)}` : '/admin/agenda' }, tone: 'neutral' });
  }
  if (!appointments.length) {
    insights.push({ id: 'empty', eyebrow: 'Seu dia, no seu ritmo', title: 'A agenda está livre hoje',
      description: 'Nenhum atendimento não cancelado está marcado para hoje. Você pode criar um horário ou compartilhar seu link de reservas.',
      action: { label: 'Criar agendamento', route: '/admin/agenda/novo' }, tone: 'neutral' });
  } else {
    insights.push({ id: 'overview', eyebrow: 'Visão do dia', title: `${appointments.length} ${appointments.length === 1 ? 'atendimento previsto' : 'atendimentos previstos'} para hoje`,
      description: `${completed} concluídos · ${pending} aguardando confirmação. Os dados acompanham as atualizações da agenda.`,
      action: { label: 'Ver agenda completa', route: '/admin/agenda' }, tone: 'neutral' });
  }
  return { date: now, appointments, upcoming, late, totalToday: appointments.length,
    inProgress, completed, pending, clients: clients.length, bookedMonthValue, insights };
}

export interface ContextReply {
  title: string;
  message: string;
  action?: ContextAction;
}

function normalize(query: string): string {
  return query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function replyToHomeQuery(query: string, context: HomeContext, role: string): ContextReply {
  const q = normalize(query);
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  if (/comiss|repasse/.test(q)) {
    return { title: 'Comissões da equipe', message: 'Para conferir valores pagos, pendentes e regras de cada profissional, abra o relatório de comissões. Nenhum pagamento será alterado por aqui.',
      action: { label: 'Ver comissões', route: '/admin/comissoes' } };
  }
  if (/fatur|receita|financeir|quanto (ganhei|vendi)|valor do mes/.test(q)) {
    return { title: 'Valores previstos neste mês', message: `${currency.format(context.bookedMonthValue)} é a soma dos valores informados nos agendamentos não cancelados deste mês. Isso não significa dinheiro recebido: consulte os lançamentos financeiros para o faturamento realizado.`,
      action: { label: 'Abrir relatórios', route: '/admin/analytics' } };
  }
  if (/cliente|retenc|aniversar/.test(q) && !/agend|horar|marcar|encaix|agenda/.test(q)) {
    return role === 'dono'
      ? { title: 'Relacionamento com clientes', message: `Há ${context.clients} clientes carregados para esta unidade. Para consultar perfis ou iniciar um contato, use a área de clientes.`, action: { label: 'Abrir clientes', route: '/admin/clientes' } }
      : { title: 'Acesso à base de clientes', message: 'A consulta de perfis de clientes exige uma função autorizada. Sua experiência respeita as permissões da unidade.' };
  }
  if (/agend|horar|marcar|encaix|agenda/.test(q)) {
    if (/novo|criar|marcar|agendar|encaix/.test(q)) {
      return { title: 'Preparar um agendamento', message: 'Posso levar você ao formulário completo para escolher cliente, serviços, profissional e disponibilidade. A reserva só será criada após sua confirmação.', action: { label: 'Novo agendamento', route: '/admin/agenda/novo' } };
    }
    return { title: 'Sua agenda hoje', message: `Você tem ${context.totalToday} atendimentos não cancelados hoje: ${context.inProgress} em andamento, ${context.completed} concluídos e ${context.late.length} para conferir.`, action: { label: 'Abrir agenda', route: '/admin/agenda' } };
  }
  if (/caixa|comanda|pagament|cobran/.test(q)) {
    return { title: 'Caixa e comandas', message: 'Acesse a operação de caixa para conferir comandas e finalizar pagamentos com as validações habituais.', action: { label: 'Ir ao caixa', route: '/admin/caixa' } };
  }
  if (/profission|equipe|funcionar/.test(q)) {
    return role === 'dono'
      ? { title: 'Sua equipe', message: 'Visualize profissionais, serviços e regras cadastradas na gestão da equipe.', action: { label: 'Gerenciar equipe', route: '/admin/profissionais' } }
      : { title: 'Sua equipe', message: 'O cadastro de profissionais é reservado ao proprietário da unidade.' };
  }
  return { title: 'Vamos cuidar do que importa', message: `Hoje há ${context.totalToday} atendimentos na agenda. Você pode perguntar sobre horários, comissões, valores previstos, clientes ou caixa. Para alterações, sempre abrirei a etapa de revisão correspondente.`,
    action: { label: 'Ver agenda', route: '/admin/agenda' } };
}
