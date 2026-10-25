CREATE TABLE "operator_sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operator_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_sessions_token_hash_key"
    ON "operator_sessions"("token_hash");

CREATE INDEX "operator_sessions_expires_at_idx"
    ON "operator_sessions"("expires_at");

CREATE TABLE "operator_login_attempts" (
    "key_hash" CHAR(64) NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "blocked_until" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operator_login_attempts_pkey" PRIMARY KEY ("key_hash")
);

CREATE INDEX "operator_login_attempts_updated_at_idx"
    ON "operator_login_attempts"("updated_at");
