-- CreateIndex
CREATE INDEX "orders_attributed_communication_id_idx" ON "orders"("attributed_communication_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_attributed_communication_id_fkey" FOREIGN KEY ("attributed_communication_id") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

