import { Component, ChangeDetectorRef, DestroyRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { AppActivityService } from '../../services/app-activity.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationCenterComponent } from '../../components/notification-center/notification-center';
import { ToastContainerComponent } from '../../components/toast-container/toast-container.component';
import { SupportWidget } from '../../components/support-widget/support-widget';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NotificationCenterComponent,
    ToastContainerComponent,
    SupportWidget,
    CommandPaletteComponent,
  ],
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.css'],
})
export class AdminLayout {
  private cdr = inject(ChangeDetectorRef);
  private activity = inject(AppActivityService);
  private destroy = inject(DestroyRef);
  private router = inject(Router);
  auth = inject(AuthService);
  est = inject(EstabelecimentoService);
  notifications = inject(NotificationService);
  profile$ = this.auth.profile$;
  tenant$ = this.est.estabelecimento$;
  isSidebarOpen = false;
  isNotifOpen = false;
  isMobile = window.innerWidth <= 900;
  copied = false;
  copyError = '';
  readonly isDono = this.profile$.pipe(map((p) => p?.role === 'dono'));
  readonly canClients = this.profile$.pipe(
    map((p) => ['dono', 'secretaria', 'recepcionista'].includes(p?.role || '')),
  );
  readonly canCash = this.profile$.pipe(
    map((p) => ['dono', 'financeiro', 'recepcionista'].includes(p?.role || '')),
  );
  readonly isFinance = this.profile$.pipe(
    map((p) => ['dono', 'financeiro'].includes(p?.role || '')),
  );
  readonly isOperational = this.profile$.pipe(map((p) => p?.role === 'operacional'));
  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe(() => this.closeSidebar());
  }
  get managementActive() {
    return /\/admin\/(profissionais|produtos|comissoes|analytics|configuracoes|billing|primeiros-passos|portal)/.test(
      this.router.url,
    );
  }
  get publicPath() {
    const slug = this.est.estabelecimento$.value?.slug;
    return slug ? '/agendar/' + encodeURIComponent(slug) : '';
  }
  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }
  closeSidebar() {
    this.isSidebarOpen = false;
  }
  @HostListener('window:resize') resize() {
    this.isMobile = window.innerWidth <= 900;
    if (!this.isMobile) this.closeSidebar();
  }
  @HostListener('window:keydown.escape') escape() {
    this.closeSidebar();
    this.isNotifOpen = false;
  }
  async copyLink() {
    if (!this.publicPath) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + this.publicPath);
      this.copied = true;
      this.copyError = '';
    } catch {
      this.copyError = 'Abra seu link nas configurações para compartilhar.';
    }
    this.cdr.markForCheck();
  }
  logout() {
    void this.auth.logout();
  }
}
