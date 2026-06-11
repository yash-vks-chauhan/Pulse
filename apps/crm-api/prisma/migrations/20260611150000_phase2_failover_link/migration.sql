-- CreateIndex
CREATE UNIQUE INDEX "communications_parent_communication_id_key" ON "communications"("parent_communication_id");

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_parent_communication_id_fkey" FOREIGN KEY ("parent_communication_id") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

