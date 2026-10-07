-- CreateEnum
CREATE TYPE "listing_condition" AS ENUM ('LIKE_NEW', 'GENTLY_USED', 'HEAVILY_USED');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('ACTIVE', 'PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone_e164" VARCHAR(20) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(500),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "condition" "listing_condition" NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'ACTIVE',
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_options" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "location_label" VARCHAR(120) NOT NULL,
    "weekdays" "weekday"[],
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "pickup_option_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "reserved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seller_handed_over_at" TIMESTAMPTZ(6),
    "buyer_received_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_checklists" (
    "reservation_id" UUID NOT NULL,
    "matches_listing" BOOLEAN NOT NULL,
    "works_no_undisclosed_damage" BOOLEAN NOT NULL,
    "all_parts_included" BOOLEAN NOT NULL,
    "issue_report" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_checklists_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "seller_ratings" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "stars" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "listings_status_published_at_idx" ON "listings"("status", "published_at");

-- CreateIndex
CREATE INDEX "listings_status_category_id_idx" ON "listings"("status", "category_id");

-- CreateIndex
CREATE INDEX "listings_seller_id_status_idx" ON "listings"("seller_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_photos_listing_id_position_key" ON "listing_photos"("listing_id", "position");

-- CreateIndex
CREATE INDEX "pickup_options_listing_id_idx" ON "pickup_options"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_options_id_listing_id_key" ON "pickup_options"("id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_listing_id_key" ON "reservations"("listing_id");

-- CreateIndex
CREATE INDEX "reservations_buyer_id_buyer_received_at_idx" ON "reservations"("buyer_id", "buyer_received_at");

-- CreateIndex
CREATE UNIQUE INDEX "seller_ratings_reservation_id_key" ON "seller_ratings"("reservation_id");

-- CreateIndex
CREATE INDEX "seller_ratings_seller_id_idx" ON "seller_ratings"("seller_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_options" ADD CONSTRAINT "pickup_options_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_pickup_option_id_listing_id_fkey" FOREIGN KEY ("pickup_option_id", "listing_id") REFERENCES "pickup_options"("id", "listing_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_checklists" ADD CONSTRAINT "reception_checklists_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ratings" ADD CONSTRAINT "seller_ratings_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ratings" ADD CONSTRAINT "seller_ratings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (hand-written: Prisma does not generate them). See docs/erd.dbml.
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_cents_check" CHECK ("price_cents" >= 100);
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_position_check" CHECK ("position" BETWEEN 0 AND 2);
-- Prisma lists are always nullable in the DB; NOT NULL lives in the CHECK so it doesn't show up as drift.
ALTER TABLE "pickup_options" ADD CONSTRAINT "pickup_options_weekdays_check" CHECK ("weekdays" IS NOT NULL AND cardinality("weekdays") >= 1);
ALTER TABLE "pickup_options" ADD CONSTRAINT "pickup_options_time_range_check" CHECK ("end_time" > "start_time");
ALTER TABLE "seller_ratings" ADD CONSTRAINT "seller_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5);
