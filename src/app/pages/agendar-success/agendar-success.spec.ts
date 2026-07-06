import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgendarSuccess } from './agendar-success';

describe('AgendarSuccess', () => {
  let component: AgendarSuccess;
  let fixture: ComponentFixture<AgendarSuccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgendarSuccess],
    }).compileComponents();

    fixture = TestBed.createComponent(AgendarSuccess);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
