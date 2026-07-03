import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { SmsService } from './sms.service';

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
  private smsService = inject(SmsService);

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

  // ─── Autenticação do Colaborador (Magic Link via Supabase Auth) ─────────

  async solicitarMagicLink(identificador: string, estabelecimentoId: string): Promise<{ emailMascara: string }> {
    // 0. Validação de formato UUID para evitar erro 22P02 do PostgreSQL
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(identificador)) {
      throw new Error('O formato da ID digitada é inválido. Verifique se você copiou corretamente.');
    }
    if (!estabelecimentoId || !uuidRegex.test(estabelecimentoId)) {
      throw new Error('O link de acesso do estabelecimento está inválido.');
    }

    // 1. Busca profissional pelo ID, validando se pertence ao estabelecimento
    const { data: pro, error: proErr } = await this.supabase
      .from('profissionais')
      .select('id, email, nome')
      .eq('id', identificador)
      .eq('estabelecimento_id', estabelecimentoId)
      .maybeSingle();

    if (proErr) throw proErr;
    if (!pro) throw new Error('Funcionário não localizado neste estabelecimento com a ID fornecida.');
    if (!pro.email) throw new Error('Funcionário não possui E-mail cadastrado. Peça ao gestor para cadastrar.');

    // 2. Aciona o disparo de Magic Link do Supabase Auth para a caixa de e-mail dele
    const redirectUrl = window.location.origin + `/pro/${estabelecimentoId}?magic=true`;
    
    const { error } = await this.supabase.auth.signInWithOtp({
      email: pro.email,
      options: {
        emailRedirectTo: redirectUrl,
      }
    });

    if (error) throw new Error('Falha ao acionar envio de e-mail mágico: ' + error.message);

    // Retorna o e-mail mascarado para exibir na tela de sucesso
    const [user, domain] = pro.email.split('@');
    const emailMascara = user.substring(0, 3) + '***@' + domain;
    return { emailMascara };
  }

  async checkMagicLinkSession(estabelecimentoId: string): Promise<any | null> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session || !session.user || !session.user.email) return null;

    // Localiza o funcionário correspondente ao e-mail autenticado neste estabelecimento
    const { data: pro } = await this.supabase
      .from('profissionais')
      .select('*')
      .eq('email', session.user.email)
      .eq('estabelecimento_id', estabelecimentoId)
      .maybeSingle();

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

  async fetchProfissionais(establishmentId?: string): Promise<any[]> {
    let query = this.supabase
      .from('profissionais')
      .select('*')
      .eq('ativo', true);

    if (establishmentId) {
      query = query.eq('estabelecimento_id', establishmentId);
    }

    const { data, error } = await query.order('nome');
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
