import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SynchroComponent } from './synchro.component';

describe('SynchroComponent', () => {
  let component: SynchroComponent;
  let fixture: ComponentFixture<SynchroComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SynchroComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SynchroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
