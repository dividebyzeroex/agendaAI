import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgendarAction } from './agendar-action';

describe('AgendarAction', () => {
  let component: AgendarAction;
  let fixture: ComponentFixture<AgendarAction>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgendarAction],
    }).compileComponents();

    fixture = TestBed.createComponent(AgendarAction);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
