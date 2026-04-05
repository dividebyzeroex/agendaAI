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
      // 1. Resolve Establishment by Slug via RPC (POST)
      const { data: estab, error: eErr } = await this.supabase
        .rpc('get_public_estabelecimento_by_slug', { p_slug: slug })
        .maybeSingle<EstabelecimentoPublico>();
      
      if (eErr || !estab) return fallback;

      const estId = estab.id!;

      // 2. Fetch related data via RPCs (POST)
      const [sRes, hRes, pRes] = await Promise.all([
        this.supabase.rpc('get_servicos_by_estab', { p_estab_id: estId }),
        this.supabase.rpc('get_horarios_by_estab', { p_estab_id: estId }),
        this.supabase.rpc('get_profissionais_by_estab', { p_estab_id: estId }),
      ]);

      const profs = pRes.data as any[] || [];
      const profIds = profs.map(p => p.id);
      
      let dResData: any[] = [];
      let svResData: any[] = [];

      // 3. Relational data for professionals via RPCs (POST)
      if (profIds.length > 0) {
        const [dRes, svRes] = await Promise.all([
          this.supabase.rpc('get_profissional_disponibilidades_by_estab', { p_estab_id: estId }),
          this.supabase.rpc('get_profissional_servicos_by_estab', { p_estab_id: estId }),
        ]);
        dResData = dRes.data as any[] || [];
        svResData = svRes.data as any[] || [];
      }

      // 4. Map professionals
      const profissionais: ProfissionalPublico[] = profs.map((p: any) => ({
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
      .rpc('get_public_events_by_day', { 
        p_estab_id: estabelecimentoId, 
        p_date_start: `${date}T00:00:00`, 
        p_date_end: `${date}T23:59:59` 
      });
    return (data as any[] || []).map((e: any) => e.start.substring(11, 16));
  }

  async getEventosDoProfissionalNoDia(profId: string, date: string): Promise<string[]> {
    // Note: Column 'profissional_id' is missing in DB - falling back to global day events
    return this.getEventosDoDia('', date);
  }
}
