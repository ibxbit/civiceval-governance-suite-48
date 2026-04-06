import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { EvaluationSubmitPageComponent } from "./evaluation-submit-page.component";
import { ApiService } from "../../services/api.service";

describe("EvaluationSubmitPageComponent", () => {
  let fixture: ComponentFixture<EvaluationSubmitPageComponent>;
  let component: EvaluationSubmitPageComponent;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["get", "post"]);
    api.get.and.returnValue(
      of({ questions: [{ id: 1, prompt: "Rate", type: "numeric_scale", required: true }] }),
    );
    api.post.and.returnValue(of({ receiptId: "EVR-TEST-1001" }));

    await TestBed.configureTestingModule({
      imports: [EvaluationSubmitPageComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(EvaluationSubmitPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("loads form and submits responses", () => {
    (component as any).formIdForm.controls.formId.setValue("1");
    (component as any).loadForm();
    expect((component as any).questions.length).toBe(1);

    (component as any).responseForm.controls.q_1.setValue("5");
    (component as any).submit();

    expect(api.post).toHaveBeenCalledWith("/evaluations/forms/1/submissions", jasmine.any(Object));
    expect((component as any).receiptId).toBe("EVR-TEST-1001");
  });

  it("shows errors for load and submit failures", () => {
    api.get.and.returnValue(throwError(() => ({ status: 404 })));
    (component as any).formIdForm.controls.formId.setValue("1");
    (component as any).loadForm();
    expect((component as any).error).toContain("Unable to load form");

    api.get.and.returnValue(
      of({ questions: [{ id: 1, prompt: "Rate", type: "numeric_scale", required: true }] }),
    );
    api.post.and.returnValue(throwError(() => ({ status: 400 })));
    (component as any).loadForm();
    (component as any).responseForm.controls.q_1.setValue("5");
    (component as any).submit();
    expect((component as any).error).toContain("Submission failed");
  });
});
