import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PlatformService, PlatformMetrics, PlatformTenant } from '../../services/platform';

@Component({selector:'app-platform-dashboard',standalone:true,imports:[CommonModule,RouterLink],templateUrl:'./platform-dashboard.html',styleUrls:['./platform-dashboard.css']})
export class PlatformDashboard implements OnInit {
 private cdr=inject(ChangeDetectorRef); private platformService=inject(PlatformService);
 metrics:PlatformMetrics|null=null; isLoading=true; hasError=false; updatedAt:Date|null=null;
 overview:Awaited<ReturnType<PlatformService['getOwnerOverview']>>|null=null;
 months:Array<{label:string,value:number,height:number}>=[];
 billing:{ready:boolean;mode:string;reason?:string}|null=null;
 async ngOnInit(){await this.refresh();}
 async refresh(){
  this.isLoading=true;this.hasError=false;
  try{
   const [data,billing]=await Promise.all([this.platformService.getOwnerOverview(),fetch('/api/billing?action=status').then(async r=>{if(!r.ok) return null;return r.json();}).catch(()=>null)]);
   this.overview=data;this.metrics=data.metrics;this.billing=billing;this.updatedAt=new Date();this.buildMonths();
  }catch{this.hasError=true;}finally{this.isLoading=false;this.cdr.markForCheck();}
 }
 share(value:number){return this.metrics?.totalTenants?Math.min(100,value/this.metrics.totalTenants*100):0;}
 get funnel(){
  const p=this.overview?.prospects||[];
  return [{label:'Pesquisados',value:p.length,color:'slate'},{label:'Abordados',value:p.filter(x=>['contacted','replied','trial','won'].includes(x.status)).length,color:'blue'},{label:'Responderam',value:p.filter(x=>['replied','trial','won'].includes(x.status)).length,color:'violet'},{label:'Em teste',value:p.filter(x=>x.status==='trial').length,color:'amber'},{label:'Clientes',value:p.filter(x=>x.status==='won').length,color:'green'}];
 }
 get replyRate(){const f=this.funnel;return f[1].value?f[2].value/f[1].value*100:0;}
 get expiringTrials(){return (this.overview?.tenants||[]).filter(t=>t.status==='trial'&&this.daysLeft(t)>=0&&this.daysLeft(t)<=7).sort((a,b)=>this.daysLeft(a)-this.daysLeft(b));}
 daysLeft(t:PlatformTenant){return t.trial_ends_at?Math.ceil((new Date(t.trial_ends_at).getTime()-Date.now())/86400000):0;}
 get agents():Array<{title:string;enabled:boolean;cadence?:string}>{const a=this.overview?.configuration?.agents;return Array.isArray(a)?a:[];}
 get enabledAgents(){return this.agents.filter(a=>a.enabled).length;}
 prospectName(id:string){return this.overview?.prospects.find(p=>p.id===id)?.business_name||'Empresa';}
 runLabel(agent:string){return ({research:'Pesquisa comercial',research_and_funnel_review:'Pesquisa e funil',gmail_outreach:'Prospecção por e-mail',commercial_followup:'Relacionamento',finance_monitor:'Financeiro e clientes',billing_verification:'Verificação financeira',webhook_verification:'Verificação do webhook',owner_access:'Acesso administrativo',agent_configuration:'Configuração dos agentes'} as Record<string,string>)[agent]||'Operação comercial';}
 statusLabel(status:string){return ({completed:'Concluído',partial:'Parcial',blocked:'Requer atenção',pending_email_confirmation:'Aguardando confirmação',sent:'Enviado',failed:'Falhou',queued:'Na fila',suppressed:'Cancelado'} as Record<string,string>)[status]||status;}
 runSummary(summary:any){if(!summary||typeof summary!=='object')return 'Execução registrada.';if(typeof summary.sent==='number')return `${summary.sent} e-mail(s) enviados.`;if(typeof summary.count==='number')return `${summary.count} empresa(s) pesquisadas.`;if(summary.billing_status)return summary.billing_status.ready?'Stripe habilitado em produção.':'Verificação financeira requer atenção.';if(summary.metrics)return 'Cadastros e pagamentos conferidos.';if(summary.agents)return 'Rotinas de acompanhamento configuradas.';return 'Detalhes disponíveis no histórico comercial.';}
 private buildMonths(){
  const now=new Date();const formatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'});
  const key=(date:Date)=>{const p=formatter.formatToParts(date);return p.find(x=>x.type==='year')?.value+'-'+p.find(x=>x.type==='month')?.value;};
  const rows=Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,15,12);return {key:key(d),label:d.toLocaleDateString('pt-BR',{month:'short'}),value:0,height:0};});
  for(const p of this.overview?.payments||[]){if(p.status!=='paid'||p.currency!=='brl'||!p.paid_at)continue;const row=rows.find(x=>x.key===key(new Date(p.paid_at!)));if(row)row.value+=p.amount_cents/100;}
  const max=Math.max(1,...rows.map(r=>r.value));this.months=rows.map(r=>({...r,height:r.value/max*100}));
 }
}
