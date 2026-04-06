import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { EvaluationBuilderPageComponent } from "./evaluation-builder-page.component";
import { ApiService } from "../../services/api.service";

describe("EvaluationBuilderPageComponent", () => {
  let fixture: ComponentFixture<EvaluationBuilderPageComponent>;
  let component: EvaluationBuilderPageComponent;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["post"]);
    api.post.and.returnValue(of({ id: 1 }));

    await TestBed.configureTestingModule({
      imports: [EvaluationBuilderPageComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(EvaluationBuilderPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("adds/removes questions and submits", () => {
    (component as any).addQuestion();
    expect((component as any).questions.length).toBe(2);
    (component as any).removeQuestion(1);
    expect((component as any).questions.length).toBe(1);

    (component as any).form.patchValue({ title: "Form", description: "desc" });
    const first = (component as any).questions.at(0);
    first.patchValue({ prompt: "How was it?", type: "numeric_scale", required: true });
    (component as any).save();

    expect(api.post).toHaveBeenCalledWith("/evaluations/forms", jasmine.any(Object));
  });

  it("shows error when save fails", () => {
    api.post.and.returnValue(throwError(() => ({ status: 500 })));
    (component as any).form.patchValue({ title: "Form", description: "desc" });
    const first = (component as any).questions.at(0);
    first.patchValue({ prompt: "How was it?", type: "numeric_scale", required: true });
    (component as any).save();

    expect((component as any).error).toContain("Failed to create form");
  });
});
