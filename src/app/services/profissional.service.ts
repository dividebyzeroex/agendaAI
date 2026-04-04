import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface ServicoExtra {
  titulo: string;
  preco: number;
  emoji?: string;
}

export interface CaixaItem {
  id?: string;
  agenda_event_id: string;
  cliente_nome: string;
  servicos: ServicoExtra[];
  valor_total: number;
  status_caixa?: 'pendente' | 'pago' | 'cancelado';
  forma_pagamento?: string;
  profissional?: string;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ProfissionalService {
  private supabase = inject(SupabaseService).client;

  // Agenda do dia em tempo real
  agendaHoje$ = new BehaviorSubject<any[]>([]);

  // Itens do caixa pendentes
  caixaPendente$ = new BehaviorSubject<CaixaItem[]>([]);

  constructor() {
    // Inicialização movida para o componente após login
  }

  // ─── Agenda do Dia ─────────────────────────────────────────────────────
  
  async fetchAgendaHoje(profissionalId?: string) {
    const hoje = new Date().toISOString().split('T')[0];
    try {
      let query = this.supabase
        .from('agenda_events')
        .select(`
          *,
          clientes(nome, telefone),
          servicos(titulo, preco, emoji, duracao_min)
        `)
        .gte('start', `${hoje}T00:00:00`)
        .lte('start', `${hoje}T23:59:59`);
      
      if (profissionalId) {
        query = query.eq('profissional_id', profissionalId);
      }

      const { data, error } = await query.order('start');
      
      if (error) {
        console.error('[ProSvc] Erro ao buscar agenda:', error);
        this.agendaHoje$.next([]);
        return;
      }
      
      this.agendaHoje$.next(data || []);
    } catch (err) {
      console.error('[ProSvc] Erro crítico na agenda:', err);
      this.agendaHoje$.next([]);
    }
  }

  async fetchCaixaPendente() {
    const { data } = await this.supabase
      .from('caixa_itens')
      .select('*')
      .eq('status_caixa', 'pendente')
      .order('created_at', { ascending: false });
    this.caixaPendente$.next(data || []);
  }

  // ─── Atendimento ───────────────────────────────────────────────────────

  async iniciarAtendimento(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('agenda_events')
      .update({ status: 'em_atendimento' })
      .eq('id', eventId);
    if (error) throw error;
  }

  async finalizarEEnviarCaixa(params: {
    eventId: string;
    clienteNome: string;
    servicoPrincipal: ServicoExtra;
    servicosExtras: ServicoExtra[];
    profissional: string;
  }): Promise<CaixaItem> {
    const todosServicos = [params.servicoPrincipal, ...params.servicosExtras];
    const valorTotal    = todosServicos.reduce((sum, s) => sum + s.preco, 0);

    // 1. Atualiza o evento como finalizado
    await this.supabase
      .from('agenda_events')
      .update({
        status: 'finalizado',
        servicos_extras: params.servicosExtras,
        valor_total: valorTotal,
        cobranca_enviada: true,
        cobranca_enviada_at: new Date().toISOString(),
        profissional_nome: params.profissional,
      })
      .eq('id', params.eventId);

    // 2. Cria o item de caixa
    const { data, error } = await this.supabase
      .from('caixa_itens')
      .insert([{
        agenda_event_id: params.eventId,
        cliente_nome:    params.clienteNome,
        servicos:        todosServicos,
        valor_total:     valorTotal,
        profissional:    params.profissional,
        status_caixa:    'pendente',
      }])
      .select()
      .single();

    if (error) throw error;

    await this.fetchCaixaPendente();
    return data;
  }

  async registrarPagamento(caixaId: string, forma: string): Promise<void> {
    await this.supabase
      .from('caixa_itens')
      .update({
        status_caixa:    'pago',
        forma_pagamento: forma,
        pago_em:         new Date().toISOString(),
      })
      .eq('id', caixaId);
    await this.fetchCaixaPendente();
  }

  // ─── Autenticação do Colaborador (OTP) ────────────────────────────────

  async solicitarCodigo(identificador: string): Promise<{ proId: string, telefone: string }> {
    // 1. Busca profissional por ID ou Telefone
    const { data: pro, error: proErr } = await this.supabase
      .from('profissionais')
      .select('id, telefone, nome')
      .or(`id.eq.${identificador},telefone.eq.${identificador}`)
      .maybeSingle();

    if (proErr) throw proErr;
    if (!pro) throw new Error('Profissional não localizado.');
    if (!pro.telefone) throw new Error('Profissional sem telefone cadastrado.');

    // 2. Gera código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();

    // 3. Salva no banco (tabela profissional_otps)
    await this.supabase.from('profissional_otps').delete().eq('profissional_id', pro.id);
    const { error: otpErr } = await this.supabase
      .from('profissional_otps')
      .insert([{
        profissional_id: pro.id,
        codigo,
        expires_at: expiresAt
      }]);
    
    if (otpErr) throw otpErr;

    // MOCK: Log do código para teste local
    console.log(`[AUTH] Código para ${pro.nome}: ${codigo}`);
    
    const telMascara = pro.telefone.replace(/.(?=.{4})/g, '*');
    return { proId: pro.id, telefone: telMascara };
  }

  async verificarCodigo(proId: string, codigo: string): Promise<any> {
    const { data: otp, error } = await this.supabase
      .from('profissional_otps')
      .select('*')
      .eq('profissional_id', proId)
      .eq('codigo', codigo)
      .maybeSingle();

    if (error || !otp) throw new Error('Código inválido ou expirado.');
    if (new Date(otp.expires_at) < new Date()) throw new Error('Código expirado.');

    const { data: pro } = await this.supabase
      .from('profissionais')
      .select('*')
      .eq('id', proId)
      .single();

    await this.supabase.from('profissional_otps').delete().eq('id', otp.id);
    return pro;
  }

  subscribeRealtime(proId: string) {
    this.supabase
      .channel('profissional_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_events' },
        () => this.fetchAgendaHoje(proId))
      .subscribe();
  }

  // ─── Cadastro de Profissionais ─────────────────────────────────────────

  async fetchProfissionais(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('profissionais')
      .select('*')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    return data || [];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  formatHora(dt: string): string {
    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  formatDuracao(start: string, end: string): string {
    const min = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
    return `${min}min`;
  }

  getStatusInfo(status: string): { label: string; color: string; bg: string } {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      pendente:      { label: 'Pendente',       color: '#b06000', bg: '#fef9e7' },
      confirmado:    { label: 'Confirmado',      color: '#34a853', bg: '#e6f4ea' },
      em_atendimento:{ label: 'Em Atendimento',  color: '#1a73e8', bg: '#e8f0fe' },
      finalizado:    { label: 'Finalizado',      color: '#5f6368', bg: '#f1f3f4' },
      cancelado:     { label: 'Cancelado',       color: '#ea4335', bg: '#fce8e8' },
      concluido:     { label: 'Concluído',       color: '#5f6368', bg: '#f1f3f4' },
    };
    return map[status] || { label: status, color: '#5f6368', bg: '#f1f3f4' };
  }
}
