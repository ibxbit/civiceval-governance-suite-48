import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { ContentCreateFormComponent } from "../components/content/content-create-form.component";
import { ContentEditorComponent } from "../components/content/content-editor.component";
import { ContentListComponent } from "../components/content/content-list.component";
import { ApiService } from "../services/api.service";

type ContentItem = {
  id: number;
  title: string;
  richText: string;
  status: "draft" | "published";
  versionNumber: number;
};

@Component({
  selector: "app-content-library-page",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ContentCreateFormComponent,
    ContentListComponent,
    ContentEditorComponent,
  ],
  template: `
    <section class="page">
      <h1>Content Library</h1>
      <p>
        Asset downloads are watermarked by backend '/cms/files/access/:token'.
        Expiring links default to 7 days.
      </p>

      <app-content-create-form
        [form]="form"
        [uploadedFileIds]="uploadedFileIds"
        (create)="create()"
        (fileSelected)="uploadFile($event)"
        (fileDropped)="uploadDroppedFile($event)"
      />

      <p *ngIf="isLoading">Loading content...</p>
      <p *ngIf="error" class="error">{{ error }}</p>
      <p *ngIf="!isLoading && items.length === 0">No content found.</p>

      <app-content-list
        [items]="items"
        (open)="open($event)"
        (publishToggle)="togglePublishById($event)"
      />

      <app-content-editor
        [selected]="selected"
        [versions]="versions"
        (richTextChanged)="onRichTextChange($event)"
        (save)="saveSelected()"
        (rollback)="rollback($event)"
      />

      <section class="panel">
        <h2>Secure Asset Link</h2>
        <p>
          Generate a temporary link for protected assets. Default expiry is 7 days.
        </p>
        <form [formGroup]="shareForm" (ngSubmit)="createAssetLink()">
          <input type="number" min="1" placeholder="File ID" formControlName="fileId" />
          <input
            type="number"
            min="1"
            max="7"
            placeholder="Expires in days"
            formControlName="expiresInDays"
          />
          <button type="submit">Generate Link</button>
        </form>
        <p class="error" *ngIf="shareError">{{ shareError }}</p>
        <p *ngIf="shareLink">Link: {{ shareLink }}</p>
      </section>
    </section>
  `,
})
export class ContentLibraryPageComponent {
  protected readonly form;
  protected items: ContentItem[] = [];
  protected selected: ContentItem | null = null;
  protected versions: Array<{ versionNumber: number; action: string }> = [];
  protected uploadedFileIds: number[] = [];
  protected isLoading = false;
  protected error = "";
  protected readonly shareForm;
  protected shareLink = "";
  protected shareError = "";

  public constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
  ) {
    this.form = this.fb.group({
      title: ["", [Validators.required]],
      richText: ["", [Validators.required]],
      fileIdsRaw: [""],
    });
    this.shareForm = this.fb.group({
      fileId: ["", [Validators.required]],
      expiresInDays: [7, [Validators.required, Validators.min(1), Validators.max(7)]],
    });
    this.load();
  }

  protected load(): void {
    this.isLoading = true;
    this.api
      .get<{ data: ContentItem[] }>("/cms/content", { page: 1, limit: 20 })
      .subscribe({
        next: (response: { data: ContentItem[] }) => {
          this.items = response.data;
          this.isLoading = false;
        },
        error: () => {
          this.error = "Failed to load content.";
          this.isLoading = false;
        },
      });
  }

  protected create(): void {
    this.error = "";
    if (this.form.invalid) {
      this.error = "Title and content are required.";
      return;
    }

    const fileIds = String(this.form.controls.fileIdsRaw.value ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    const mergedFileIds = Array.from(
      new Set([...fileIds, ...this.uploadedFileIds]),
    );

    this.api
      .post("/cms/content", {
        title: this.form.controls.title.value,
        richText: this.form.controls.richText.value,
        fileIds: mergedFileIds,
      })
      .subscribe({
        next: () => {
          this.form.reset({ title: "", richText: "", fileIdsRaw: "" });
          this.uploadedFileIds = [];
          this.load();
        },
        error: () => {
          this.error = "Failed to create content.";
        },
      });
  }

  protected uploadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    this.api.post<{ id: number }>("/cms/files/upload", formData).subscribe({
      next: (response: { id: number }) => {
        this.uploadedFileIds = [...this.uploadedFileIds, response.id];
      },
      error: () => {
        this.error = "File upload failed.";
      },
    });
  }

  protected uploadDroppedFile(file: File): void {
    const formData = new FormData();
    formData.append("file", file);
    this.api.post<{ id: number }>("/cms/files/upload", formData).subscribe({
      next: (response: { id: number }) => {
        this.uploadedFileIds = [...this.uploadedFileIds, response.id];
      },
      error: () => {
        this.error = "Dropped file upload failed.";
      },
    });
  }

  protected open(contentId: number): void {
    this.api.get<ContentItem>(`/cms/content/${contentId}`).subscribe({
      next: (content: ContentItem) => {
        this.selected = content;
        this.loadVersions(contentId);
      },
      error: () => {
        this.error = "Failed to open content.";
      },
    });
  }

  protected togglePublish(item: ContentItem): void {
    if (item.status === "draft") {
      this.api
        .post(`/cms/content/${item.id}/publish`)
        .subscribe({ next: () => this.load() });
      return;
    }

    this.api
      .post(`/cms/content/${item.id}/rollback`, {
        versionNumber: item.versionNumber,
      })
      .subscribe({
        next: () => this.load(),
      });
  }

  protected togglePublishById(contentId: number): void {
    const target = this.items.find((item) => item.id === contentId);
    if (!target) {
      return;
    }

    this.togglePublish(target);
  }

  protected onRichTextChange(event: Event): void {
    const input = event.target as HTMLTextAreaElement;
    if (this.selected) {
      this.selected = { ...this.selected, richText: input.value };
    }
  }

  protected saveSelected(): void {
    if (!this.selected) {
      return;
    }

    this.api
      .put(`/cms/content/${this.selected.id}`, {
        title: this.selected.title,
        richText: this.selected.richText,
      })
      .subscribe({
        next: () => {
          this.open(this.selected!.id);
          this.load();
        },
        error: () => {
          this.error = "Failed to save content.";
        },
      });
  }

  protected loadVersions(contentId: number): void {
    this.api
      .get<{
        versions: Array<{ versionNumber: number; action: string }>;
      }>(`/cms/content/${contentId}/versions`)
      .subscribe({
        next: (response: {
          versions: Array<{ versionNumber: number; action: string }>;
        }) => {
          this.versions = response.versions;
        },
        error: () => {
          this.error = "Failed to load versions.";
        },
      });
  }

  protected rollback(versionNumber: number): void {
    if (!this.selected) {
      return;
    }

    this.api
      .post(`/cms/content/${this.selected.id}/rollback`, { versionNumber })
      .subscribe({
        next: () => {
          this.open(this.selected!.id);
          this.load();
        },
        error: () => {
          this.error = "Rollback failed.";
        },
      });
  }

  protected createAssetLink(): void {
    this.shareError = "";
    this.shareLink = "";
    if (this.shareForm.invalid) {
      this.shareError = "Provide valid file id and expiry days (1-7).";
      return;
    }

    const fileId = Number(this.shareForm.controls.fileId.value);
    const expiresInDays = Number(this.shareForm.controls.expiresInDays.value);

    this.api
      .post<{ token: string }>(`/cms/files/${fileId}/link`, { expiresInDays })
      .subscribe({
        next: (response: { token: string }) => {
          this.shareLink = `${window.location.origin}/api/cms/files/access/${response.token}`;
        },
        error: () => {
          this.shareError = "Failed to generate secure link.";
        },
      });

    // TODO(frontend-boundary): Link revocation history and watermark evidence are audited server-side only.
  }
}
