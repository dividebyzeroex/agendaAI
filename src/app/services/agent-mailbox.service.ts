/**
 * src/app/services/agent-mailbox.service.ts
 *
 * Sistema de mailbox para comunicação entre Multi-Agents —
 * Inspirado em utils/swarm/inProcessRunner.ts + utils/teammateMailbox.ts (Claude Source)
 *
 * Arquitetura:
 *   Leader → writeToMailbox('agente-recepcao', msg)
 *   Agente  → readMailbox('agente-recepcao')
 *   Agente  → writeToMailbox('leader', idleNotification)
 *
 * Persiste no Supabase para sobreviver a reloads, usa polling de 500ms.
 */

import { Injectable, OnDestroy } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  read: boolean;
  timestamp: string;
  color?: string;
}

export interface AgentIdleNotification {
  type: 'idle';
  from: string;
  reason: 'available' | 'interrupted' | 'failed';
  summary: string;
  completedTaskId?: string;
  completedStatus?: 'resolved' | 'blocked' | 'failed';
}

export interface AgentTask {
  id?: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed';
  agent_owner?: string;
  created_at?: string;
  completed_at?: string;
  estabelecimento_id?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentMailboxService implements OnDestroy {
  private supabase: SupabaseClient;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_MS = 500;

  // Observable de mensagens não lidas do leader
  private _unreadMessages$ = new BehaviorSubject<AgentMessage[]>([]);
  unreadMessages$ = this._unreadMessages$.asObservable();

  // Observable de tarefas ativas
  private _activeTasks$ = new BehaviorSubject<AgentTask[]>([]);
  activeTasks$ = this._activeTasks$.asObservable();

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey,
    );
  }

  /** Escreve uma mensagem na mailbox de um agente. */
  async writeToMailbox(to: string, message: Omit<AgentMessage, 'id' | 'read' | 'timestamp'>): Promise<void> {
    await this.supabase.from('agent_mailbox').insert({
      ...message,
      to,
      read: false,
      timestamp: new Date().toISOString(),
    });
  }

  /** Lê todas as mensagens (lidas e não lidas) de um agente. */
  async readMailbox(agentId: string): Promise<AgentMessage[]> {
    const { data } = await this.supabase
      .from('agent_mailbox')
      .select('*')
      .eq('to', agentId)
      .order('timestamp', { ascending: true });
    return (data as AgentMessage[]) ?? [];
  }

  /** Marca uma mensagem como lida. */
  async markRead(messageId: string): Promise<void> {
    await this.supabase
      .from('agent_mailbox')
      .update({ read: true })
      .eq('id', messageId);
  }

  /**
   * Envia uma notificação de IDLE do agente ao leader.
   * Padrão: Claude inProcessRunner — sendIdleNotification()
   */
  async sendIdleNotification(notification: AgentIdleNotification): Promise<void> {
    await this.writeToMailbox('leader', {
      from: notification.from,
      to: 'leader',
      text: JSON.stringify(notification),
      color: '#34a853',
    });
  }


  // ─── Task Claim System ────────────────────────────────────────────────────

  /**
   * Cria uma tarefa na fila de agentes.
   */
  async createTask(task: Omit<AgentTask, 'id' | 'created_at' | 'status'>): Promise<AgentTask | null> {
    const { data, error } = await this.supabase
      .from('agent_tasks')
      .insert({ ...task, status: 'pending', created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) { console.error('[Mailbox] createTask:', error.message); return null; }
    return data as AgentTask;
  }

  /**
   * Claim atômico — apenas UM agente consegue pegar a tarefa.
   * Baseado em: tryClaimNextTask() do Claude inProcessRunner.ts
   *
   * O UPDATE com .eq('status', 'pending') garante atomicidade:
   * se dois agentes tentam ao mesmo tempo, só um vence.
   */
  async claimTask(taskId: string, agentId: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from('agent_tasks')
      .update({ status: 'running', agent_owner: agentId })
      .eq('id', taskId)
      .eq('status', 'pending') // ← condição atômica
      .eq('agent_owner', null);

    return !error && (count ?? 0) > 0;
  }

  /**
   * Marca uma tarefa como concluída.
   */
  async completeTask(taskId: string, status: 'done' | 'failed' = 'done'): Promise<void> {
    await this.supabase
      .from('agent_tasks')
      .update({ status, completed_at: new Date().toISOString() })
      .eq('id', taskId);
  }

  /** Lista tarefas pendentes (sem dono). */
  async getPendingTasks(estabelecimentoId?: string): Promise<AgentTask[]> {
    let query = this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('status', 'pending')
      .is('agent_owner', null)
      .order('created_at', { ascending: true });

    if (estabelecimentoId) {
      query = query.eq('estabelecimento_id', estabelecimentoId);
    }

    const { data } = await query;
    return (data as AgentTask[]) ?? [];
  }

  /** Lista tarefas ativas (running) para exibir no painel. */
  async getRunningTasks(): Promise<AgentTask[]> {
    const { data } = await this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(10);
    return (data as AgentTask[]) ?? [];
  }

  /**
   * Inicia polling do mailbox do leader para atualizar o painel.
   * Chame em ngOnInit() do componente que exibe atividade dos agentes.
   */
  startPolling(agentId = 'leader'): void {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      const messages = await this.readMailbox(agentId);
      const unread = messages.filter(m => !m.read);
      this._unreadMessages$.next(unread);

      const running = await this.getRunningTasks();
      this._activeTasks$.next(running);
    }, this.POLL_MS);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}
