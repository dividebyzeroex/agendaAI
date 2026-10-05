import { Component,inject,OnInit,ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
@Component({selector:'app-platform-settings',standalone:true,imports:[CommonModule],templateUrl:'./platform-settings.html',styleUrls:['./platform-settings.css']})
export class PlatformSettings implements OnInit {
  private client=inject(SupabaseService).client;private cdr=inject(ChangeDetectorRef);
  status:any=null;error='';loading=true;
  async ngOnInit(){try{const {data:{session}}=await this.client.auth.getSession();const r=await fetch('/api/commercial?action=status',{headers:{Authorization:`Bearer ${session?.access_token||''}`}});if(!r.ok)throw new Error('Não foi possível verificar as integrações.');this.status=await r.json();}catch(e){this.error=e instanceof Error?e.message:'Serviço indisponível';}finally{this.loading=false;this.cdr.markForCheck();}}
}
