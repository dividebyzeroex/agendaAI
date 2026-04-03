import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiAgentService, AgentDefinition, AgentLog, AgentTask } from '../../services/multi-agent.service';

@Component({
  selector: 'app-admin-agents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-agents.html',
  styleUrls: ['./admin-agents.css']
})
export class AdminAgents implements OnInit {
  multiAgent = inject(MultiAgentService);

  logs: AgentLog[] = [];
  activeTasks: AgentTask[] = [];
  messageInput: Partial<Record<string, string>> = {};
  isRunningAll = false;
  agents_colorMap: Record<string, string> = {
    recepcao: '#34a853',
    marketing: '#1a73e8',
    cobranca: '#fbbc04',
    analytics: '#a142f4'
  };

  ngOnInit() {
    this.multiAgent.logs$.subscribe(logs => (this.logs = logs));
    this.multiAgent.activeTasks$.subscribe(tasks => (this.activeTasks = tasks));
  }

  get agents(): AgentDefinition[] {
    return this.multiAgent.agentDefinitions;
  }

  async toggleAgent(type: any) {
    await this.multiAgent.toggleAgent(type);
  }

  async sendMessage(type: any) {
    const msg = this.messageInput[type];
    if (msg?.trim()) {
      await this.multiAgent.sendMessageToAgent(type, msg);
      this.messageInput[type] = '';
    }
  }

  async runAll() {
    this.isRunningAll = true;
    await this.multiAgent.runAllAgents();
    this.isRunningAll = false;
  }

  killTask(taskId: string) {
    this.multiAgent.killAgent(taskId);
  }

  clearLogs() {
    this.multiAgent.clearLogs();
  }

  isAgentBusy(type: string): boolean {
    return this.activeTasks.some(t => t.agentType === type && t.status === 'running');
  }

  taskDuration(task: AgentTask): string {
    const ms = (task.endTime || Date.now()) - task.startTime;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  logIcon(status: AgentLog['status']): string {
    const map: Record<string, string> = { info: 'pi-info-circle', success: 'pi-check-circle', warning: 'pi-exclamation-triangle', error: 'pi-times-circle' };
    return map[status] || 'pi-circle';
  }
}
