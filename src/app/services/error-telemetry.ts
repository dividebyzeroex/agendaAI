import { ErrorHandler, Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
@Injectable()
export class ErrorTelemetry implements ErrorHandler {
 private db=inject(SupabaseService).client;
 private count=0; private last=0;
 handleError(error:unknown){
  console.error(error);
  const now=Date.now();if(this.count>=20||now-this.last<5000)return;
  this.count++;this.last=now;
  void this.capture().catch(()=>{});
 }
 private async capture(){
  const {data:{session}}=await this.db.auth.getSession();if(!session)return;
  await this.db.from('app_error_events').insert({page_path:location.pathname.slice(0,300),error_code:'runtime_error'});
 }
}
