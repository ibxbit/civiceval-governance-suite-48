import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, FormGroup } from "@angular/forms";
import { By } from "@angular/platform-browser";

import { ContentCreateFormComponent } from "./content-create-form.component";

describe("ContentCreateFormComponent", () => {
  let fixture: ComponentFixture<ContentCreateFormComponent>;
  let component: ContentCreateFormComponent;

  const buildForm = () =>
    new FormGroup({
      title: new FormControl(""),
      richText: new FormControl(""),
      fileIdsRaw: new FormControl(""),
    });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentCreateFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ContentCreateFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("form", buildForm());
    fixture.detectChanges();
  });

  it("creates the component", () => {
    expect(component).toBeTruthy();
  });

  it("emits create event on form submit", () => {
    const spy = jasmine.createSpy("create");
    component.create.subscribe(spy);

    const form = fixture.debugElement.query(By.css("form"));
    form.triggerEventHandler("ngSubmit", null);

    expect(spy).toHaveBeenCalled();
  });

  it("emits fileSelected event on file input change", () => {
    const spy = jasmine.createSpy("fileSelected");
    component.fileSelected.subscribe(spy);

    const fileInput = fixture.debugElement.query(
      By.css('input[type="file"]'),
    );
    const mockEvent = new Event("change");
    fileInput.nativeElement.dispatchEvent(mockEvent);

    expect(spy).toHaveBeenCalled();
  });

  it("displays uploaded file IDs when present", () => {
    fixture.componentRef.setInput("uploadedFileIds", [1, 2, 3]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("1, 2, 3");
  });

  it("does not display file IDs paragraph when none uploaded", () => {
    fixture.componentRef.setInput("uploadedFileIds", []);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain("Uploaded file IDs");
  });

  it("has a submit button", () => {
    const button = fixture.debugElement.query(
      By.css('button[type="submit"]'),
    );
    expect(button).toBeTruthy();
    expect(button.nativeElement.textContent).toContain("Create Draft");
  });
});
