-- Extend webhook delivery tracking into a durable database-backed processing queue.
ALTER TABLE "webhook_events"
  ADD COLUMN "resourceId" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6),
  ADD COLUMN "lockedAt" TIMESTAMPTZ(6);

CREATE INDEX "webhook_events_status_nextAttemptAt_receivedAt_idx"
  ON "webhook_events"("status", "nextAttemptAt", "receivedAt");
