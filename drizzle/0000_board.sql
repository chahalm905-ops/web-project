CREATE TABLE posts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  author TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('problem','project','idea')),
  topic TEXT NOT NULL CHECK(topic IN ('orchestration','evaluation','tooling','memory','multimodal','other')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX posts_created_at ON posts(created_at);
--> statement-breakpoint
CREATE INDEX posts_user_created_at ON posts(user_id, created_at);
--> statement-breakpoint
CREATE TABLE replies (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX replies_post_created_at ON replies(post_id, created_at);
--> statement-breakpoint
CREATE INDEX replies_user_created_at ON replies(user_id, created_at);
