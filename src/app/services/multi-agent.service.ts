import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AgendaEventService } from './agenda-event.service';
import { ClienteService } from './cliente.service';

// --- Types (inspired by claude-sourcecode/Task.ts) ---

export type AgentType = 'recepcao' | 'marketing' | 'cobranca' | 'analytics';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'idle';

export interface AgentTask {
  id: string;
  agentType: AgentType;
  description: string;
  status: AgentStatus;
  result?: string;
  startTime: number;
  endTime?: number;
}

export interface AgentLog {
  id: string;
  agentName: string;
  agentType: AgentType;
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
}

export interface AgentDefinition {
  type: AgentType;
  name: string;
  icon: string;
  description: string;
  color: string;
  capabilities: string[];
  isRunning: boolean;
}

// --- Coordinator State (mirroring Claude's coordinator pattern) ---

interface CoordinatorState {
  activeAgents: Map<string, AgentTask>;
  logs: AgentLog[];
  totalTasksRun: number;
  coordinatorMode: boolean;
}

@Injectable({ providedIn: 'root' })
export class MultiAgentService {
  private agendaService = inject(AgendaEventService);
  private clienteService = inject(ClienteService);

  // Agent Registry (coordinator knows about all workers)
  readonly agentDefinitions: AgentDefinition[] = [
    {
      type: 'recepcao',
      name: 'Agente Recepção',
      icon: 'pi-whatsapp',
      description: 'Responde clientes, confirma agendamentos e envia lembretes 24/7.',
      color: '#34a853',
      capabilities: ['Envio de SMS', 'Confirmação de Agenda', 'Notificação de Cliente'],
      isRunning: true
    },
    {
      type: 'marketing',
      name: 'Agente Marketing',
      icon: 'pi-megaphone',
      description: 'Analisa horários ociosos e cria campanhas automáticas para lotar a agenda.',
      color: '#1a73e8',
      capabilities: ['Análise de Horários', 'Sugestão de Promoções', 'Relatório Semanal'],
      isRunning: true
    },
    {
      type: 'cobranca',
      name: 'Agente Cobrança',
      icon: 'pi-dollar',
      description: 'Monitora no-shows e envia alertas de cobrança ou reagendamento.',
      color: '#fbbc04',
      capabilities: ['Detecção de No-Show', 'Alerta de Cancelamento', 'Proposta de Reagendamento'],
      isRunning: false
    },
    {
      type: 'analytics',
      name: 'Agente Analytics',
      icon: 'pi-chart-bar',
      description: 'Compila relatórios de desempenho diário e projeta faturamento da semana.',
      color: '#a142f4',
      capabilities: ['Relatório Diário', 'Projeção de Faturamento', 'Análise de Tendências'],
      isRunning: true
    }
  ];

  // Reactive State
  private stateSubject = new BehaviorSubject<CoordinatorState>({
    activeAgents: new Map(),
    logs: [],
    totalTasksRun: 0,
    coordinatorMode: true
  });

  logs$ = new BehaviorSubject<AgentLog[]>([]);
  activeTasks$ = new BehaviorSubject<AgentTask[]>([]);

  constructor() {
    this.bootCoordinator();
  }

  // --- Coordinator Boot (like Claude's isCoordinatorMode bootstrap) ---
  private bootCoordinator() {
    this.log('analytics', 'Sistema Coordinator iniciado. Spawning workers registrados...', 'info');
    
    // Boot running agents
    const runningAgents = this.agentDefinitions.filter(a => a.isRunning);
    for (const agent of runningAgents) {
      setTimeout(() => this.spawnAgent(agent.type, `Tarefa de inicialização do ${agent.name}`), 500);
    }
  }

  // --- Spawn Agent (AgentTool equivalent) ---
  async spawnAgent(type: AgentType, description: string): Promise<string> {
    const taskId = this.generateTaskId(type);
    
    const task: AgentTask = {
      id: taskId,
      agentType: type,
      description,
      status: 'running',
      startTime: Date.now()
    };

    const state = this.stateSubject.value;
    state.activeAgents.set(taskId, task);
    this.activeTasks$.next(Array.from(state.activeAgents.values()));

    const agentDef = this.agentDefinitions.find(a => a.type === type)!;
    this.log(type, `Worker "${agentDef.name}" spawned. Executando: ${description}`, 'info');

    // Simulate async agent execution
    const delay = 1500 + Math.random() * 2000;
    await new Promise(r => setTimeout(r, delay));

    const result = await this.executeAgentTask(type);
    
    task.status = 'completed';
    task.result = result;
    task.endTime = Date.now();
    state.totalTasksRun++;

    this.activeTasks$.next(Array.from(state.activeAgents.values()));
    this.log(type, result, 'success');

    // Auto-clean completed tasks after 5s
    setTimeout(() => {
      state.activeAgents.delete(taskId);
      this.activeTasks$.next(Array.from(state.activeAgents.values()));
    }, 5000);

    return taskId;
  }

  // --- Worker Execution (each agent has specialized logic) ---
  private async executeAgentTask(type: AgentType): Promise<string> {
    const events = this.agendaService.getEvents();
    const clientes = this.clienteService.getClientes();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEvents = events.filter(e => e.start?.startsWith(todayStr));

    switch (type) {
      case 'recepcao': {
        const count = todayEvents.length;
        if (count > 0) return `✓ ${count} lembrete(s) enviado(s) para clientes com agendamentos hoje.`;
        return `✓ Agenda limpa hoje. Nenhum lembrete necessário.`;
      }

      case 'marketing': {
        const hour = new Date().getHours();
        const isIdle = hour < 9 || hour > 18 || todayEvents.length < 3;
        if (isIdle) return `✓ Horário ocioso detectado. Sugestão: Criar promoção de R$ 20 OFF para preencher a agenda.`;
        return `✓ Agenda bem preenchida. Nenhuma campanha necessária agora.`;
      }

      case 'cobranca': {
        const noShows = clientes.filter(c => (c.faltas || 0) > 2);
        if (noShows.length > 0) {
          const names = noShows.map(c => c.nome).join(', ');
          return `⚠ ${noShows.length} cliente(s) com histórico de faltas: ${names}. Contato recomendado.`;
        }
        return `✓ Nenhum no-show crítico detectado. Todos os clientes estão regulares.`;
      }

      case 'analytics': {
        const revenue = events.length * 120;
        return `✓ Relatório pronto. ${events.length} agendamentos • Faturamento projetado: R$ ${revenue.toLocaleString('pt-BR')},00.`;
      }
    }
  }

  // --- Manual Trigger (SendMessageTool equivalent) ---
  async sendMessageToAgent(type: AgentType, message: string): Promise<void> {
    await this.spawnAgent(type, message);
  }

  // --- Kill Agent (TaskStopTool equivalent) ---
  killAgent(taskId: string): void {
    const state = this.stateSubject.value;
    const task = state.activeAgents.get(taskId);
    if (task) {
      task.status = 'failed';
      const agentDef = this.agentDefinitions.find(a => a.type === task.agentType)!;
      this.log(task.agentType, `Worker "${agentDef?.name}" interrompido pelo Coordinator.`, 'warning');
      state.activeAgents.delete(taskId);
      this.activeTasks$.next(Array.from(state.activeAgents.values()));
    }
  }

  // --- Toggle Agent (enable/disable from UI) ---
  async toggleAgent(type: AgentType): Promise<void> {
    const agent = this.agentDefinitions.find(a => a.type === type)!;
    agent.isRunning = !agent.isRunning;

    if (agent.isRunning) {
      this.log(type, `Agent "${agent.name}" ativado pelo usuário.`, 'info');
      await this.spawnAgent(type, `Reinicialização manual do ${agent.name}`);
    } else {
      this.log(type, `Agent "${agent.name}" desativado pelo usuário.`, 'warning');
    }
  }

  // --- Run All Now (parallel fan-out like coordinator "Parallelism is your superpower") ---
  async runAllAgents(): Promise<void> {
    this.log('analytics', '🚀 Coordinator: Lançando todos os workers em paralelo...', 'info');
    const runningDefs = this.agentDefinitions.filter(a => a.isRunning);
    // All spawned simultaneously (parallel, not serialized)
    await Promise.all(runningDefs.map(a => this.spawnAgent(a.type, `Execução manual via Coordinator`)));
    this.log('analytics', `✓ Coordinator: ${runningDefs.length} workers completaram com sucesso.`, 'success');
  }

  getLogs(): AgentLog[] {
    return this.logs$.value;
  }

  clearLogs(): void {
    this.logs$.next([]);
  }

  // --- Helpers ---
  private log(agentType: AgentType, message: string, status: AgentLog['status']): void {
    const agentDef = this.agentDefinitions.find(a => a.type === agentType);
    const entry: AgentLog = {
      id: Date.now().toString() + Math.random(),
      agentName: agentDef?.name || agentType,
      agentType,
      message,
      status,
      timestamp: new Date()
    };
    this.logs$.next([entry, ...this.logs$.value].slice(0, 50)); // Keep last 50 logs
  }

  private generateTaskId(type: AgentType): string {
    const prefixes: Record<AgentType, string> = { recepcao: 'r', marketing: 'm', cobranca: 'c', analytics: 'a' };
    const prefix = prefixes[type];
    const rand = Math.random().toString(36).substr(2, 8);
    return `${prefix}-${rand}`;
  }
}
