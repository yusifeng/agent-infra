ALTER TABLE "runs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "runs_status_next_attempt_at_idx" ON "runs" USING btree ("status","next_attempt_at");