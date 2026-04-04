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
  slug?: string;
  descricao?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  logo_url?: string;
  cor_primaria?: string;
  plano?: string;
  plano_expires_at?: string;
  trial_ends_at?: string;
  onboarding_completo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EstabelecimentoService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);

  servicos$        = new BehaviorSubject<Servico[]>([]);
  horarios$        = new BehaviorSubject<Horario[]>([]);
  estabelecimento$ = new BehaviorSubject<Estabelecimento | null>(null);

  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  isLoading$ = this.isLoadingSubject.asObservable();

  // ✅ SWR Cache — retorna instantâneo, refresca em background após TTL
  // Adaptado de memoizeWithTTLAsync do Claude Source Code (utils/memoize.ts)
  private _estabelecimentoCache = createSWRCache(
    (userId: string) => this._fetchEstabelecimentoRaw(userId),
    5 * 60 * 1000, // 5 minutos TTL
  );

  private _servicosCache = createSWRCache(
    () => this._fetchServicosRaw(),
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
    const { data } = await this.supabase
      .from('estabelecimento')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data as Estabelecimento | null;
  }

  async fetchEstabelecimento() {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    const data = await this._estabelecimentoCache.get(user.id);
    if (data) this.ngZone.run(() => this.estabelecimento$.next(data));
  }

  async updateEstabelecimento(changes: Partial<Estabelecimento>) {
    const current = this.estabelecimento$.value;
    if (!current?.id) return;
    const { data, error } = await this.supabase
      .from('estabelecimento')
      .update(changes)
      .eq('id', current.id)
      .select()
      .single();
    if (error) throw error;
    this.ngZone.run(() => {
      this.estabelecimento$.next(data);
    });
    this._estabelecimentoCache.clear(); // invalida cache após update
  }

  // ─── Serviços ──────────────────────────────────────────────────────────────

  private async _fetchServicosRaw(): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from('servicos')
      .select('*')
      .eq('ativo', true)
      .order('created_at');
    if (error) throw error;
    return (data as Servico[]) ?? [];
  }

  async fetchServicos() {
    const data = await this._servicosCache.get();
    this.ngZone.run(() => this.servicos$.next(data));
  }

  async addServico(s: Omit<Servico, 'id'>) {
    const { data, error } = await this.supabase.from('servicos').insert([s]).select().single();
    if (error) throw error;
    this.ngZone.run(() => {
      this.servicos$.next([...this.servicos$.value, data]);
    });
    this._servicosCache.clear();
    return data;
  }

  async updateServico(id: string, changes: Partial<Servico>) {
    const { data, error } = await this.supabase.from('servicos').update(changes).eq('id', id).select().single();
    if (error) throw error;
    this.ngZone.run(() => {
      this.servicos$.next(this.servicos$.value.map(s => (s.id === id ? data : s)));
    });
    this._servicosCache.clear();
  }

  async deleteServico(id: string) {
    await this.supabase.from('servicos').update({ ativo: false }).eq('id', id);
    this.ngZone.run(() => {
      this.servicos$.next(this.servicos$.value.filter(s => s.id !== id));
    });
    this._servicosCache.clear();
  }

  // ─── Horários ──────────────────────────────────────────────────────────────

  async fetchHorarios() {
    const { data, error } = await this.supabase
      .from('horarios_funcionamento')
      .select('*')
      .order('dia_semana');
    if (!error) {
      this.ngZone.run(() => {
        this.horarios$.next(data || []);
      });
    }
  }

  async updateHorario(id: string, changes: Partial<Horario>) {
    const { data, error } = await this.supabase
      .from('horarios_funcionamento')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    this.ngZone.run(() => {
      this.horarios$.next(this.horarios$.value.map(h => (h.id === id ? data : h)));
    });
  }
}
