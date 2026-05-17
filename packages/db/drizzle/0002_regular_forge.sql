CREATE TABLE "eval_example_results" (
	"id" text PRIMARY KEY NOT NULL,
	"eval_run_id" text NOT NULL,
	"dataset_example_id" text NOT NULL,
	"example_ordinal" integer NOT NULL,
	"status" text NOT NULL,
	"eval_thread_id" text,
	"output_run_id" text,
	"expected_output_json" jsonb NOT NULL,
	"actual_output_json" jsonb,
	"input_json" jsonb,
	"usage_json" jsonb,
	"metadata_json" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "eval_example_results_eval_run_dataset_example_unique" UNIQUE("eval_run_id","dataset_example_id"),
	CONSTRAINT "eval_example_results_eval_run_example_ordinal_unique" UNIQUE("eval_run_id","example_ordinal")
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"status" text NOT NULL,
	"name" text,
	"config_json" jsonb NOT NULL,
	"summary_json" jsonb NOT NULL,
	"error" text,
	"created_by_actor_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_example_results" ADD CONSTRAINT "eval_example_results_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_example_results" ADD CONSTRAINT "eval_example_results_dataset_example_id_dataset_examples_id_fk" FOREIGN KEY ("dataset_example_id") REFERENCES "public"."dataset_examples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_example_results" ADD CONSTRAINT "eval_example_results_eval_thread_id_threads_id_fk" FOREIGN KEY ("eval_thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_example_results" ADD CONSTRAINT "eval_example_results_output_run_id_runs_id_fk" FOREIGN KEY ("output_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_example_results_eval_run_id_idx" ON "eval_example_results" USING btree ("eval_run_id");--> statement-breakpoint
CREATE INDEX "eval_example_results_dataset_example_id_idx" ON "eval_example_results" USING btree ("dataset_example_id");--> statement-breakpoint
CREATE INDEX "eval_example_results_status_idx" ON "eval_example_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eval_example_results_example_ordinal_idx" ON "eval_example_results" USING btree ("example_ordinal");--> statement-breakpoint
CREATE INDEX "eval_runs_app_id_idx" ON "eval_runs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "eval_runs_dataset_id_idx" ON "eval_runs" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "eval_runs_status_idx" ON "eval_runs" USING btree ("status");