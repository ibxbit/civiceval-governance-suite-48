import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FormControl, FormGroup } from "@angular/forms";

import { AnalyticsFilterFormComponent } from "./analytics-filter-form.component";

describe("AnalyticsFilterFormComponent", () => {
  let fixture: ComponentFixture<AnalyticsFilterFormComponent>;
  let component: AnalyticsFilterFormComponent;
  let testForm: FormGroup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsFilterFormComponent],
    }).compileComponents();

    testForm = new FormGroup({
      startDate: new FormControl(""),
      endDate: new FormControl(""),
    });

    fixture = TestBed.createComponent(AnalyticsFilterFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("form", testForm);
    fixture.detectChanges();
  });

  it("creates the component", () => {
    expect(component).toBeTruthy();
  });

  it("emits apply event on form submit", () => {
    const applySpy = jasmine.createSpy("applySpy");
    component.apply.subscribe(applySpy);

    const form = fixture.debugElement.query(By.css("form"));
    form.nativeElement.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    expect(applySpy).toHaveBeenCalled();
  });

  it("emits exportCsv event when Export CSV button is clicked", () => {
    const exportCsvSpy = jasmine.createSpy("exportCsvSpy");
    component.exportCsv.subscribe(exportCsvSpy);

    const exportButton = fixture.debugElement.queryAll(By.css("button")).find(
      (btn) => btn.nativeElement.textContent.trim() === "Export CSV",
    );

    expect(exportButton).toBeTruthy();
    exportButton!.nativeElement.click();
    fixture.detectChanges();

    expect(exportCsvSpy).toHaveBeenCalled();
  });

  it("renders startDate and endDate inputs", () => {
    const inputs = fixture.debugElement.queryAll(By.css("input[type='date']"));
    expect(inputs.length).toBe(2);

    const inputNames = inputs.map(
      (input) => input.nativeElement.getAttribute("formcontrolname"),
    );
    expect(inputNames).toContain("startDate");
    expect(inputNames).toContain("endDate");
  });

  it("renders Apply and Export CSV buttons", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));
    const buttonTexts = buttons.map((btn) => btn.nativeElement.textContent.trim());

    expect(buttonTexts).toContain("Apply");
    expect(buttonTexts).toContain("Export CSV");
  });
});
