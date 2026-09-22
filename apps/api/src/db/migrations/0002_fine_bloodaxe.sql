CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"category" text DEFAULT 'uncategorised' NOT NULL,
	"paid_by" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_amount_positive" CHECK ("expense"."amount_cents" > 0),
	CONSTRAINT "expense_currency_iso" CHECK ("expense"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "expense_share" (
	"expense_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"share_cents" integer NOT NULL,
	CONSTRAINT "expense_share_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id"),
	CONSTRAINT "expense_share_non_negative" CHECK ("expense_share"."share_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_group_idx" ON "expense" USING btree ("group_id");