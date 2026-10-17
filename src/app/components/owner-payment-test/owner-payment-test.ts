import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

interface PaymentTest {id:string;status:string;webhook_at:string|null;verified_at:string|null;created_at:string;payment_intent_id:string|null;}
@Component({selector:'app-owner-payment-test',standalone:true,imports:[CommonModule],templateUrl:'./owner-payment-test.html',styleUrls:['./owner-payment-test.css']})
export class OwnerPaymentTest implements OnInit {
 private supabase=inject(SupabaseService).client;
 private route=inject(ActivatedRoute);
 private cdr=inject(ChangeDetectorRef);
 tests:PaymentTest[]=[]; error=''; busy=false; confirming=false; ready=false;
 cancelled=false; requestId=crypto.randomUUID();
 sessionId:string|null=null;
 ngOnInit(){this.sessionId=this.route.snapshot.queryParamMap.get('owner_test_session');this.cancelled=this.route.snapshot.queryParamMap.has('owner_test_cancelled');void this.refresh();}
 private async request(action:string,body?:object){
  const {data:{session}}=await this.supabase.auth.getSession();
  if(!session)throw new Error('Sua sessão expirou. Entre novamente.');
  const response=await fetch('/api/billing?action='+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível consultar o pagamento.');return data;
 }
 async refresh(){this.busy=true;this.error='';try{
  const readiness=await fetch('/api/billing?action=status').then(r=>{if(!r.ok)throw new Error('Falha ao consultar prontidão.');return r.json();});
  this.ready=readiness.ready===true&&readiness.mode==='live';
  const result=await this.request('owner-test-status'+(this.sessionId?'&session_id='+encodeURIComponent(this.sessionId):''));this.tests=result.tests||[];
 }catch(e){this.error=e instanceof Error?e.message:'Falha ao consultar teste.';}finally{this.busy=false;this.cdr.markForCheck();}}
 async pay(){this.busy=true;this.error='';try{
  const result=await this.request('owner-test-checkout',{confirmed:true,requestId:this.requestId});
  if(typeof result.url!=='string'||!result.url.startsWith('https://checkout.stripe.com/'))throw new Error('Endereço de checkout inválido.');
  window.location.assign(result.url);
 }catch(e){this.error=e instanceof Error?e.message:'Falha ao abrir checkout.';this.busy=false;this.cdr.markForCheck();}}
 async check(test:PaymentTest){this.sessionId=test.id;await this.refresh();}
}
