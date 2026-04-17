import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormControl, FormGroup } from "@angular/forms";

import { ActivityCreateFormComponent } from "./activity-create-form.component";

describe("ActivityCreateFormComponent", () => {
  let fixture: ComponentFixture<ActivityCreateFormComponent>;
  let component: ActivityCreateFormComponent;
  let testForm: FormGroup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityCreateFormComponent],
    }).compileComponents();

    testForm = new FormGroup({
      title: new FormControl(""),
      description: new FormControl(""),
      participationType: new FormControl("individual"),
      registrationStartAt: new FormControl(""),
      registrationEndAt: new FormControl(""),
      startsAt: new FormControl(""),
      endsAt: new FormControl(""),
    });

    fixture = TestBed.createComponent(ActivityCreateFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("form", testForm);
    fixture.componentRef.setInput("error", "");
    fixture.detectChanges();
  });

  it("Submit button triggers submitted event", () => {
    const submittedSpy = jasmine.createSpy("submittedSpy");
    component.submitted.subscribe(submittedSpy);

    const form = fixture.debugElement.query(By.css("form"));
    form.nativeElement.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    expect(submittedSpy).toHaveBeenCalled();
  });

  it("error message is shown when error input is set", () => {
    fixture.componentRef.setInput("error", "Title is required");
    fixture.detectChanges();

    const errorEl = fixture.debugElement.query(By.css("p.error"));
    expect(errorEl).toBeTruthy();
    expect(errorEl.nativeElement.textContent).toContain("Title is required");
  });

  it("error message is hidden when error is empty string", () => {
    fixture.componentRef.setInput("error", "");
    fixture.detectChanges();

    const errorEl = fixture.debugElement.query(By.css("p.error"));
    expect(errorEl).toBeNull();
  });
});
