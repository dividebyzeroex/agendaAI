import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Servico, Horario, Estabelecimento } from './estabelecimento.service';

export interface EstabelecimentoPublico extends Estabelecimento {
  slug?: string;
  descricao?: string;
  cor_primaria?: string;
}

export interface ProfissionalPublico {
  id: string;
  nome: string;
  especialidade?: string;
  bio?: string;
  foto_url?: string;
  cor_agenda?: string;
  disponibilidades?: any[];
  servicos?: string[];
}

@Injectable({ providedIn: 'root' })
export class EstabelecimentoPublicoService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);

  private lastSlug = '';
  data$ = new BehaviorSubject<{
    estabelecimento: EstabelecimentoPublico | null;
    servicos: Servico[];
    horarios: Horario[];
    profissionais: ProfissionalPublico[];
  }>({ estabelecimento: null, servicos: [], horarios: [], profissionais: [] });

  constructor() {
    this.subscribeRealtime();
  }

  private subscribeRealtime() {
    const tables = ['estabelecimento', 'servicos', 'horarios_funcionamento', 'profissionais', 'profissional_disponibilidades', 'profissional_servicos'];
    
    tables.forEach(table => {
      this.supabase
        .channel(`public_${table}_changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if (this.lastSlug) {
            this.ngZone.run(() => this.getBySlug(this.lastSlug));
          }
        })
        .subscribe();
    });
  }

  static slugify(nome: string): string {
    return nome.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  /** Gets all required data for a booking portal in a single logical flow. */
  async getBySlug(slug: string): Promise<{
    estabelecimento: EstabelecimentoPublico | null;
    servicos: Servico[];
    horarios: Horario[];
    profissionais: ProfissionalPublico[];
  }> {
    const fallback = { estabelecimento: null, servicos: [], horarios: [], profissionais: [] };

    try {
      // 1. Resolve Establishment by Slug or Id (if provided)
      const { data: estabs, error: eErr } = await this.supabase
        .from('estabelecimento')
        .select('id, nome, cidade, endereco, telefone') // removed slug
        .limit(20);
      
      if (eErr || !estabs || estabs.length === 0) return fallback;

      // Local slug match (most reliable if Supabase collation varies)
      const estab = estabs.find(e => EstabelecimentoPublicoService.slugify(e.nome) === slug) || estabs[0];
      if (!estab) return fallback;

      // 2. Fetch related data (assuming single-tenant or global tables for now)
      const [sRes, hRes, pRes] = await Promise.all([
        this.supabase.from('servicos').select('*').eq('ativo', true).order('created_at'),
        this.supabase.from('horarios_funcionamento').select('*').order('dia_semana'),
        this.supabase.from('profissionais').select('*').eq('ativo', true),
      ]);

      const profIds = (pRes.data || []).map((p: any) => p.id);
      let dResData: any[] = [];
      let svResData: any[] = [];

      // 3. Fetch relational data for THESE professionals only
      if (profIds.length > 0) {
        const [dRes, svRes] = await Promise.all([
          this.supabase.from('profissional_disponibilidades').select('*').in('profissional_id', profIds).eq('ativo', true),
          this.supabase.from('profissional_servicos').select('*').in('profissional_id', profIds),
        ]);
        dResData = dRes.data || [];
        svResData = svRes.data || [];
      }

      // 4. Map professionals
      const profissionais: ProfissionalPublico[] = (pRes.data || []).map((p: any) => ({
        ...p,
        disponibilidades: dResData.filter((d: any) => d.profissional_id === p.id),
        servicos: svResData.filter((s: any) => s.profissional_id === p.id).map((s: any) => s.servico_id)
      }));

      const data = {
        estabelecimento: estab,
        servicos: (sRes.data as Servico[]) ?? [],
        horarios: (hRes.data as Horario[]) ?? [],
        profissionais
      };

      this.lastSlug = slug;
      this.ngZone.run(() => this.data$.next(data));
      return data;
    } catch (err) {
      console.error('[PubService] Rebuild critical error:', err);
      return fallback;
    }
  }

  async getEventosDoDia(estabelecimentoId: string, date: string): Promise<string[]> {
    const { data } = await this.supabase
      .from('agenda_events')
      .select('start')
      .gte('start', `${date}T00:00:00`)
      .lte('start', `${date}T23:59:59`);
    return (data || []).map((e: any) => e.start.substring(11, 16));
  }

  async getEventosDoProfissionalNoDia(profId: string, date: string): Promise<string[]> {
    // Note: Column 'profissional_id' is missing in DB - falling back to global day events
    return this.getEventosDoDia('', date);
  }
}
