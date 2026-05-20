CREATE TABLE "eval_run_compare_triage" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"baseline_eval_run_id" text NOT NULL,
	"candidate_eval_run_id" text NOT NULL,
	"dataset_example_id" text NOT NULL,
	"triage_status" text NOT NULL,
	"reviewer_note" text,
	"triaged_by_actor_id" text,
	"triaged_at" timestamp with time zone NOT NULL,
	"observed_projection_kind" text NOT NULL,
	"observed_projection_schema_version" integer NOT NULL,
	"observed_compare_strategy" text,
	"observed_outcome" text NOT NULL,
	"observed_reason" text NOT NULL,
	"observed_baseline_result_id" text,
	"observed_candidate_result_id" text,
	"observed_baseline_result_status" text,
	"observed_candidate_result_status" text,
	"observed_baseline_review_status" text,
	"observed_candidate_review_status" text,
	"observed_baseline_signal" text,
	"observed_candidate_signal" text,
	"observed_baseline_comparison_outcome" text,
	"observed_candidate_comparison_outcome" text,
	"observed_baseline_comparison_reason" text,
	"observed_candidate_comparison_reason" text,
	"observed_result_comparison_strategy" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "eval_run_compare_triage_pair_example_unique" UNIQUE("baseline_eval_run_id","candidate_eval_run_id","dataset_example_id")
);
--> statement-breakpoint
ALTER TABLE "eval_run_compare_triage" ADD CONSTRAINT "eval_run_compare_triage_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_run_compare_triage" ADD CONSTRAINT "eval_run_compare_triage_baseline_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("baseline_eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_run_compare_triage" ADD CONSTRAINT "eval_run_compare_triage_candidate_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("candidate_eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_run_compare_triage" ADD CONSTRAINT "eval_run_compare_triage_dataset_example_id_dataset_examples_id_fk" FOREIGN KEY ("dataset_example_id") REFERENCES "public"."dataset_examples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_run_compare_triage_pair_idx" ON "eval_run_compare_triage" USING btree ("baseline_eval_run_id","candidate_eval_run_id");--> statement-breakpoint
CREATE INDEX "eval_run_compare_triage_app_dataset_idx" ON "eval_run_compare_triage" USING btree ("app_id","dataset_id");--> statement-breakpoint
CREATE INDEX "eval_run_compare_triage_status_idx" ON "eval_run_compare_triage" USING btree ("triage_status");