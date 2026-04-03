import { Injectable, inject } from '@angular/core';
import { AgendaEventService } from './agenda-event.service';
import { BehaviorSubject, interval } from 'rxjs';

export interface SwarmLog {
  agentName: 'Marketing' | 'Recepção' | 'Cobrança';
  action: string;
  timestamp: Date;
  status: 'info' | 'success' | 'warning';
}

@Injectable({
  providedIn: 'root'
})
export class AgentSwarmService {
  private logsSubject = new BehaviorSubject<SwarmLog[]>([]);
  logs$ = this.logsSubject.asObservable();
  
  private agendaService = inject(AgendaEventService);
  
  constructor() {
    this.startSwarm();
  }

  getLogs() {
    return this.logsSubject.getValue();
  }

  addLog(log: Omit<SwarmLog, 'timestamp'>) {
    const currentLogs = this.getLogs();
    this.logsSubject.next([{ ...log, timestamp: new Date() }, ...currentLogs]);
  }

  private startSwarm() {
    this.addLog({
      agentName: 'Marketing',
      action: 'Vercel Cron inicializado. O Agente de Marketing consultará o Supabase todo dia de manhã.',
      status: 'info'
    });

    this.addLog({
      agentName: 'Recepção',
      action: 'Motor Assíncrono habilitado via Vercel Edge / Node Functions.',
      status: 'success'
    });
  }
}
