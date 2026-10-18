import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { createSWRCache } from '../utils/memoize';
import { parseSupabaseError } from '../core/helpers/error-parser';

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

export interface ConfigFidelidade {
  ativo: boolean;
  visitas_meta: number;
  desconto_percentual: number;
}

export interface Estabelecimento {
  id?: string;
  nome: string;
  role?: string;
  profile_id?: string;
  active?: boolean;
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
  months?: number;
  user_id?: string;
  config_fidelidade?: ConfigFidelidade;
}

@Injectable({ providedIn: 'root' })
export class EstabelecimentoService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);

  servicos$ = new BehaviorSubject<Servico[]>([]);
  horarios$ = new BehaviorSubject<Horario[]>([]);
  estabelecimento$ = new BehaviorSubject<Estabelecimento | null>(null);
  units$ = new BehaviorSubject<Estabelecimento[]>([]);

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
    void this.init().catch(() => this.isLoadingSubject.next(false));
    this.supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.resetContext();
        return;
      }
      if (event === 'SIGNED_IN')
        setTimeout(() => {
          void this.refreshCurrent().catch(() => this.isLoadingSubject.next(false));
        }, 0);
    });
  }

  private async init() {
    this.isLoadingSubject.next(true);
    await this.fetchEstabelecimento();
    await Promise.all([this.fetchServicos(), this.fetchHorarios()]);
    this.ngZone.run(() => {
      this.isLoadingSubject.next(false);
    });
  }

  // ─── Estabelecimento ───────────────────────────────────────────────────────

  private async _fetchEstabelecimentoRaw(userId: string): Promise<Estabelecimento | null> {
    const { data, error } = await this.supabase
      .rpc('get_estabelecimento_by_user', { p_user_id: userId })
      .limit(1)
      .maybeSingle<Estabelecimento>();

    if (error) {
      console.warn('[EstabelecimentoService] Erro ao buscar empresa via POST:', error);
      throw new Error('Não foi possível carregar o estabelecimento. Tente novamente.');
    }
    if (data) return data;
    const { data: ids, error: membershipError } = await this.supabase.rpc(
      'get_meus_estabelecimentos',
    );
    if (membershipError) throw membershipError;
    if (!ids?.length) return null;
    const { data: member, error: memberError } = await this.supabase
      .from('estabelecimento')
      .select(
        'id,nome,slug,segmento,telefone,cidade,logo_url,cor_primaria,onboarding_completo,trial_ends_at,plano,plano_expires_at',
      )
      .eq('id', ids[0])
      .maybeSingle();
    if (memberError) throw memberError;
    return member;
  }

  async fetchEstabelecimento() {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      this.resetContext();
      return;
    }
    let data = await this._estabelecimentoCache.get(user.id);
    const { data: units, error: unitsError } = await this.supabase.rpc('list_accessible_units');
    if (unitsError) throw new Error('Não foi possível conferir suas unidades. Tente novamente.');
    this.units$.next(units || []);
    if (units?.length) {
      let saved = '';
      try {
        saved = sessionStorage.getItem('agendaai-unit:' + user.id) || '';
      } catch {}
      const selected =
        units.find((u: any) => u.id === saved) ||
        units.find((u: any) => u.id === data?.id) ||
        units[0];
      const { data: context, error: contextError } = await this.supabase.rpc('unit_context', {
        p_tenant: selected.id,
      });
      if (contextError || !context) throw new Error('Não foi possível abrir esta unidade.');
      data = context;
    }
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    if (session?.user.id !== user.id) return;
    if (data) {
      this.ngZone.run(() => {
        this.estabelecimento$.next(data);
        this.activeIdSubject.next(data.id || null);
        console.log('[Tenancy Context] ID Ativo:', data.id);
      });
    } else this.resetContext();
  }

  async switchUnit(id: string) {
    if (!this.units$.value.some((u) => u.id === id)) throw Error('Unidade indisponível.');
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return;
    sessionStorage.setItem('agendaai-unit:' + user.id, id);
    window.location.assign('/admin');
  }
  private resetContext() {
    this.units$.next([]);
    this._estabelecimentoCache.clear();
    this._servicosCache.clear();
    this.estabelecimento$.next(null);
    this.activeIdSubject.next(null);
    this.servicos$.next([]);
    this.horarios$.next([]);
  }
  async refreshCurrent() {
    this._estabelecimentoCache.clear();
    this._servicosCache.clear();
    await this.fetchEstabelecimento();
    await Promise.all([this.fetchServicos(), this.fetchHorarios()]);
  }

  async updateEstabelecimento(changes: Partial<Estabelecimento>) {
    const current = this.estabelecimento$.value;
    if (!current?.id) return;
    const { data, error } = await this.supabase
      .rpc('update_estabelecimento_safe', { p_id: current.id, p_changes: changes })
      .maybeSingle<Estabelecimento>();
    if (error) throw new Error(parseSupabaseError(error));
    this.ngZone.run(() => {
      this.estabelecimento$.next(data);
    });
    this._estabelecimentoCache.clear();
  }

  async createEstabelecimento(data: Partial<Estabelecimento>) {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado.');

    const { data: created, error } = await this.supabase
      .rpc('create_estabelecimento_safe', {
        p_data: { ...data, user_id: user.id },
      })
      .maybeSingle<Estabelecimento>();

    if (error) throw new Error(parseSupabaseError(error));
    this.ngZone.run(() => {
      this.estabelecimento$.next(created as Estabelecimento);
      this.activeIdSubject.next(created?.id || null);
    });
    this._estabelecimentoCache.clear();
    return created;
  }

  // ─── Serviços ──────────────────────────────────────────────────────────────

  private async _fetchServicosRaw(estabelecimentoId: string): Promise<Servico[]> {
    const { data, error } = await this.supabase.rpc('get_servicos_by_estab', {
      p_estab_id: estabelecimentoId,
    });

    if (error) {
      console.error('[EstabelecimentoService] Erro ao buscar serviços via POST:', error);
      throw new Error(parseSupabaseError(error));
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
        p_data: { ...s, estabelecimento_id: estId },
      })
      .maybeSingle<Servico>();

    if (error) throw new Error(parseSupabaseError(error));
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
    if (error) throw new Error(parseSupabaseError(error));
    this.ngZone.run(() => {
      this.servicos$.next(this.servicos$.value.map((s) => (s.id === id ? (data as Servico) : s)));
    });
    this._servicosCache.clear();
  }

  async deleteServico(id: string) {
    const { error } = await this.supabase.rpc('delete_servico_safe', { p_id: id });
    if (error) throw new Error(parseSupabaseError(error));
    this.ngZone.run(() => {
      this.servicos$.next(this.servicos$.value.filter((s) => s.id !== id));
    });
    this._servicosCache.clear();
  }

  // ─── Horários ──────────────────────────────────────────────────────────────

  async fetchHorarios() {
    const estId = this.activeIdSubject.value;
    if (!estId) return;
    const { data, error } = await this.supabase.rpc('get_horarios_by_estab', { p_estab_id: estId });
    if (error) throw error;
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const existing = new Set((data ?? []).map((day: Horario) => day.dia_semana));
    const missing = days.flatMap((dia_nome, dia_semana) =>
      existing.has(dia_semana)
        ? []
        : [
            {
              estabelecimento_id: estId,
              dia_semana,
              dia_nome,
              abre: '09:00',
              fecha: '18:00',
              ativo: false,
            },
          ],
    );
    let rows = data ?? [];
    if (missing.length) {
      // The database unique key makes concurrent first loads idempotent.
      const { error: seedError } = await this.supabase
        .from('horarios_funcionamento')
        .upsert(missing, { onConflict: 'estabelecimento_id,dia_semana', ignoreDuplicates: true });
      if (seedError) throw seedError;
      const result = await this.supabase.rpc('get_horarios_by_estab', { p_estab_id: estId });
      if (result.error) throw result.error;
      rows = result.data ?? [];
    }
    if (this.activeIdSubject.value === estId) {
      this.ngZone.run(() =>
        this.horarios$.next([...rows].sort((a, b) => a.dia_semana - b.dia_semana)),
      );
    }
  }

  async updateHorario(id: string, changes: Partial<Horario>) {
    const { data, error } = await this.supabase
      .rpc('update_horario_safe', { p_id: id, p_changes: changes })
      .maybeSingle<Horario>();
    if (error) throw error;
    this.ngZone.run(() => {
      this.horarios$.next(this.horarios$.value.map((h) => (h.id === id ? (data as Horario) : h)));
    });
  }
}
