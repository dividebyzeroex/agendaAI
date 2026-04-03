import { Injectable, inject } from '@angular/core';
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
        .select('*');
      
      if (eErr || !estabs || estabs.length === 0) return fallback;

      // Local slug match (most reliable if Supabase collation varies)
      const estab = estabs.find(e => EstabelecimentoPublicoService.slugify(e.nome) === slug) || estabs[0];
      if (!estab) return fallback;

      // 2. Fetch related data in parallel with error grouping
      const [sRes, hRes, pRes, dRes, svRes] = await Promise.all([
        this.supabase.from('servicos').select('*').eq('ativo', true).order('created_at'),
        this.supabase.from('horarios_funcionamento').select('*').order('dia_semana'),
        this.supabase.from('profissionais').select('*').eq('ativo', true),
        this.supabase.from('profissional_disponibilidades').select('*').eq('ativo', true),
        this.supabase.from('profissional_servicos').select('*'),
      ]);

      // 3. Map professionals with their relational data
      const profissionais: ProfissionalPublico[] = (pRes.data || []).map((p: any) => ({
        ...p,
        disponibilidades: (dRes.data || []).filter((d: any) => d.profissional_id === p.id),
        servicos: (svRes.data || []).filter((s: any) => s.profissional_id === p.id).map((s: any) => s.servico_id)
      }));

      return {
        estabelecimento: estab,
        servicos: (sRes.data as Servico[]) ?? [],
        horarios: (hRes.data as Horario[]) ?? [],
        profissionais
      };
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
    const { data } = await this.supabase
      .from('agenda_events')
      .select('start')
      .eq('profissional_id', profId)
      .gte('start', `${date}T00:00:00`)
      .lte('start', `${date}T23:59:59`);
    return (data || []).map((e: any) => e.start.substring(11, 16));
  }
}
