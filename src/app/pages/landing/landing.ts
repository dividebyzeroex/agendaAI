import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class Landing {
  mouseY = 0;
  mouseX = 0;

  constructor(private router: Router) {}

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    
    // Setting CSS variables for the antigravity parallax effect
    document.documentElement.style.setProperty('--mouse-x', this.mouseX.toString());
    document.documentElement.style.setProperty('--mouse-y', this.mouseY.toString());
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToAgendar() {
    this.router.navigate(['/agendar']);
  }
}
