CREATE TABLE "agent_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"default_for_workspace" boolean NOT NULL,
	"approval_policy" text,
	"sandbox_mode" text,
	"tool_allowlist" jsonb,
	"mcp_servers" jsonb,
	"skill_refs" jsonb,
	"secret_refs" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_session_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"run_id" text,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"provider_project_key" text,
	"status" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_transcript_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text,
	"run_id" text,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"provider_project_key" text,
	"provider_entry_id" text,
	"ordinal" integer NOT NULL,
	"entry_type" text NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_transcript_entries_session_ordinal_unique" UNIQUE("provider","provider_session_id","provider_project_key","ordinal")
);
--> statement-breakpoint
CREATE TABLE "workspace_change_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text,
	"run_id" text,
	"status" text NOT NULL,
	"base_snapshot_id" text,
	"next_snapshot_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_file_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"change_set_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text,
	"run_id" text,
	"path" text NOT NULL,
	"change_type" text NOT NULL,
	"before_content_hash" text,
	"after_content_hash" text,
	"artifact_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_file_index" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"size_bytes" integer,
	"mime_type" text,
	"content_hash" text,
	"preview_capability" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workspace_file_index_workspace_path_unique" UNIQUE("workspace_id","path")
);
--> statement-breakpoint
CREATE TABLE "workspace_secret_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"delivery" text NOT NULL,
	"status" text NOT NULL,
	"ref_key" text NOT NULL,
	"target_name" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"status" text NOT NULL,
	"default_for_user" boolean NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_session_bindings" ADD CONSTRAINT "provider_session_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_session_bindings" ADD CONSTRAINT "provider_session_bindings_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_session_bindings" ADD CONSTRAINT "provider_session_bindings_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_transcript_entries" ADD CONSTRAINT "provider_transcript_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_transcript_entries" ADD CONSTRAINT "provider_transcript_entries_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_transcript_entries" ADD CONSTRAINT "provider_transcript_entries_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_change_sets" ADD CONSTRAINT "workspace_change_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_change_sets" ADD CONSTRAINT "workspace_change_sets_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_change_sets" ADD CONSTRAINT "workspace_change_sets_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file_changes" ADD CONSTRAINT "workspace_file_changes_change_set_id_workspace_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."workspace_change_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file_changes" ADD CONSTRAINT "workspace_file_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file_changes" ADD CONSTRAINT "workspace_file_changes_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file_changes" ADD CONSTRAINT "workspace_file_changes_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file_index" ADD CONSTRAINT "workspace_file_index_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_secret_refs" ADD CONSTRAINT "workspace_secret_refs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_profiles_workspace_id_idx" ON "agent_profiles" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_profiles_workspace_default_idx" ON "agent_profiles" USING btree ("workspace_id","default_for_workspace");--> statement-breakpoint
CREATE INDEX "provider_session_bindings_thread_provider_idx" ON "provider_session_bindings" USING btree ("thread_id","provider");--> statement-breakpoint
CREATE INDEX "provider_session_bindings_provider_session_idx" ON "provider_session_bindings" USING btree ("provider","provider_session_id","provider_project_key");--> statement-breakpoint
CREATE INDEX "provider_transcript_entries_provider_session_idx" ON "provider_transcript_entries" USING btree ("provider","provider_session_id","provider_project_key");--> statement-breakpoint
CREATE INDEX "provider_transcript_entries_run_id_idx" ON "provider_transcript_entries" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workspace_change_sets_workspace_id_idx" ON "workspace_change_sets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_change_sets_run_id_idx" ON "workspace_change_sets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workspace_change_sets_status_idx" ON "workspace_change_sets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspace_file_changes_change_set_id_idx" ON "workspace_file_changes" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "workspace_file_changes_run_id_idx" ON "workspace_file_changes" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workspace_file_changes_workspace_path_idx" ON "workspace_file_changes" USING btree ("workspace_id","path");--> statement-breakpoint
CREATE INDEX "workspace_file_index_workspace_id_idx" ON "workspace_file_index" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_secret_refs_workspace_id_idx" ON "workspace_secret_refs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_secret_refs_workspace_name_idx" ON "workspace_secret_refs" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "workspaces_app_id_user_id_idx" ON "workspaces" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE INDEX "workspaces_app_id_user_id_default_idx" ON "workspaces" USING btree ("app_id","user_id","default_for_user");