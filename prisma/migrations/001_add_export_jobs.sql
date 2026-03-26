-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "download_url" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "fields" JSONB,
    "filters" JSONB,
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "file_size" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_jobs_user_id_idx" ON "export_jobs"("user_id");

-- CreateIndex
CREATE INDEX "export_jobs_status_idx" ON "export_jobs"("status");

-- CreateIndex
CREATE INDEX "export_jobs_data_type_idx" ON "export_jobs"("data_type");

-- CreateIndex
CREATE INDEX "export_jobs_created_at_idx" ON "export_jobs"("created_at");

-- CreateIndex
CREATE INDEX "export_jobs_completed_at_idx" ON "export_jobs"("completed_at");

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
