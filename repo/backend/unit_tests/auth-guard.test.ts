import { describe, expect, it, vi, beforeEach } from "vitest";

import { authGuard } from "../src/middleware/auth.js";

const makeUnauthorizedError = (message: string) =>
  Object.assign(new Error(message), { statusCode: 401 });

const makeMockThis = (sessionRows: unknown[] = []) => {
  const queryFn = vi.fn().mockResolvedValue({ rows: sessionRows });
  return {
    httpErrors: {
      unauthorized: (message: string) => makeUnauthorizedError(message),
    },
    db: {
      query: queryFn,
    },
    _queryFn: queryFn,
  };
};

const makeMockRequest = (payload?: unknown, jwtError?: Error) => {
  const jwtVerify = jwtError
    ? vi.fn().mockRejectedValue(jwtError)
    : vi.fn().mockResolvedValue(payload);
  return {
    jwtVerify,
    auth: undefined as unknown,
  };
};

const mockReply = {} as never;

describe("authGuard", () => {
  it("propagates error when jwtVerify throws", async () => {
    const mockThis = makeMockThis();
    const jwtError = new Error("JWT verification failed");
    const mockRequest = makeMockRequest(undefined, jwtError);

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toThrow("JWT verification failed");
  });

  it("throws unauthorized when payload.sub is not a valid integer", async () => {
    const mockThis = makeMockThis();
    const mockRequest = makeMockRequest({ sub: "not-a-number", sid: 1, tid: "t1" });

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid access token",
    });
  });

  it("throws unauthorized when payload.sub is a float string", async () => {
    const mockThis = makeMockThis();
    const mockRequest = makeMockRequest({ sub: "1.5", sid: 1, tid: "t1" });

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid access token",
    });
  });

  it("throws unauthorized when payload.sid is not a valid integer", async () => {
    const mockThis = makeMockThis();
    const mockRequest = makeMockRequest({ sub: "1", sid: 1.7, tid: "t1" });

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid access token",
    });
  });

  it("throws unauthorized when payload.tid is missing", async () => {
    const mockThis = makeMockThis();
    const mockRequest = makeMockRequest({ sub: "1", sid: 1, tid: undefined });

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid access token",
    });
  });

  it("throws unauthorized when payload.tid is an empty string", async () => {
    const mockThis = makeMockThis();
    const mockRequest = makeMockRequest({ sub: "1", sid: 1, tid: "" });

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid access token",
    });
  });

  it("throws unauthorized when session is not found (empty rows)", async () => {
    const mockThis = makeMockThis([]);
    const mockRequest = makeMockRequest({ sub: "1", sid: 1, tid: "t1" });

    await expect(
      authGuard.call(mockThis as never, mockRequest as never, mockReply),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Session expired or invalid",
    });
  });

  it("sets request.auth correctly on success", async () => {
    const sessionRow = {
      session_id: 42,
      user_id: 7,
      username: "alice",
      role: "admin",
    };
    const mockThis = makeMockThis([sessionRow]);
    // After the first query returns the session, the second UPDATE query returns empty
    mockThis._queryFn
      .mockResolvedValueOnce({ rows: [sessionRow] })
      .mockResolvedValueOnce({ rows: [] });

    const mockRequest = makeMockRequest({ sub: "7", sid: 1, tid: "t1" });

    await authGuard.call(mockThis as never, mockRequest as never, mockReply);

    expect(mockRequest.auth).toEqual({
      userId: 7,
      username: "alice",
      sessionId: 42,
      role: "admin",
    });
  });

  it("calls db.query to refresh session expiry on success", async () => {
    const sessionRow = {
      session_id: 5,
      user_id: 2,
      username: "bob",
      role: "reviewer",
    };
    const mockThis = makeMockThis([sessionRow]);
    mockThis._queryFn
      .mockResolvedValueOnce({ rows: [sessionRow] })
      .mockResolvedValueOnce({ rows: [] });

    const mockRequest = makeMockRequest({ sub: "2", sid: 1, tid: "t1" });

    await authGuard.call(mockThis as never, mockRequest as never, mockReply);

    expect(mockThis._queryFn).toHaveBeenCalledTimes(2);
    const secondCall = mockThis._queryFn.mock.calls[1];
    expect(secondCall[0]).toContain("UPDATE app.sessions");
    expect(secondCall[0]).toContain("expires_at = NOW()");
    expect(secondCall[1]).toEqual([5]);
  });

  it("passes correct values to session lookup query", async () => {
    const sessionRow = {
      session_id: 10,
      user_id: 3,
      username: "carol",
      role: "program_owner",
    };
    const mockThis = makeMockThis([sessionRow]);
    mockThis._queryFn
      .mockResolvedValueOnce({ rows: [sessionRow] })
      .mockResolvedValueOnce({ rows: [] });

    const mockRequest = makeMockRequest({ sub: "3", sid: 99, tid: "token-abc" });

    await authGuard.call(mockThis as never, mockRequest as never, mockReply);

    const firstCall = mockThis._queryFn.mock.calls[0];
    expect(firstCall[0]).toContain("SELECT s.id AS session_id");
    expect(firstCall[1]).toEqual([99, 3, "token-abc"]);
  });

  it("sets request.auth with participant role correctly", async () => {
    const sessionRow = {
      session_id: 100,
      user_id: 50,
      username: "participant_user",
      role: "participant",
    };
    const mockThis = makeMockThis([sessionRow]);
    mockThis._queryFn
      .mockResolvedValueOnce({ rows: [sessionRow] })
      .mockResolvedValueOnce({ rows: [] });

    const mockRequest = makeMockRequest({ sub: "50", sid: 9, tid: "tid-xyz" });

    await authGuard.call(mockThis as never, mockRequest as never, mockReply);

    expect(mockRequest.auth).toEqual({
      userId: 50,
      username: "participant_user",
      sessionId: 100,
      role: "participant",
    });
  });
});
