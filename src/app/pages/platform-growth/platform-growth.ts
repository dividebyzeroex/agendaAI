import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

interface Prospect { id: string; business_name: string; email: string | null; segment: string | null; source_url: string | null; status: string; consent_at: string | null; unsubscribed_at: string | null; created_at: string; last_contact_at: string | null; }
interface ResearchProspect { business_name: string; priority: string; observed_signal: string; pitch_draft: string; }
interface AgentStatus { enabled: boolean; ready: boolean; missing: string[]; dailyLimit: number; counts: { prospects: number; contacted: number; trial: number; won: number }; lastRuns: Array<{id:string;agent:string;status:string;created_at:string;summary:unknown}>; }

@Component({ selector: 'app-platform-growth', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './platform-growth.html', styleUrls: ['./platform-growth.css'] })
export class PlatformGrowth implements OnInit {
  private supabase = inject(SupabaseService);
  private cdr = inject(ChangeDetectorRef);
  prospects: Prospect[] = [];
  status: AgentStatus | null = null;
  loading = true; saving = false; running = false; error = ''; notice = ''; filter = '';
  form = { business_name: '', email: '', segment: '', source_url: '', consent: false };
  labels: Record<string, string> = {new:'Novo',qualified:'Qualificado',contacted:'Contatado',replied:'Respondeu',trial:'Em teste',won:'Cliente',lost:'Encerrado',unsubscribed:'Descadastrado'};
  get visibleProspects() { return this.prospects.filter(p => !this.filter || p.status === this.filter); }
  get researchProspects(): ResearchProspect[] {
    const found = new Map<string, ResearchProspect>();
    for (const run of this.status?.lastRuns || []) {
      if (run.agent !== 'research' || !run.summary || typeof run.summary !== 'object') continue;
      const entries = (run.summary as Record<string, unknown>)['prospects'];
      if (!Array.isArray(entries)) continue;
      for (const item of entries) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        if (typeof p['business_name'] !== 'string' || typeof p['observed_signal'] !== 'string' || typeof p['pitch_draft'] !== 'string') continue;
        const name = p['business_name'];
        if (!found.has(name)) found.set(name, {business_name: name, priority: typeof p['priority'] === 'string' ? p['priority'] : 'Não definida', observed_signal: p['observed_signal'], pitch_draft: p['pitch_draft']});
      }
    }
    return [...found.values()];
  }
  async ngOnInit() { await this.load(); }
  private async api(method: string, action: string, body?: unknown) {
    const {data: {session}} = await this.supabase.client.auth.getSession();
    if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch(`/api/commercial?action=${action}`, { method, headers: {'Authorization': `Bearer ${session.access_token}`, 'Content-Type':'application/json'}, ...(body ? {body: JSON.stringify({action, ...body as object})} : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  }
  async load() {
    this.loading = true; this.error = '';
    try {
      const [prospects, status] = await Promise.all([
        this.supabase.client.from('commercial_prospects').select('id,business_name,email,segment,source_url,status,consent_at,unsubscribed_at,created_at,last_contact_at').order('created_at', {ascending:false}).limit(100),
        this.api('GET','status')
      ]);
      if (prospects.error) throw prospects.error;
      this.prospects = prospects.data || []; this.status = status;
    } catch (e) { this.error = e instanceof Error ? e.message : 'Não foi possível carregar o painel comercial.'; }
    finally { this.loading = false; this.cdr.markForCheck(); }
  }
  async addProspect() {
    this.saving = true; this.error = ''; this.notice = '';
    try {
      await this.api('POST','prospect', {...this.form, business_name:this.form.business_name.trim(),email:this.form.email.trim()});
      this.form = {business_name:'',email:'',segment:'',source_url:'',consent:false};
      this.notice = 'Prospect cadastrado. O envio depende da elegibilidade e da configuração dos agentes.';
      await this.load();
    } catch (e) { this.error = e instanceof Error ? e.message : 'Não foi possível cadastrar o prospect.'; }
    finally { this.saving = false; this.cdr.markForCheck(); }
  }
  async runAgents() {
    this.running = true; this.error = ''; this.notice = '';
    try {
      const result = await this.api('POST','run', {});
      this.notice = `Execução: ${result.status || 'concluída'}. Enviados: ${result.sent ?? 0}. Na fila: ${result.queued ?? 0}. Ignorados: ${result.skipped ?? 0}.`;
      await this.load();
    } catch (e) { this.error = e instanceof Error ? e.message : 'Não foi possível executar os agentes.'; }
    finally { this.running = false; this.cdr.markForCheck(); }
  }
  async updateStage(prospect:Prospect,status:string) {
    this.error='';
    try { await this.api('POST','stage',{id:prospect.id,status}); await this.load(); }
    catch(e){this.error=e instanceof Error?e.message:'Não foi possível atualizar a oportunidade.';}
    finally{this.cdr.markForCheck();}
  }
  summarize(value: unknown): string {
    if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)['prospects'])) {
      const summary = value as Record<string, unknown>;
      return `${(summary['prospects'] as unknown[]).length} empresas pesquisadas. Contatadas: ${summary['contacted'] ?? 0}. Consulte as abordagens abaixo.`;
    }
    return typeof value === 'string' ? value : JSON.stringify(value ?? {});
  }
}
