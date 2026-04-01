export type UserRole = "admin" | "program_owner" | "reviewer" | "participant";

export type AuthTokenPayload = {
  sub: string;
  sid: number;
  tid: string;
};

export type AuthContext = {
  userId: number;
  username: string;
  sessionId: number;
  role: UserRole;
};
