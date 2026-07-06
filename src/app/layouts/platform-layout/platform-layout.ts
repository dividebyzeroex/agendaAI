import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-platform-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './platform-layout.html',
  styleUrls: ['./platform-layout.css']
})
export class PlatformLayout {
  private authService = inject(AuthService);
  private router = inject(Router);

  user$ = this.authService.profile$;

  async logout() {
    await this.authService.logout();
  }
}
