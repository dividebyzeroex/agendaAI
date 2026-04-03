import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface Profissional {
  id?: string;
  nome: string;
  cargo?: string;
  comissao_padrao?: number;
  data_contratacao?: string;
  especialidade?: string;
  bio?: string;
  foto_url?: string;
  telefone?: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
  cor_agenda?: string;
  valor_hora?: number;
  ativo?: boolean;
  created_at?: string;
}

export interface ProfissionalDisponibilidade {
  id?: string;
  profissional_id?: string;
  dia_semana: number;
  dia_nome: string;
  ativo: boolean;
  hora_inicio?: string;
  hora_fim?: string;
  intervalo_inicio?: string;
  intervalo_fim?: string;
}

export interface ProfissionalServico {
  id?: string;
  profissional_id?: string;
  servico_id: string;
  valor_proprio?: number;
  servicos?: { titulo: string; emoji: string; preco: number };
}

export interface ProfissionalCompleto extends Profissional {
  disponibilidades: ProfissionalDisponibilidade[];
  servicos: ProfissionalServico[];
}

const DIAS_SEMANA: Omit<ProfissionalDisponibilidade, 'profissional_id'>[] = [
  { dia_semana: 0, dia_nome: 'Domingo',       ativo: false },
  { dia_semana: 1, dia_nome: 'Segunda-feira', ativo: true,  hora_inicio: '09:00', hora_fim: '18:00' },
  { dia_semana: 2, dia_nome: 'Terça-feira',   ativo: true,  hora_inicio: '09:00', hora_fim: '18:00' },
  { dia_semana: 3, dia_nome: 'Quarta-feira',  ativo: true,  hora_inicio: '09:00', hora_fim: '18:00' },
  { dia_semana: 4, dia_nome: 'Quinta-feira',  ativo: true,  hora_inicio: '09:00', hora_fim: '18:00' },
  { dia_semana: 5, dia_nome: 'Sexta-feira',   ativo: true,  hora_inicio: '09:00', hora_fim: '18:00' },
  { dia_semana: 6, dia_nome: 'Sábado',        ativo: true,  hora_inicio: '09:00', hora_fim: '14:00' },
];

@Injectable({ providedIn: 'root' })
export class ProfissionaisService {
  private supabase = inject(SupabaseService).client;

  profissionais$  = new BehaviorSubject<ProfissionalCompleto[]>([]);
  isLoading$      = new BehaviorSubject<boolean>(false);
  /** true se as tabelas ainda não existem no banco */
  tabelasAusentes$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.fetchAll();
  }

  // ─── Fetch principal ───────────────────────────────────────────────────

  async fetchAll() {
    this.isLoading$.next(true);
    this.tabelasAusentes$.next(false);

    try {
      // 1ª tentativa: JOIN completo (funciona quando schema cache está atualizado)
      const { data, error } = await this.supabase
        .from('profissionais')
        .select('*, profissional_disponibilidades(*), profissional_servicos(*)')
        .order('nome');

      if (!error && data) {
        // Enriquece servicos com os dados do catálogo (query separada simples)
        const servicoIds = [...new Set(
          data.flatMap((p: any) => (p.profissional_servicos || []).map((s: any) => s.servico_id))
        )];

        let catalogoMap: Record<string, any> = {};
        if (servicoIds.length > 0) {
          const { data: cat } = await this.supabase
            .from('servicos')
            .select('id, titulo, emoji, preco')
            .in('id', servicoIds);
          (cat || []).forEach((s: any) => (catalogoMap[s.id] = s));
        }

        this.profissionais$.next(
          data.map((p: any) => ({
            ...p,
            disponibilidades: p.profissional_disponibilidades || [],
            servicos: (p.profissional_servicos || []).map((s: any) => ({
              ...s,
              servicos: catalogoMap[s.servico_id] || null,
            })),
          }))
        );
        return;
      }

      // 2ª tentativa: queries 100% separadas, sem nenhum JOIN
      console.warn('[ProfissionaisService] JOIN falhou, usando queries separadas:', error?.message);
      await this.fetchSeparado();

    } catch (err: any) {
      // Tabelas provavelmente não existem — migração SQL pendente
      const msg = err?.message || '';
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('PGRST')) {
        this.tabelasAusentes$.next(true);
      }
      this.profissionais$.next([]);
    } finally {
      this.isLoading$.next(false);
    }
  }

  /**
   * Fallback puro: 3 queries independentes sem nenhum JOIN.
   * Funciona mesmo quando o schema cache não conhece as FK.
   */
  private async fetchSeparado() {
    // Profissionais
    const { data: profs, error: profErr } = await this.supabase
      .from('profissionais').select('*').order('nome');

    if (profErr) {
      // Tabela não existe
      this.tabelasAusentes$.next(true);
      this.profissionais$.next([]);
      return;
    }

    // Disponibilidades
    const { data: disps } = await this.supabase
      .from('profissional_disponibilidades').select('*');

    // Profissional_servicos (sem join com servicos)
    const { data: pServs } = await this.supabase
      .from('profissional_servicos').select('*');

    // Enriquece com dados do catálogo de serviços
    const servicoIds = [...new Set((pServs || []).map((s: any) => s.servico_id))];
    let catalogoMap: Record<string, any> = {};
    if (servicoIds.length > 0) {
      const { data: cat } = await this.supabase
        .from('servicos').select('id, titulo, emoji, preco').in('id', servicoIds);
      (cat || []).forEach((s: any) => (catalogoMap[s.id] = s));
    }

    this.profissionais$.next(
      (profs || []).map((p: any) => ({
        ...p,
        disponibilidades: (disps || []).filter((d: any) => d.profissional_id === p.id),
        servicos: (pServs || [])
          .filter((s: any) => s.profissional_id === p.id)
          .map((s: any) => ({ ...s, servicos: catalogoMap[s.servico_id] || null })),
      }))
    );
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────

  async criarProfissional(form: Profissional): Promise<ProfissionalCompleto> {
    // Remove campos virtuais que não existem na tabela 'profissionais'
    const { ...payload } = form as any;
    delete payload.disponibilidades;
    delete payload.servicos;

    const { data, error } = await this.supabase
      .from('profissionais')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;

    const disps = DIAS_SEMANA.map(d => ({ ...d, profissional_id: data.id }));
    const { error: dispErr } = await this.supabase
      .from('profissional_disponibilidades')
      .insert(disps);
    if (dispErr) console.warn('[ProfissionaisService] Erro ao criar disponibilidades:', dispErr.message);

    await this.fetchAll();
    return { ...data, disponibilidades: disps, servicos: [] };
  }

  async atualizarProfissional(id: string, form: Partial<Profissional>): Promise<void> {
    // Remove campos virtuais para evitar erro de 'coluna não encontrada' no Supabase
    const { ...payload } = form as any;
    delete payload.disponibilidades;
    delete payload.servicos;

    const { error } = await this.supabase
      .from('profissionais').update(payload).eq('id', id);
    if (error) throw error;
    await this.fetchAll();
  }

  async salvarDisponibilidades(profissionalId: string, disps: ProfissionalDisponibilidade[]): Promise<void> {
    await this.supabase
      .from('profissional_disponibilidades')
      .delete().eq('profissional_id', profissionalId);

    const rows = disps.map(d => ({
      profissional_id: profissionalId,
      dia_semana:  d.dia_semana,
      dia_nome:    d.dia_nome,
      ativo:       d.ativo,
      hora_inicio: d.ativo ? d.hora_inicio : null,
      hora_fim:    d.ativo ? d.hora_fim    : null,
      intervalo_inicio: d.ativo ? d.intervalo_inicio : null,
      intervalo_fim:    d.ativo ? d.intervalo_fim    : null,
    }));

    const { error } = await this.supabase
      .from('profissional_disponibilidades').insert(rows);
    if (error) throw error;
    await this.fetchAll();
  }

  async adicionarServico(profissionalId: string, servicoId: string, valorProprio?: number): Promise<void> {
    const { error } = await this.supabase.from('profissional_servicos').upsert([{
      profissional_id: profissionalId,
      servico_id:  servicoId,
      valor_proprio: valorProprio || null,
    }], { onConflict: 'profissional_id,servico_id' });
    if (error) throw error;
    await this.fetchAll();
  }

  async removerServico(id: string): Promise<void> {
    await this.supabase.from('profissional_servicos').delete().eq('id', id);
    await this.fetchAll();
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    await this.atualizarProfissional(id, { ativo });
  }

  async deletarProfissional(id: string): Promise<void> {
    const { error } = await this.supabase.from('profissionais').delete().eq('id', id);
    if (error) throw error;
    await this.fetchAll();
  }

  getDisponibilidadesPadrao(): ProfissionalDisponibilidade[] {
    return DIAS_SEMANA.map(d => ({ ...d }));
  }
}
