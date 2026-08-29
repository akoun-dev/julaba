-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "clientId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "clientId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Expense_clientId_key" ON "Expense"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_clientId_key" ON "Product"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientId_key" ON "Sale"("clientId");

