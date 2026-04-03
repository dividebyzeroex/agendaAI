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
      .from('estabelecimento')
      .select('id, onboarding_completo')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }) // newest first, safety
      .limit(1)
      .maybeSingle();

    if (!estab) {
      // First login: create a new estabelecimento for this user
      await this.supabase.from('estabelecimento').insert([{
        nome: 'Meu Negócio',
        user_id: user.id,
        onboarding_completo: false
      }]);
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

    await this.supabase
      .from('estabelecimento')
      .update({ onboarding_completo: true })
      .eq('user_id', user.id);

    this.showOnboarding$.next(false);

    // Refresh EstabelecimentoService data
    await this.estabService.fetchEstabelecimento();
    await this.estabService.fetchServicos();
    await this.estabService.fetchHorarios();
  }
}
