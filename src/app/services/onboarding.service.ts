import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private supabase = inject(SupabaseService).client;
  private estabService = inject(EstabelecimentoService);

  /** true = deve exibir o modal de onboarding */
  showOnboarding$ = new BehaviorSubject<boolean>(false);

  async checkOnboarding(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    // Use maybeSingle() — safe when 0 or 1 rows, never throws PGRST116
    const { data: estab, error } = await this.supabase
      .rpc('check_onboarding_status', { p_user_id: user.id })
      .maybeSingle<{ id: string; onboarding_completo: boolean }>();

    if (!estab) {
      // First login: create via RPC (POST) to avoid columns in URL
      await this.supabase.rpc('create_estabelecimento_safe', {
        p_data: {
          nome: 'Meu Negócio',
          user_id: user.id,
          onboarding_completo: false
        }
      });
      this.showOnboarding$.next(true);
    } else if (!estab.onboarding_completo) {
      // Existing record but onboarding not done yet
      this.showOnboarding$.next(true);
    }
    // else: onboarding already done — keep showOnboarding$ as false
  }

  async completeOnboarding(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    // Conclui via RPC (POST) para evitar user_id na URL
    const { data: estab } = await this.supabase
      .rpc('check_onboarding_status', { p_user_id: user.id })
      .maybeSingle<{ id: string }>();

    if (estab?.id) {
      await this.supabase.rpc('update_estabelecimento_safe', { 
        p_id: estab.id, 
        p_changes: { onboarding_completo: true } 
      });
    }

    this.showOnboarding$.next(false);

    // Refresh EstabelecimentoService data
    await this.estabService.fetchEstabelecimento();
    await this.estabService.fetchServicos();
    await this.estabService.fetchHorarios();
  }
}
