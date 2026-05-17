CREATE TABLE "dataset_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"source_run_id" text,
	"source_thread_id" text,
	"trigger_message_id" text,
	"input_json" jsonb NOT NULL,
	"baseline_output_json" jsonb,
	"expected_output_json" jsonb,
	"metadata_json" jsonb,
	"context_snapshot_json" jsonb,
	"tool_invocations_snapshot_json" jsonb,
	"created_by_actor_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" text NOT NULL,
	"metadata" jsonb,
	"created_by_actor_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dataset_examples" ADD CONSTRAINT "dataset_examples_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_examples_dataset_id_idx" ON "dataset_examples" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "dataset_examples_source_run_id_idx" ON "dataset_examples" USING btree ("source_run_id");--> statement-breakpoint
CREATE INDEX "dataset_examples_source_thread_id_idx" ON "dataset_examples" USING btree ("source_thread_id");--> statement-breakpoint
CREATE INDEX "dataset_examples_trigger_message_id_idx" ON "dataset_examples" USING btree ("trigger_message_id");--> statement-breakpoint
CREATE INDEX "datasets_app_id_idx" ON "datasets" USING btree ("app_id");