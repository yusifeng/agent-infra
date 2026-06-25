CREATE TABLE "run_approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"thread_id" text NOT NULL,
	"run_id" text NOT NULL,
	"provider" text NOT NULL,
	"permission_request_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"details_json" jsonb,
	"decision" text,
	"decision_reason" text,
	"resolved_by_actor_id" text,
	"metadata_json" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "run_approval_requests_run_provider_request_unique" UNIQUE("run_id","provider","permission_request_id")
);
--> statement-breakpoint
ALTER TABLE "run_approval_requests" ADD CONSTRAINT "run_approval_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_approval_requests" ADD CONSTRAINT "run_approval_requests_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_approval_requests" ADD CONSTRAINT "run_approval_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_approval_requests_run_id_idx" ON "run_approval_requests" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_approval_requests_status_expires_at_idx" ON "run_approval_requests" USING btree ("status","expires_at");