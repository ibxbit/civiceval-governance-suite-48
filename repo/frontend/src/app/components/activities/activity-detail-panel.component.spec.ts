import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { ActivityDetailPanelComponent } from "./activity-detail-panel.component";

describe("ActivityDetailPanelComponent", () => {
  let fixture: ComponentFixture<ActivityDetailPanelComponent>;
  let component: ActivityDetailPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityDetailPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityDetailPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("activity", {
      id: 12,
      title: "Town Hall",
      description: "desc",
    });
    fixture.componentRef.setInput("canCheckin", true);
    fixture.detectChanges();
  });

  it("validates manual check-in code before submit", () => {
    const submitSpy = jasmine.createSpy("submitSpy");
    component.checkinSubmitted.subscribe(submitSpy);

    const input = fixture.debugElement.query(
      By.css("#checkin-code-input"),
    ).nativeElement as HTMLInputElement;
    input.value = "bad";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const submitButton = fixture.debugElement
      .queryAll(By.css("button"))
      .find((button) =>
        String(button.nativeElement.textContent).includes("Submit Check-in"),
      );

    submitButton?.nativeElement.click();
    fixture.detectChanges();

    expect(submitSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("Enter a valid 8-character code");
  });

  it("emits manual check-in payload for valid code", () => {
    const submitSpy = jasmine.createSpy("submitSpy");
    component.checkinSubmitted.subscribe(submitSpy);

    const input = fixture.debugElement.query(
      By.css("#checkin-code-input"),
    ).nativeElement as HTMLInputElement;
    input.value = "ab12cd34";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const submitButton = fixture.debugElement
      .queryAll(By.css("button"))
      .find((button) =>
        String(button.nativeElement.textContent).includes("Submit Check-in"),
      );

    submitButton?.nativeElement.click();

    expect(submitSpy).toHaveBeenCalledWith({
      activityId: 12,
      code: "AB12CD34",
    });
  });
});
