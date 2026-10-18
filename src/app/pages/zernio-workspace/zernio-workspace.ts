import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

type SocialAccount = { id: string; platform: string; username: string; isActive: boolean };
@Component({
  selector: 'app-zernio-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zernio-workspace.html',
  styleUrls: ['./zernio-workspace.css'],
})
export class ZernioWorkspace implements OnInit {
  private db = inject(SupabaseService).client;
  private est = inject(EstabelecimentoService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  get isOwner() { return this.router.url.startsWith('/platform-admin'); }
  accounts: SocialAccount[] = [];
  selected = new Set<string>();
  platforms = [
    { value:'instagram',label:'Instagram' },{value:'facebook',label:'Facebook'},
    {value:'googlebusiness',label:'Google Business'},{value:'tiktok',label:'TikTok'},
    {value:'linkedin',label:'LinkedIn'},{value:'youtube',label:'YouTube'}
  ];
  platform = 'instagram';
  content = '';
  scheduledFor = '';
  loading = true;
  busy = false;
  error = '';
  notice = '';
  profileId = '';
  async ngOnInit() { await this.load(); }
  private async scope() {
    if (this.isOwner) return { scope: 'owner' };
    let id = this.est.estabelecimento$.value?.id;
    if (!id) {
      await this.est.fetchEstabelecimento();
      id = this.est.estabelecimento$.value?.id;
    }
    if (!id) throw Error('Abra a conta do seu estabelecimento para continuar.');
    return { scope: 'tenant', estabelecimentoId: id };
  }
  private async api(action: string, data: Record<string,unknown> = {}) {
    const { data: { session } } = await this.db.auth.getSession();
    if (!session) throw Error('Sua sessão expirou. Entre novamente.');
    const body = { ...(await this.scope()), ...data };
    const response = await fetch('/api/commercial?action=zernio-' + action, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Não foi possível comunicar com o Zernio.');
    return result;
  }
  async load() {
    this.loading = true;
    this.error = '';
    try {
      const data = await this.api('overview');
      this.profileId = data.profileId;
      this.accounts = data.accounts || [];
      this.selected = new Set(Array.from(this.selected).filter(id => this.accounts.some(a=>a.id===id)));
      if (new URLSearchParams(window.location.search).has('connected')) this.notice = 'Autorização recebida. Confira a lista de contas conectadas.';
    } catch(e) { this.error = e instanceof Error ? e.message : 'Falha de integração.'; }
    finally { this.loading = false; this.cdr.markForCheck(); }
  }
  toggleAccount(id: string, on: boolean) {
    if(on) this.selected.add(id); else this.selected.delete(id);
  }
  async connect() {
    this.busy = true; this.error = '';
    try {
      const data = await this.api('connect',{platform:this.platform});
      if (!data.authUrl) throw Error('URL de autorização não disponível.');
      window.location.assign(data.authUrl);
    } catch(e) { this.error = e instanceof Error ? e.message : 'Não foi possível conectar.'; this.busy = false; this.cdr.markForCheck(); }
  }
  async save(mode: 'draft' | 'schedule') {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.notice = '';
    try {
      const when = mode === 'schedule' ? new Date(this.scheduledFor) : null;
      if (when && !Number.isFinite(when.getTime())) throw Error('Escolha data e hora válidas.');
      const result = await this.api(mode, {
        accountIds: Array.from(this.selected),
        content: this.content,
        ...(when ? {scheduledFor: when.toISOString()} : {}),
        requestId: crypto.randomUUID()
      });
      this.notice = mode === 'draft' ? 'Rascunho salvo no Zernio.' : 'Publicação agendada no Zernio.';
      this.content = '';
      this.cdr.markForCheck();
      return result;
    } catch(e) { this.error = e instanceof Error ? e.message : 'Falha ao salvar publicação.'; }
    finally { this.busy = false; this.cdr.markForCheck(); }
  }
}
