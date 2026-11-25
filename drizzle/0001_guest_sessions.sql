CREATE TABLE guest_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guest_sessions_created_at ON guest_sessions(created_at);
--> statement-breakpoint
CREATE INDEX guest_sessions_expires_at ON guest_sessions(expires_at);
