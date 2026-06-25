ALTER TABLE "runs" ADD COLUMN "claim_owner" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "runs_status_claim_expires_at_idx" ON "runs" USING btree ("status","claim_expires_at");