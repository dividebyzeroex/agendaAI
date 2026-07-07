import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformService } from '../../services/platform';

@Component({
  selector: 'app-platform-social',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-social.html',
  styleUrls: ['./platform-social.css']
})
export class PlatformSocial implements OnInit {
  isZernioConnected = true;
  queue: any[] = [];
  
  stats = {
    scheduled: 0,
    publishedToday: 0,
    failed: 0
  };
  isLoading = true;
  hasError = false;

  private platformService = inject(PlatformService);

  async ngOnInit() {
    try {
      const data = await this.platformService.getSocialData();
      if (data) {
        this.isZernioConnected = data.isZernioConnected;
        this.stats = data.stats;
        this.queue = data.queue;
      }
    } catch (e) {
      this.hasError = true;
      this.isZernioConnected = false;
      console.error('Failed to load real social data.');
    } finally {
      this.isLoading = false;
    }
  }



  retryPost(id: string) {
    const post = this.queue.find(p => p.id === id);
    if (post) {
      post.status = 'scheduled';
      this.stats.failed = Math.max(0, this.stats.failed - 1);
      this.stats.scheduled++;
    }
  }
}
