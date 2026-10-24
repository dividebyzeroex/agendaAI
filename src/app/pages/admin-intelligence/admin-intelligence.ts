
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SupabaseService } from '../../services/supabase.service';

type Tier='agenda'|'gestao'|'growth';
interface Insight { id:string;title:string;detail:string;kind:'fact'|'opportunity';source:string;destination:string }
interface IntelligenceData {
  tier:Tier;plan:string;providerReady:boolean;
  metrics:{booked30:number;completed30:number;noShows30:number;cancelled30:number;upcoming7:number;paidSales30:number|null;received30:number|null;topService:string|null;sampleLimited:boolean};
  insights:Insight[];
  services:{id:string;title:string}[];
  professionals:{id:string;name:string}[];
  usage:{narrative:{used:number;limit:number};campaignDraft:{used:number;limit:number}};
  note:string;
}
interface MessageResult { title:string;message:string;mode:'rules'|'model';note?:string }
interface CampaignDraft {id:string;title:string;caption:string;link:string;mode:'rules'|'model';note:string}
@Component({
  selector:'app-admin-intelligence',standalone:true,imports:[CommonModule,FormsModule,RouterLink],
  templateUrl:'./admin-intelligence.html',styleUrl:'./admin-intelligence.css',
})
export class AdminIntelligence implements OnInit {
  private db=inject(SupabaseService).client;
  private establishment=inject(EstabelecimentoService);
  private cdr=inject(ChangeDetectorRef);
  private destroy=inject(DestroyRef);
  private generation=0;
  tenant='';
  loading=false;working=false;checkingSlots=false;error='';notice='';
  data:IntelligenceData|null=null;
  narrative:MessageResult|null=null;
  draft:CampaignDraft|null=null;
  selectedService='';selectedProfessional='';selectedDate=this.businessDate();
  slots:string[]=[];selectedSlot='';
  ngOnInit(){
    this.establishment.activeId$.pipe(takeUntilDestroyed(this.destroy)).subscribe(id=>{
      if(id===this.tenant)return;
      this.tenant=id||'';
      this.data=null;this.narrative=null;this.draft=null;this.slots=[];this.selectedSlot='';
      void this.load();
    });
  }
  private businessDate(){
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
  get todayDate(){return this.businessDate();}
  get maxDate(){
    const today=new Date(this.businessDate()+'T12:00:00Z');
    today.setUTCDate(today.getUTCDate()+14);
    return today.toISOString().slice(0,10);
  }
  get labelTier(){
    return this.data?.tier==='growth'?'Growth IA':this.data?.tier==='gestao'?'Gestão':'Agenda';
  }
  get growthEnabled(){return this.data?.tier==='growth';}
  get canNarrate(){return !!this.data && this.data.usage.narrative.used<this.data.usage.narrative.limit;}
  get canDraft(){return !!this.data && this.growthEnabled && this.data.usage.campaignDraft.used<this.data.usage.campaignDraft.limit;}
  get revenueLabel(){
    return this.data?.metrics.received30===null?'Disponível no plano Gestão':'Confirmados no caixa';
  }
  formatMoney(v:number|null){return v===null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);}
  formatSlot(v:string){return new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
  private async authHeaders(){
    const {data:{session}}=await this.db.auth.getSession();
    if(!session?.access_token)throw Error('Faça login novamente para consultar a inteligência.');
    return {Authorization:'Bearer '+session.access_token};
  }
  private async api<T>(action:string,body?:Record<string,unknown>,params?:Record<string,string>):Promise<T>{
    const qs=new URLSearchParams({action:'ai-'+action,...(params||{})});
    const response=await fetch('/api/billing?'+qs.toString(),{
      method:body?'POST':'GET',
      headers:{...(await this.authHeaders()),...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const result=await response.json().catch(()=>({error:'Resposta indisponível.'}));
    if(!response.ok)throw Error(result?.error||'Não foi possível concluir a operação.');
    return result as T;
  }
  async load(){
    if(!this.tenant)return;
    const gen=++this.generation;
    this.loading=true;this.error='';
    this.cdr.markForCheck();
    try{
      const data=await this.api<IntelligenceData>('summary',undefined,{tenantId:this.tenant});
      if(gen!==this.generation)return;
      this.data=data;
      if(!data.services.some(x=>x.id===this.selectedService))this.selectedService=data.services[0]?.id||'';
      if(!data.professionals.some(x=>x.id===this.selectedProfessional))this.selectedProfessional=data.professionals[0]?.id||'';
    }catch(e){if(gen===this.generation)this.error=e instanceof Error?e.message:'Não foi possível carregar.';}
    finally{if(gen===this.generation){this.loading=false;this.cdr.markForCheck();}}
  }
  async generateNarrative(){
    if(!this.canNarrate||this.working||!this.tenant)return;
    this.error='';this.notice='';this.working=true;
    try{
      this.narrative=await this.api<MessageResult>('narrative',{tenantId:this.tenant});
      await this.load();
    }catch(e){this.error=e instanceof Error?e.message:'Falha ao gerar leitura.';}
    finally{this.working=false;this.cdr.markForCheck();}
  }
  async checkSlots(){
    this.error='';this.notice='';this.slots=[];this.selectedSlot='';this.draft=null;
    if(!this.canDraft||!this.tenant||!this.selectedService||!this.selectedProfessional)return;
    this.checkingSlots=true;
    try{
      const result=await this.api<{slots:string[]}>('slots',undefined,{
        tenantId:this.tenant,date:this.selectedDate,serviceId:this.selectedService,professionalId:this.selectedProfessional
      });
      this.slots=result.slots||[];
      this.selectedSlot=this.slots[0]||'';
      if(!this.slots.length)this.notice='Não há vagas elegíveis para este serviço e profissional nesta data.';
    }catch(e){this.error=e instanceof Error?e.message:'Não foi possível verificar horários.';}
    finally{this.checkingSlots=false;this.cdr.markForCheck();}
  }
  async generateDraft(){
    if(!this.canDraft||!this.selectedSlot||this.working||!this.tenant)return;
    this.working=true;this.error='';this.notice='';
    try{
      this.draft=await this.api<CampaignDraft>('draft',{
        tenantId:this.tenant,date:this.selectedDate,serviceId:this.selectedService,
        professionalId:this.selectedProfessional,slotStart:this.selectedSlot
      });
      this.notice='Rascunho criado com link rastreável. Revise e publique manualmente quando estiver pronto.';
      await this.load();
      this.slots=[];this.selectedSlot='';
    }catch(e){this.error=e instanceof Error?e.message:'Não foi possível criar o rascunho.';}
    finally{this.working=false;this.cdr.markForCheck();}
  }
  async copyDraft(){
    if(!this.draft)return;
    try{await navigator.clipboard.writeText(this.draft.caption);this.notice='Legenda copiada.';}
    catch{this.notice='Não foi possível copiar automaticamente. Selecione o texto abaixo.';}
    this.cdr.markForCheck();
  }
}
