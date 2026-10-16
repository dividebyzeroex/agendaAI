import {ConnectPayments} from '../connect-payments/connect-payments';
import {AppointmentMessaging} from '../appointment-messaging/appointment-messaging';
import { ChangeDetectorRef, Component, HostListener, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { QuickStart } from '../quick-start/quick-start';
import { Estabelecimento, EstabelecimentoService } from '../../services/estabelecimento.service';
import { SupabaseService } from '../../services/supabase.service';
export interface ActivationSummary {
  period_start: string; period_end: string; during_trial: boolean;
  services_ready: boolean; staff_ready: boolean; schedule_ready: boolean; first_booking: boolean;
  appointments: number; completed: number; public_bookings: number; clients: number; cash_records: number; first_completed?:boolean;first_received?:boolean|null;
}
@Component({selector:'app-activation-summary',standalone:true,imports:[CommonModule,RouterLink,QuickStart,AppointmentMessaging,ConnectPayments],templateUrl:'./activation-summary.html',styleUrls:['./activation-summary.css']})
export class ActivationSummaryComponent implements OnInit, OnDestroy {
  @Input() expanded = false;
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
  copied = false; helpBusy=false; helpNotice='';
  async requestHelp(){if(this.helpBusy||!this.tenant?.id)return;this.helpBusy=true;try{const body='Preciso de ajuda para ativar minha agenda. Próximo passo: '+(this.nextStep?.title||'Conferir primeiro atendimento e recebimento');const {data:existing,error:lookupError}=await this.db.from('support_messages').select('id').eq('estabelecimento_id',this.tenant.id).in('status',['aberto','em_analise']).eq('body',body).limit(1);if(lookupError)throw lookupError;if(!existing?.length){const {error}=await this.db.from('support_messages').insert({category:'duvida',body,page_path:'/admin/primeiros-passos',estabelecimento_id:this.tenant.id});if(error)throw error;}this.helpNotice='Pedido registrado. Acompanhe a resposta no botão de ajuda.';}catch{this.error='Não foi possível registrar o pedido. Tente novamente.';}finally{this.helpBusy=false;this.cdr.markForCheck();}}

  async shareLink(){if(!this.publicPath)return;try{await navigator.clipboard.writeText(window.location.origin+this.publicPath);this.copied=true;}catch{this.error='Não foi possível copiar. Abra o link de reservas para compartilhá-lo.';}this.cdr.markForCheck();}
  get steps() {
    const s = this.summary;
    return [
      {done:!!s?.services_ready,title:'Cadastre um serviço',detail:'Defina preço e duração do atendimento.',path:'/admin/configuracoes',params:{tab:'servicos'}},
      {done:!!s?.staff_ready,title:'Adicione um profissional',detail:'Ative quem vai atender seus clientes.',path:'/admin/profissionais',params:{}},
      {done:!!s?.schedule_ready,title:'Prepare os horários',detail:'Vincule o serviço ao profissional e defina disponibilidade compatível com o horário do negócio.',path:'/admin/profissionais',params:{}},
      {done:!!s?.first_booking,title:'Registre o primeiro agendamento',detail:'Use a agenda ou receba uma reserva pelo seu link.',path:'/admin/agenda',params:{}},
      {done:!!s?.first_completed,title:'Conclua o primeiro atendimento',detail:'Abra o atendimento na agenda e registre a conclusão.',path:'/admin/agenda',params:{}},
      {done:!!s?.first_received,title:'Registre o primeiro recebimento',detail:'Receba o atendimento concluído e confira a comanda no caixa.',path:'/admin/caixa',params:{}}
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
      const {data,error}=await this.db.rpc('tenant_operational_progress',{p_tenant:id});
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
