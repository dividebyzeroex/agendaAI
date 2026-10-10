import { Component,inject,OnInit,ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
@Component({selector:'app-platform-settings',standalone:true,imports:[CommonModule],templateUrl:'./platform-settings.html',styleUrls:['./platform-settings.css']})
export class PlatformSettings implements OnInit {
 private client=inject(SupabaseService).client;private cdr=inject(ChangeDetectorRef);
 status:any=null;billing:any=null;configuration:any=null;error='';loading=true;
 async ngOnInit(){await this.refresh();}
 async refresh(){this.loading=true;this.error='';try{
  const {data:{session}}=await this.client.auth.getSession();if(!session)throw new Error('Sua sessão expirou. Entre novamente.');
  const [commercial,billing,configuration]=await Promise.all([
   fetch('/api/commercial?action=status',{headers:{Authorization:`Bearer ${session.access_token}`}}),
   fetch('/api/billing?action=status'),
   this.client.from('commercial_agent_runs').select('summary,created_at').eq('agent','agent_configuration').order('created_at',{ascending:false}).limit(1)
  ]);
  if(!commercial.ok||!billing.ok||configuration.error)throw new Error('Não foi possível verificar as integrações.');
  this.status=await commercial.json();this.billing=await billing.json();this.configuration=configuration.data?.[0]?.summary||null;
 }catch(e){this.error=e instanceof Error?e.message:'Serviço indisponível';}finally{this.loading=false;this.cdr.markForCheck();}}
 get agents():Array<{title:string;enabled:boolean;cadence?:string}>{return Array.isArray(this.configuration?.agents)?this.configuration.agents:[];}
}
