import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";

import { ApiService } from "./api.service";

describe("ApiService", () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService],
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("get sends GET request to /api/path", () => {
    service.get("/items").subscribe();

    const req = httpMock.expectOne("/api/items");
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("post sends POST request to /api/path with body", () => {
    const body = { name: "test" };
    service.post("/items", body).subscribe();

    const req = httpMock.expectOne("/api/items");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it("put sends PUT request to /api/path with body", () => {
    const body = { name: "updated" };
    service.put("/items/1", body).subscribe();

    const req = httpMock.expectOne("/api/items/1");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it("delete sends DELETE request to /api/path", () => {
    service.delete("/items/1").subscribe();

    const req = httpMock.expectOne("/api/items/1");
    expect(req.request.method).toBe("DELETE");
    req.flush({});
  });

  it("request includes x-nonce header", () => {
    service.get("/items").subscribe();

    const req = httpMock.expectOne("/api/items");
    expect(req.request.headers.has("x-nonce")).toBeTrue();
    expect(req.request.headers.get("x-nonce")).toBeTruthy();
    req.flush({});
  });

  it("request includes x-timestamp header", () => {
    service.get("/items").subscribe();

    const req = httpMock.expectOne("/api/items");
    expect(req.request.headers.has("x-timestamp")).toBeTrue();
    expect(Number(req.request.headers.get("x-timestamp"))).toBeGreaterThan(0);
    req.flush({});
  });

  it("request includes Authorization header when token exists in localStorage", () => {
    localStorage.setItem("auth.token", "my-bearer-token");

    service.get("/items").subscribe();

    const req = httpMock.expectOne("/api/items");
    expect(req.request.headers.get("Authorization")).toBe(
      "Bearer my-bearer-token",
    );
    req.flush({});
  });

  it("request does NOT include Authorization header when no token in localStorage", () => {
    service.get("/items").subscribe();

    const req = httpMock.expectOne("/api/items");
    expect(req.request.headers.has("Authorization")).toBeFalse();
    req.flush({});
  });

  it("query params are built correctly, filtering null/undefined/empty values", () => {
    service
      .get("/items", {
        search: "hello",
        page: 1,
        empty: "",
        nothing: null,
        notDefined: undefined,
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === "/api/items");
    expect(req.request.params.get("search")).toBe("hello");
    expect(req.request.params.get("page")).toBe("1");
    expect(req.request.params.has("empty")).toBeFalse();
    expect(req.request.params.has("nothing")).toBeFalse();
    expect(req.request.params.has("notDefined")).toBeFalse();
    req.flush([]);
  });

  it("adds /api prefix to path that already starts with /", () => {
    service.get("/users").subscribe();

    const req = httpMock.expectOne("/api/users");
    expect(req.request.url).toBe("/api/users");
    req.flush([]);
  });

  it("adds /api prefix and leading slash to path without leading slash", () => {
    service.get("users").subscribe();

    const req = httpMock.expectOne("/api/users");
    expect(req.request.url).toBe("/api/users");
    req.flush([]);
  });

  it("post body defaults to empty object when body is not provided", () => {
    service.post("/auth/logout").subscribe();

    const req = httpMock.expectOne("/api/auth/logout");
    expect(req.request.body).toEqual({});
    req.flush({ success: true });
  });
});
