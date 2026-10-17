import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
export interface OwnerTenant {
 id:string;nome:string;slug:string;segmento:string|null;user_id:string|null;active:boolean;internal:boolean;created_at:string;trial_ends_at:string|null;plano_expires_at:string|null;plano:string;
 email:string|null;email_confirmed_at:string|null;last_sign_in_at:string|null;last_seen_at:string|null;subscription_status:string|null;stripe_livemode:boolean;
 completed_bookings?:number;received_bookings?:number;first_value_at?:string|null;
 services:number;professionals:number;clients:number;bookings:number;bookings_period:number;booking_ready:boolean;paid_evidence:boolean;received_cents:number;
}
export interface OwnerUser {id:string;email:string;is_owner:boolean;workspaces:number;email_confirmed_at:string|null;last_sign_in_at:string|null;last_seen_at:string|null;banned_until:string|null;created_at:string;}
export interface OwnerMessage {id:string;prospect_id:string;business_name:string;email:string;segment:string;subject:string;body:string;status:string;provider_id:string|null;sent_at:string|null;due_at:string;error:string|null;stage:string;objection:string|null;qualification_note:string|null;}
export interface OwnerSnapshot {
 checked_at:string;period_days:number;period_start:string;tenants:OwnerTenant[];users:OwnerUser[];messages:OwnerMessage[];
 totals:{workspaces:number;customers:number;internal:number;unowned:number;trials:number;subscribers:number;licensed:number;mrr_cents:number;received_cents:number;activated:number;ready:number;active_7d:number};
 acquisition:{prospects:number;contacted:number;sent:number;failed:number;queued:number;replied:number;linked:number;status_without_evidence:number;period_sent:number};
 segments:Array<{segment:string;prospects:number;contacted:number;replied:number;linked:number}>;
 revenue:Array<{month:string;amount_cents:number}>;
 payments:Array<{id:string;estabelecimento_id:string;amount_cents:number;currency:string;status:string;paid_at:string|null;created_at:string}>;
 health:{database:string;errors_period:number;support_open:number;oldest_queue_at:string|null;last_automation_at:string|null;telemetry_since:string|null;recent_errors:Array<{page_path:string;error_code:string;created_at:string}>};
 audit:Array<{agent:string;status:string;summary:Record<string,unknown>;created_at:string}>;
}
@Injectable({providedIn:'root'})
export class OwnerIntelligenceService {
 private db=inject(SupabaseService).client;
 async snapshot(days=30):Promise<OwnerSnapshot>{const {data,error}=await this.db.rpc('owner_business_snapshot',{p_days:days});if(error)throw error;return data as OwnerSnapshot;}
 async createOffer(body:unknown){const {data:{session}}=await this.db.auth.getSession();if(!session)throw new Error('Sessão expirada.');const r=await fetch('/api/billing?action=owner-offer',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Não foi possível criar o incentivo');return data;}
 async action(action:string,body:unknown){const {data:{session}}=await this.db.auth.getSession();if(!session)throw new Error('Sessão expirada.');const r=await fetch('/api/commercial?action='+action,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Operação indisponível');return data;}
}
