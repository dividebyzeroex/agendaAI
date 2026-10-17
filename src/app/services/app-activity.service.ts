import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';
@Injectable({providedIn:'root'})
export class AppActivityService {
 private db=inject(SupabaseService).client;private est=inject(EstabelecimentoService);private router=inject(Router);private last=new Map<string,number>();
 constructor(){this.est.estabelecimento$.subscribe(()=>void this.record());this.router.events.subscribe(e=>{if(e instanceof NavigationEnd)void this.record();});window.addEventListener('focus',()=>void this.record());document.addEventListener('pointerdown',()=>void this.record(),{passive:true});document.addEventListener('keydown',()=>void this.record(),{passive:true});}
 private async record(){const id=this.est.estabelecimento$.value?.id;const path=this.router.url.split(/[?#]/)[0];if(!id||!/^\/admin(?:\/|$)/.test(path)||document.visibilityState==='hidden'||Date.now()-(this.last.get(id)||0)<300000)return;this.last.set(id,Date.now());try{const {error}=await this.db.rpc('record_app_activity',{p_estabelecimento_id:id,p_page:path});if(error)this.last.delete(id);}catch{this.last.delete(id);}}
}
