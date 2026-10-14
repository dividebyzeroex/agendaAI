import { ChangeDetectorRef, Component, HostListener, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { QuickStart } from '../quick-start/quick-start';
import { Estabelecimento, EstabelecimentoService } from '../../services/estabelecimento.service';
import { SupabaseService } from '../../services/supabase.service';
export interface ActivationSummary {
  period_start: string; period_end: string; during_trial: boolean;
  services_ready: boolean; staff_ready: boolean; schedule_ready: boolean; first_booking: boolean;
  appointments: number; completed: number; public_bookings: number; clients: number; cash_records: number;
}
@Component({selector:'app-activation-summary',standalone:true,imports:[CommonModule,RouterLink,QuickStart],templateUrl:'./activation-summary.html',styleUrls:['./activation-summary.css']})
export class ActivationSummaryComponent implements OnInit, OnDestroy {
  private est = inject(EstabelecimentoService);
  private db = inject(SupabaseService).client;
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();
  private request = 0;
  private destroyed = false;
  tenant: Estabelecimento | null = null;
  summary: ActivationSummary | null = null;
  loading = false;
  error = '';
  copied = false;
  async shareLink(){if(!this.publicPath)return;try{await navigator.clipboard.writeText(window.location.origin+this.publicPath);this.copied=true;}catch{this.error='Não foi possível copiar. Abra o link de reservas para compartilhá-lo.';}this.cdr.markForCheck();}
  get steps() {
    const s = this.summary;
    return [
      {done:!!s?.services_ready,title:'Cadastre um serviço',detail:'Defina preço e duração do atendimento.',path:'/admin/configuracoes',params:{tab:'servicos'}},
      {done:!!s?.staff_ready,title:'Adicione um profissional',detail:'Ative quem vai atender seus clientes.',path:'/admin/profissionais',params:{}},
      {done:!!s?.schedule_ready,title:'Prepare os horários',detail:'Vincule o serviço ao profissional e defina disponibilidade compatível com o horário do negócio.',path:'/admin/profissionais',params:{}},
      {done:!!s?.first_booking,title:'Registre o primeiro agendamento',detail:'Use a agenda ou receba uma reserva pelo seu link.',path:'/admin/agenda',params:{}}
    ];
  }
  get completedSteps() { return this.steps.filter(s=>s.done).length; }
  get nextStep() { return this.steps.find(s=>!s.done); }
  get publicPath() { return this.tenant?.slug ? '/agendar/'+encodeURIComponent(this.tenant.slug) : ''; }
  ngOnInit() {
    this.sub.add(this.est.estabelecimento$.subscribe(tenant=>{
      this.tenant=tenant; this.summary=null; this.error='';
      if(tenant?.id) void this.refresh();
      else { ++this.request; this.loading=false; }
      this.cdr.markForCheck();
    }));
  }
  @HostListener('window:focus') onFocus() { if(!this.loading && this.tenant?.id) void this.refresh(); }
  async refresh() {
    const id=this.tenant?.id;
    if(!id) return;
    const request=++this.request; this.loading=true; this.error='';this.cdr.markForCheck();
    try {
      const {data,error}=await this.db.rpc('tenant_activation_summary',{p_estabelecimento_id:id});
      if(error || !data) throw error || new Error('Resumo indisponível');
      if(request===this.request && !this.destroyed) this.summary=data;
    } catch {
      if(request===this.request && !this.destroyed) {this.summary=null;this.error='Não foi possível conferir sua configuração e uso. Tente atualizar.';}
    } finally {
      if(request===this.request && !this.destroyed) {this.loading=false;this.cdr.markForCheck();}
    }
  }
  ngOnDestroy() { this.destroyed=true; ++this.request; this.sub.unsubscribe(); }
}
