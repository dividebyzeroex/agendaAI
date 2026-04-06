import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';
import { AuthService } from './auth.service';
import { SecurityService } from './security.service';

export interface Profissional {
  id?: string;
  estabelecimento_id?: string;
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
  role?: string;
  user_id?: string;
  ativo?: boolean;
  auth_type?: 'email' | 'otp' | 'senha';
  convite_enviado?: boolean;
  primeiro_acesso?: boolean;
  onboarding_concluido?: boolean;
  created_at?: string;
}

export interface ProfissionalDisponibilidade {
  id?: string;
  estabelecimento_id?: string;
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
  estabelecimento_id?: string;
  profissional_id?: string;
  servico_id: string;
  valor_proprio?: number;
  servicos?: { titulo: string; emoji: string; preco: number };
}

export interface ProfissionalCompleto extends Profissional {
  disponibilidades: ProfissionalDisponibilidade[];
  servicos: ProfissionalServico[];
}

const DIAS_SEMANA: Omit<ProfissionalDisponibilidade, 'profissional_id' | 'estabelecimento_id'>[] = [
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
  private ngZone = inject(NgZone);
  private estService = inject(EstabelecimentoService);
  private authService = inject(AuthService);
  private security = inject(SecurityService);

  profissionais$  = new BehaviorSubject<ProfissionalCompleto[]>([]);
  isLoading$      = new BehaviorSubject<boolean>(false);
  tabelasAusentes$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.estService.activeId$.subscribe(id => {
      if (id) this.fetchAll();
    });
    this.subscribeRealtime();
  }

  private subscribeRealtime() {
    this.supabase
      .channel('profissionais_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profissionais' }, () => {
        this.ngZone.run(() => this.fetchAll());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profissional_disponibilidades' }, () => {
        this.ngZone.run(() => this.fetchAll());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profissional_servicos' }, () => {
        this.ngZone.run(() => this.fetchAll());
      })
      .subscribe();
  }

  async fetchAll() {
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) return;

    this.isLoading$.next(true);
    this.tabelasAusentes$.next(false);

    try {
      // 1. Profissionais via RPC (POST)
      const { data: profs, error: profErr } = await this.supabase
        .rpc('get_profissionais_by_estab', { p_estab_id: estId });

      if (profErr) throw profErr;
      if (!profs) {
        this.ngZone.run(() => this.profissionais$.next([]));
        return;
      }

      // 2. Disponibilidades e Vínculos de Serviço via RPC (POST)
      const [dispsRes, pServsRes] = await Promise.all([
        this.supabase.rpc('get_profissional_disponibilidades_by_estab', { p_estab_id: estId }),
        this.supabase.rpc('get_profissional_servicos_by_estab', { p_estab_id: estId })
      ]);

      const disps = dispsRes.data as ProfissionalDisponibilidade[] || [];
      const pServs = pServsRes.data as ProfissionalServico[] || [];

      // 3. Catálogo de serviços para enriquecimento
      const servicoIds = [...new Set(pServs.map((s: any) => s.servico_id))];
      let catalogoMap: Record<string, any> = {};
      if (servicoIds.length > 0) {
        const { data: cat } = await this.supabase
          .rpc('get_servicos_by_ids', { p_ids: servicoIds });
        (cat as any[] || []).forEach((s: any) => (catalogoMap[s.id] = s));
      }

      // 4. Montar o Objeto Completo e Descriptografar PII
      const completo: ProfissionalCompleto[] = await Promise.all(profs.map(async (p: any) => {
        const decrypted = await this.security.decryptObject(p, ['nome', 'bio', 'email', 'telefone', 'instagram', 'linkedin']);
        return {
          ...decrypted,
          disponibilidades: disps.filter((d: any) => d.profissional_id === p.id),
          servicos: pServs
            .filter((s: any) => s.profissional_id === p.id)
            .map((s: any) => ({
              ...s,
              servicos: catalogoMap[s.servico_id] || null
            }))
        } as ProfissionalCompleto;
      }));

      this.ngZone.run(() => this.profissionais$.next(completo));

    } catch (err: any) {
      console.error('[ProfissionaisService] Falha na sincronização:', err.message);
      if (err.message?.includes('PGRST')) this.tabelasAusentes$.next(true);
    } finally {
      this.ngZone.run(() => this.isLoading$.next(false));
    }
  }

  async criarProfissional(form: Profissional): Promise<ProfissionalCompleto> {
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) throw new Error('Contexto de estabelecimento não encontrado.');

    const { ...payload } = form as any;
    delete payload.disponibilidades;
    delete payload.servicos;

    // Mantém o role se vier no form (para RBAC)
    const role = payload.role || 'barbeiro';

    // Criptografia Zero-Knowledge
    const encrypted = await this.security.encryptObject(payload, ['nome', 'bio', 'email', 'telefone', 'instagram', 'linkedin']);

    const { data: created, error } = await this.supabase
      .rpc('create_profissional_safe', { 
        p_data: { ...encrypted, estabelecimento_id: estId } 
      })
      .maybeSingle<Profissional>();
    if (error) throw error;

    const disps = DIAS_SEMANA.map(d => ({ ...d, profissional_id: created?.id, estabelecimento_id: estId }));
    await this.supabase.rpc('save_disponibilidades_safe', { 
      p_prof_id: created?.id, 
      p_rows: disps 
    });

    await this.fetchAll();
    return { ...created, disponibilidades: disps, servicos: [] } as ProfissionalCompleto;
  }

  async atualizarProfissional(id: string, form: Partial<Profissional>): Promise<void> {
    const { ...payload } = form as any;
    delete payload.disponibilidades;
    delete payload.servicos;

    // 1. Campos de Controle (Não PII) -> Persistência Direta e Absoluta
    const controlFields: any = {};
    if ('role' in payload) controlFields.role = payload.role;
    if ('ativo' in payload) controlFields.ativo = payload.ativo;
    if ('auth_type' in payload) controlFields.auth_type = payload.auth_type;
    if ('primeiro_acesso' in payload) controlFields.primeiro_acesso = payload.primeiro_acesso;
    if ('onboarding_concluido' in payload) controlFields.onboarding_concluido = payload.onboarding_concluido;

    if (Object.keys(controlFields).length > 0) {
      const { error: ctrlErr } = await this.supabase
        .from('profissionais')
        .update(controlFields)
        .eq('id', id);
      if (ctrlErr) throw ctrlErr;
    }

    // 2. Campos Sensíveis (PII) -> Criptografia + RPC Safe
    const piiFields = ['nome', 'bio', 'email', 'telefone', 'instagram', 'linkedin'];
    const hasPii = Object.keys(payload).some(k => piiFields.includes(k));

    if (hasPii) {
      const encrypted = await this.security.encryptObject(payload, piiFields);
      const { error } = await this.supabase
        .rpc('update_profissional_safe', { p_id: id, p_changes: encrypted });
      if (error) throw error;
    }

    await this.fetchAll();
    console.log('[ProfissionaisService] Profissional sincronizado com autoridade total.');
  }

  async salvarDisponibilidades(profissionalId: string, disps: ProfissionalDisponibilidade[]): Promise<void> {
    const estId = (this.estService as any)['activeIdSubject'].value;
    
    const rows = disps.map(d => ({
      profissional_id: profissionalId,
      estabelecimento_id: estId,
      dia_semana:  d.dia_semana,
      dia_nome:    d.dia_nome,
      ativo:       d.ativo,
      hora_inicio: d.ativo ? d.hora_inicio : null,
      hora_fim:    d.ativo ? d.hora_fim    : null,
      intervalo_inicio: d.ativo ? d.intervalo_inicio : null,
      intervalo_fim:    d.ativo ? d.intervalo_fim    : null,
    }));

    const { error } = await this.supabase.rpc('save_disponibilidades_safe', { 
      p_prof_id: profissionalId, 
      p_rows: rows 
    });
    if (error) throw error;
    await this.fetchAll();
  }

  async adicionarServico(profissionalId: string, servicoId: string, valorProprio?: number): Promise<void> {
    const estId = (this.estService as any)['activeIdSubject'].value;
    const { error } = await this.supabase.rpc('vincular_servico_profissional_safe', {
      p_data: {
        profissional_id: profissionalId,
        servico_id:  servicoId,
        estabelecimento_id: estId,
        valor_proprio: valorProprio || null,
      }
    });
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
    const { error } = await this.supabase.rpc('delete_profissional_safe', { p_id: id });
    if (error) throw error;
    await this.fetchAll();
  }

  async setAuthType(id: string, auth_type: 'email' | 'otp' | 'senha'): Promise<void> {
    await this.atualizarProfissional(id, { auth_type });
  }

  /**
   * Identifica a preferência de autenticação (PÚBLICO)
   * Nota: Como os emails são criptografados, esta RPC faz o match seguro.
   */
  async getAuthPreference(email: string): Promise<{ data: string | null, error: any }> {
    return await this.supabase.rpc('get_auth_type_by_email_public', { 
      p_email: email.trim().toLowerCase() 
    });
  }

  async finalizarOnboarding(id?: string): Promise<void> {
    const targetId = id || this.authService.userProfileValue?.id;
    if (!targetId) throw new Error('Identidade do profissional não localizada na sessão ativa.');
    
    // 1. Atualiza no Banco (Diretamente, sem passar pela RPC de PII)
    const { error } = await this.supabase
      .from('profissionais')
      .update({ onboarding_concluido: true, primeiro_acesso: false })
      .eq('id', targetId);
      
    if (error) {
      console.error('[ProfissionaisService] Falha grave ao persistir onboarding:', error);
      throw error;
    }
    
    // 2. Atualiza Localmente no AuthService (Garante que o Guard libere o acesso)
    this.authService.updateUserProfileLocal({ onboarding_concluido: true, primeiro_acesso: false });
    console.log('[ProfissionaisService] Onboarding persistido com sucesso absoluto.');
  }

  async atualizarSenha(password: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Sessão de segurança inválida ou expirada. Realize o login novamente.');
    
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async enviarConvite(pId: string): Promise<void> {
    const profs = this.profissionais$.value;
    const p = profs.find(x => x.id === pId);
    if (!p) return;

    try {
      if (p.auth_type === 'otp' && p.telefone) {
        await this.authService.signInWithPhone(p.telefone);
      } else if (p.email) {
        await this.authService.signInWithOtp(p.email);
      } else {
        throw new Error('Profissional sem E-mail ou Telefone configurado.');
      }

      // Marcar como convidado
      await this.atualizarProfissional(pId, { convite_enviado: true });
    } catch (err: any) {
      console.error('[ProfissionaisService] Erro ao enviar convite:', err.message);
      throw err;
    }
  }

  getDisponibilidadesPadrao(): ProfissionalDisponibilidade[] {
    return DIAS_SEMANA.map(d => ({ ...d } as any));
  }
}
