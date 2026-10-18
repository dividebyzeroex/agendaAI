import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { PlatformService, PlatformTenant } from '../../services/platform';

@Component({ selector:'app-partners-program', standalone:true,
 imports:[CommonModule,FormsModule], templateUrl:'./partners-program.html',styleUrls:['./partners-program.css'] })
export class PartnersProgram implements OnInit {
  private db=inject(SupabaseService).client;
  private est=inject(EstabelecimentoService);
  private platform=inject(PlatformService);
  private router=inject(Router);
  private cdr=inject(ChangeDetectorRef);
  get owner(){ return this.router.url.startsWith('/platform-admin'); }
  busy=false; loading=true; error=''; notice=''; data:any={};
  establishments:PlatformTenant[]=[];
  selectedTenant=''; invitationLink=''; referralLink='';
  receipt='';
  payoutFor='';
  get referralCount(){return this.owner?(this.data.commissions?.length||0):(this.data.total_indications||0);}
  get approvedValue(){return this.owner ? (this.data.commissions||[]).filter((c:any)=>c.status==='approved').reduce((sum:number,c:any)=>sum+(c.reward_cents||0),0):this.data.eligible_balance_cents||0;}
  get remainingFounders(){return Math.max(0,(this.data.pilot_capacity||3)-(this.data.founders||[]).filter((f:any)=>f.status==='pending'||f.status==='active').length);}
  founderTermsAccepted=false;
  referralTermsAccepted=false;
  private get tenantId(){ return this.est.estabelecimento$.value?.id || ''; }
  private async rpc(name:string,args:Record<string,unknown>={}) {
    const {data,error}=await this.db.rpc(name,args);
    if(error) throw Error(error.message || 'Não foi possível concluir.');
    return data;
  }
  async ngOnInit(){
    await this.refresh();
  }
  async refresh(){
    this.loading=true; this.error='';
    try {
      if(this.owner){
        [this.data,this.establishments]=await Promise.all([
          this.rpc('partner_owner_program_overview'),this.platform.getTenants()
        ]);
      }else{
        if(!this.tenantId) await this.est.fetchEstabelecimento();
        const id=this.tenantId;
        if(!id) throw Error('Conta do estabelecimento indisponível.');
        this.data=await this.rpc('partner_get_overview',{p_estabelecimento_id:id});
        this.referralLink=this.data.referral_code ? new URL('/?ref='+this.data.referral_code,window.location.origin).toString():'';
        const invite=new URLSearchParams(window.location.search).get('founder');
        if(invite && /^[0-9a-f-]{36}$/i.test(invite)) this.invitationLink=invite;
      }
    }catch(e){this.error=e instanceof Error?e.message:'Não foi possível carregar.';}
    finally{this.loading=false;this.cdr.markForCheck();}
  }
  private async action(fn:()=>Promise<void>){
    if(this.busy)return;
    this.busy=true;this.error='';this.notice='';
    try{await fn(); await this.refresh();}
    catch(e){this.error=e instanceof Error?e.message:'Falha ao concluir.';}
    finally{this.busy=false;this.cdr.markForCheck();}
  }
  issueInvite(){
    return this.action(async()=>{
      if(!this.selectedTenant)throw Error('Selecione um estabelecimento.');
      const d=await this.rpc('partner_owner_issue_founder_invite',{p_estabelecimento_id:this.selectedTenant});
      this.invitationLink=new URL('/admin/indicacoes?founder='+d.code,window.location.origin).toString();
      this.notice='Convite criado. Compartilhe somente com o responsável do estabelecimento.';
    });
  }
  acceptInvite(){ return this.action(async()=>{
    if(!this.invitationLink)throw Error('Código inválido.');
    if(!this.founderTermsAccepted)throw Error('Leia e aceite as condições da licença fundador.');
    const code=this.invitationLink.includes('founder=')?new URL(this.invitationLink).searchParams.get('founder'):this.invitationLink;
    await this.rpc('partner_accept_founder_invite',{p_code:code,p_accept_terms:this.founderTermsAccepted});
    this.notice='Licença de 365 dias ativada. Nenhuma cobrança automática foi criada.';
  });}
  enroll(){return this.action(async()=>{
    if(!this.referralTermsAccepted)throw Error('Leia e aceite as regras de indicação.');
    const d=await this.rpc('partner_ensure_referral_link',{p_estabelecimento_id:this.tenantId,p_accept_terms:this.referralTermsAccepted});
    this.referralLink=new URL('/?ref='+d.code,window.location.origin).toString();
    this.notice='Código de indicação criado.';
  });}
  approve(id:string){return this.action(async()=>{
    const ok=await this.rpc('partner_owner_approve_commission',{p_attribution_id:id});
    if(!ok) throw Error('Comissão ainda não elegível ou já processada.');
    this.notice='Comissão aprovada, aguardando pagamento manual.';
  });}
  recordPayout(id:string){return this.action(async()=>{
    const reference=this.receipt.trim();
    if(reference.length<6)throw Error('Informe a referência real do comprovante do Pix já realizado.');
    const ok=await this.rpc('partner_owner_record_payout',{p_attribution_id:id,p_pix_receipt:reference});
    if(!ok)throw Error('Comissão não aprovada ou já paga.');
    this.payoutFor='';this.receipt='';
    this.notice='Comprovante registrado. Nenhuma transferência foi realizada pelo sistema.';
  });}
  async copy(value:string){
    if(!value)return;
    try{await navigator.clipboard.writeText(value);this.notice='Copiado para a área de transferência.';}
    catch{this.error='Não foi possível copiar. Selecione o texto do link e copie manualmente.';}
    this.cdr.markForCheck();
  }
}
