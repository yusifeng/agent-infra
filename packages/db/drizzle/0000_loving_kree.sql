CREATE TABLE "answer_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"run_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "answer_candidates_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "answer_candidates_thread_trigger_ordinal_unique" UNIQUE("thread_id","trigger_message_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "answer_selections" (
	"thread_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"selected_run_id" text NOT NULL,
	"source" text NOT NULL,
	"selected_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "answer_selections_thread_id_trigger_message_id_pk" PRIMARY KEY("thread_id","trigger_message_id")
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"run_id" text,
	"kind" text NOT NULL,
	"uri" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_share_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"payload_format" text NOT NULL,
	"payload_version" integer NOT NULL,
	"payload_json" jsonb,
	"message_count" integer NOT NULL,
	"start_seq" integer,
	"end_seq" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"source_thread_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"status" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "chat_shares_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "message_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"part_index" integer NOT NULL,
	"type" text NOT NULL,
	"text_value" text,
	"json_value" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "message_parts_message_id_part_index_unique" UNIQUE("message_id","part_index")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"run_id" text,
	"role" text NOT NULL,
	"seq" integer NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messages_thread_id_seq_unique" UNIQUE("thread_id","seq")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "run_events_run_id_seq_unique" UNIQUE("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "run_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"run_id" text NOT NULL,
	"feedback_actor_id" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "run_feedback_run_actor_unique" UNIQUE("run_id","feedback_actor_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"trigger_message_id" text,
	"provider" text,
	"model" text,
	"status" text NOT NULL,
	"usage_json" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text,
	"title" text,
	"status" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tool_invocations" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"run_id" text NOT NULL,
	"message_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"status" text NOT NULL,
	"input_json" jsonb,
	"output_json" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_candidates" ADD CONSTRAINT "answer_candidates_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_candidates" ADD CONSTRAINT "answer_candidates_trigger_message_id_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_candidates" ADD CONSTRAINT "answer_candidates_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_selections" ADD CONSTRAINT "answer_selections_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_selections" ADD CONSTRAINT "answer_selections_trigger_message_id_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_selections" ADD CONSTRAINT "answer_selections_selected_run_id_runs_id_fk" FOREIGN KEY ("selected_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_share_snapshots" ADD CONSTRAINT "chat_share_snapshots_share_id_chat_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."chat_shares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_shares" ADD CONSTRAINT "chat_shares_source_thread_id_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_parts" ADD CONSTRAINT "message_parts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_trigger_message_id_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_candidates_thread_trigger_idx" ON "answer_candidates" USING btree ("thread_id","trigger_message_id");--> statement-breakpoint
CREATE INDEX "answer_selections_selected_run_id_idx" ON "answer_selections" USING btree ("selected_run_id");--> statement-breakpoint
CREATE INDEX "chat_share_snapshots_share_id_idx" ON "chat_share_snapshots" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "chat_shares_source_thread_id_idx" ON "chat_shares" USING btree ("source_thread_id");--> statement-breakpoint
CREATE INDEX "chat_shares_status_idx" ON "chat_shares" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_parts_message_id_idx" ON "message_parts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "run_events_run_id_idx" ON "run_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_events_thread_id_idx" ON "run_events" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "run_feedback_thread_trigger_idx" ON "run_feedback" USING btree ("thread_id","trigger_message_id");--> statement-breakpoint
CREATE INDEX "runs_thread_id_idx" ON "runs" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "runs_thread_id_trigger_message_id_idx" ON "runs" USING btree ("thread_id","trigger_message_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_run_id_idx" ON "tool_invocations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_thread_id_idx" ON "tool_invocations" USING btree ("thread_id");