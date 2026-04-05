import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { createSWRCache } from '../utils/memoize';

export interface Servico {
  id?: string;
  titulo: string;
  descricao?: string;
  preco: number;
  duracao_min: number;
  emoji?: string;
  ativo?: boolean;
}

export interface Horario {
  id?: string;
  dia_semana: number;
  dia_nome: string;
  abre: string | null;
  fecha: string | null;
  ativo: boolean;
}

export interface Estabelecimento {
  id?: string;
  nome: string;
  cnpj?: string;
  segmento?: string;
  volume_clientes?: string;
  slug?: string;
  descricao?: string;
  telefone?: string;
  endereco?: string;
  endereco_completo?: string;
  cidade?: string;
  logo_url?: string;
  cor_primaria?: string;
  plano?: string;
  plano_expires_at?: string;
  trial_ends_at?: string;
  stripe_subscription_id?: string;
  status_assinatura?: string;
  onboarding_completo?: boolean;
  user_id?: string;
}

@Injectable({ providedIn: 'root' })
export class EstabelecimentoService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);

  servicos$        = new BehaviorSubject<Servico[]>([]);
  horarios$        = new BehaviorSubject<Horario[]>([]);
  estabelecimento$ = new BehaviorSubject<Estabelecimento | null>(null);
  
  // ID Reativo para blindagem de Tenancy em outros serviços
  private activeIdSubject = new BehaviorSubject<string | null>(null);
  activeId$ = this.activeIdSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  isLoading$ = this.isLoadingSubject.asObservable();

  // ✅ SWR Cache — retorna instantâneo, refresca em background após TTL
  // Adaptado de memoizeWithTTLAsync do Claude Source Code (utils/memoize.ts)
  private _estabelecimentoCache = createSWRCache(
    (userId: string) => this._fetchEstabelecimentoRaw(userId),
    5 * 60 * 1000, // 5 minutos TTL
  );

  private _servicosCache = createSWRCache(
    (estId: string) => this._fetchServicosRaw(estId),
    3 * 60 * 1000, // 3 minutos TTL (mudam com mais frequência)
  );

  constructor() {
    this.init();
  }

  private async init() {
    this.isLoadingSubject.next(true);
    await Promise.all([
      this.fetchEstabelecimento(),
      this.fetchServicos(),
      this.fetchHorarios(),
    ]);
    this.ngZone.run(() => {
      this.isLoadingSubject.next(false);
    });
  }

  // ─── Estabelecimento ───────────────────────────────────────────────────────

  private async _fetchEstabelecimentoRaw(userId: string): Promise<Estabelecimento | null> {
    const { data, error } = await this.supabase
      .rpc('get_estabelecimento_by_user', { p_user_id: userId })
      .maybeSingle();
    
    if (error) {
      console.warn('[EstabelecimentoService] Erro ao buscar empresa via POST:', error);
      return null;
    }
    return data as Estabelecimento | null;
  }

  async fetchEstabelecimento() {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) {
      this.activeIdSubject.next(null);
      return;
    }
    const data = await this._estabelecimentoCache.get(user.id);
    if (data) {
      this.ngZone.run(() => {
        this.estabelecimento$.next(data);
        this.activeIdSubject.next(data.id || null);
        console.log('[Tenancy Context] ID Ativo:', data.id);
      });
    }
  }

  async updateEstabelecimento(changes: Partial<Estabelecimento>) {
    const current = this.estabelecimento$.value;
    if (!current?.id) return;
    const { data, error } = await this.supabase
      .rpc('update_estabelecimento_safe', { p_id: current.id, p_changes: changes })
      .maybeSingle<Estabelecimento>();
    if (error) throw error;
    this.ngZone.run(() => {
      this.estabelecimento$.next(data);
    });
    this._estabelecimentoCache.clear();
  }

  async createEstabelecimento(data: Partial<Estabelecimento>) {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado.');

    const { data: created, error } = await this.supabase
      .rpc('create_estabelecimento_safe', { 
        p_data: { ...data, user_id: user.id } 
      })
      .maybeSingle<Estabelecimento>();

    if (error) throw error;
    this.ngZone.run(() => {
      this.estabelecimento$.next(created as Estabelecimento);
    });
    this._estabelecimentoCache.clear();
    return created;
  }

  // ─── Serviços ──────────────────────────────────────────────────────────────

  private async _fetchServicosRaw(estabelecimentoId: string): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .rpc('get_servicos_by_estab', { p_estab_id: estabelecimentoId });
    
    if (error) {
      console.error('[EstabelecimentoService] Erro ao buscar serviços via POST:', error);
      throw error;
    }
    return (data as Servico[]) ?? [];
  }

  async fetchServicos() {
    const estId = this.activeIdSubject.value;
    if (!estId) return;
    const data = await this._servicosCache.get(estId);
    this.ngZone.run(() => this.servicos$.next(data));
  }

  async addServico(s: Omit<Servico, 'id'>) {
    const estId = this.activeIdSubject.value;
    if (!estId) throw new Error('Contexto de estabelecimento não encontrado.');

    const { data, error } = await this.supabase
      .rpc('create_servico_safe', { 
        p_data: { ...s, estabelecimento_id: estId } 
      })
      .maybeSingle<Servico>();
    
    if (error) throw error;
    this.ngZone.run(() => {
      this.servicos$.next([...this.servicos$.value, data as Servico]);
    });
    this._servicosCache.clear();
    return data;
  }

  async updateServico(id: string, changes: Partial<Servico>) {
    const { data, error } = await this.supabase
      .rpc('update_servico_safe', { p_id: id, p_changes: changes })
      .maybeSingle<Servico>();
    if (error) throw error;
    this.ngZone.run(() => {
      this.servicos$.next(this.servicos$.value.map(s => (s.id === id ? (data as Servico) : s)));
    });
    this._servicosCache.clear();
  }

  async deleteServico(id: string) {
    const { error } = await this.supabase.rpc('delete_servico_safe', { p_id: id });
    if (error) throw error;
    this.ngZone.run(() => {
      this.servicos$.next(this.servicos$.value.filter(s => s.id !== id));
    });
    this._servicosCache.clear();
  }

  // ─── Horários ──────────────────────────────────────────────────────────────

  async fetchHorarios() {
    const estId = this.activeIdSubject.value;
    if (!estId) return;

    const { data, error } = await this.supabase
      .rpc('get_horarios_by_estab', { p_estab_id: estId });
    
    if (!error) {
      this.ngZone.run(() => {
        this.horarios$.next(data || []);
      });
    }
  }

  async updateHorario(id: string, changes: Partial<Horario>) {
    const { data, error } = await this.supabase
      .rpc('update_horario_safe', { p_id: id, p_changes: changes })
      .maybeSingle<Horario>();
    if (error) throw error;
    this.ngZone.run(() => {
      this.horarios$.next(this.horarios$.value.map(h => (h.id === id ? (data as Horario) : h)));
    });
  }
}
