import { SupportWidget } from '../../components/support-widget/support-widget';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-platform-layout',
  standalone: true,
  imports: [SupportWidget,CommonModule, RouterModule],
  templateUrl: './platform-layout.html',
  styleUrls: ['./platform-layout.css']
})
export class PlatformLayout {
  private authService = inject(AuthService);
  private router = inject(Router);

  user$ = this.authService.profile$;

  isActive(path: string): boolean {
    return this.router.url.split(/[?#]/)[0].replace(/\/$/, '') === path;
  }

  async logout() {
    await this.authService.logout();
  }
}
