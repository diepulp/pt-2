-- =============================================================================
-- SUPABASE-SANITIZED PRISMA MIGRATIONS - FIXED VERSION
-- =============================================================================
-- 
-- Generated from Prisma migrations and sanitized for Supabase compatibility
-- 
-- Key changes made:
-- - Added required PostgreSQL extensions with idempotent guards
-- - Removed Prisma-specific _prisma_migrations table references
-- - Replaced/removed OWNER TO statements
-- - Ensured UUID functions are available
-- - Preserved camelCase column names for DTO compatibility
-- - Added Supabase RLS preparation statements
-- - FIXED: Moved auth functions to public schema with proper grants
-- 
-- Instructions:
-- 1. Run this against your Supabase database
-- 2. Configure Row Level Security policies as needed
-- 3. Set up realtime subscriptions for relevant tables
-- =============================================================================

-- Required PostgreSQL Extensions (with idempotent guards)
-- These extensions are typically pre-installed in Supabase but we ensure they're available

-- UUID generation functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Full text search (if needed for player search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Additional useful extensions for casino operations
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Supabase-specific setup
-- Enable realtime for key tables (uncomment as needed after migration)
-- SELECT cron.schedule('cleanup-old-performance-metrics', '0 2 * * *', 'DELETE FROM performance_metrics WHERE created_at < NOW() - INTERVAL ''30 days''');

-- Grant basic permissions to authenticated users (customize as needed)
-- GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;

-- =============================================================================
-- SANITIZED PRISMA MIGRATIONS START HERE
-- =============================================================================

-- =============================================================================
-- PRISMA MIGRATIONS CONCATENATED IN TIMESTAMP ORDER
-- Generated on: Wed Aug 27 16:19:15 PDT 2025
-- Total migrations: 26
-- Source directory: /home/diepulp/projects/pt-1/prisma/migrations
-- =============================================================================
-- 
-- Educational Notes:
-- - Each migration is clearly separated with headers
-- - Migrations are processed in chronological order based on timestamps
-- - Original file paths are preserved for reference
-- - This file can be used for type system unification
-- - Compatible with Supabase migration workflows
-- 
-- Script used: ./temp/concat_migrations.sh
-- =============================================================================


-- ==============================================================================
-- MIGRATION: 20241224075107_init
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20241224075107_init/migration.sql
-- ==============================================================================

-- CreateTable
CREATE TABLE "casino" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "company_id" UUID,

    CONSTRAINT "casino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamesettings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "average_rounds_per_hour" INTEGER NOT NULL,
    "house_edge" DECIMAL NOT NULL,
    "point_multiplier" DECIMAL,
    "points_conversion_rate" DECIMAL,
    "seats_available" INTEGER,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gamesettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamingtable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "table_number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "casino_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gamingtable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamingtablesettings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_settings_id" UUID,
    "gaming_table_id" UUID,
    "active_from" TIMESTAMP(6),

    CONSTRAINT "gamingtablesettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "group_name" TEXT,

    CONSTRAINT "language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT,
    "dob" DATE,
    "company_id" UUID,

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playercasino" (
    "player_id" UUID NOT NULL,
    "casino_id" UUID NOT NULL,

    CONSTRAINT "playercasino_pkey" PRIMARY KEY ("player_id","casino_id")
);

-- CreateTable
CREATE TABLE "playerlanguage" (
    "player_id" UUID NOT NULL,
    "language_id" UUID NOT NULL,

    CONSTRAINT "playerlanguage_pkey" PRIMARY KEY ("player_id","language_id")
);

-- CreateTable
CREATE TABLE "ratingslip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "average_bet" DECIMAL NOT NULL,
    "cash_in" DECIMAL,
    "chips_brought" DECIMAL,
    "chips_taken" DECIMAL,
    "seat_number" INTEGER,
    "start_time" TIMESTAMP(6) NOT NULL,
    "end_time" TIMESTAMP(6),
    "game_settings" JSONB NOT NULL,
    "gaming_table_id" UUID,
    "visit_id" UUID,

    CONSTRAINT "ratingslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "player_id" UUID,
    "casino_id" UUID,
    "check_in_date" TIMESTAMP(6) NOT NULL,
    "check_out_date" TIMESTAMP(6),

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_email_key" ON "player"("email");

-- AddForeignKey
ALTER TABLE "casino" ADD CONSTRAINT "casino_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gamingtable" ADD CONSTRAINT "gamingtable_casino_id_fkey" FOREIGN KEY ("casino_id") REFERENCES "casino"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gamingtablesettings" ADD CONSTRAINT "gamingtablesettings_game_settings_id_fkey" FOREIGN KEY ("game_settings_id") REFERENCES "gamesettings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gamingtablesettings" ADD CONSTRAINT "gamingtablesettings_gaming_table_id_fkey" FOREIGN KEY ("gaming_table_id") REFERENCES "gamingtable"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "playercasino" ADD CONSTRAINT "playercasino_casino_id_fkey" FOREIGN KEY ("casino_id") REFERENCES "casino"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "playercasino" ADD CONSTRAINT "playercasino_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "playerlanguage" ADD CONSTRAINT "playerlanguage_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "language"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "playerlanguage" ADD CONSTRAINT "playerlanguage_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_gaming_table_id_fkey" FOREIGN KEY ("gaming_table_id") REFERENCES "gamingtable"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_casino_id_fkey" FOREIGN KEY ("casino_id") REFERENCES "casino"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- ==============================================================================
-- MIGRATION: 20241230105759_draft
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20241230105759_draft/migration.sql
-- ==============================================================================

-- This is an empty migration.
grant usage on schema public to postgres, anon, authenticated, service_role;

grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all functions in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;


-- ==============================================================================
-- MIGRATION: 20241231223424_add_player_ratinngslip_one_to_one
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20241231223424_add_player_ratinngslip_one_to_one/migration.sql
-- ==============================================================================

/*
  Warnings:

  - A unique constraint covering the columns `[ratingslipId]` on the table `player` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[playerId]` on the table `ratingslip` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `playerId` to the `ratingslip` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "player" ADD COLUMN     "ratingslipId" UUID;

-- AlterTable
ALTER TABLE "ratingslip" ADD COLUMN     "playerId" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "player_ratingslipId_key" ON "player"("ratingslipId");

-- CreateIndex
CREATE UNIQUE INDEX "ratingslip_playerId_key" ON "ratingslip"("playerId");

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_ratingslipId_fkey" FOREIGN KEY ("ratingslipId") REFERENCES "ratingslip"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- ==============================================================================
-- MIGRATION: 20250103013719_update_rating_slip_constraints
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250103013719_update_rating_slip_constraints/migration.sql
-- ==============================================================================

/*
  Warnings:

  - You are about to drop the column `ratingslipId` on the `player` table. All the data in the column will be lost.
  - The primary key for the `ratingslip` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[playerId,end_time]` on the table `ratingslip` will be created. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "player" DROP CONSTRAINT "player_ratingslipId_fkey";

-- DropForeignKey
ALTER TABLE "ratingslip" DROP CONSTRAINT "ratingslip_visit_id_fkey";

-- DropIndex
DROP INDEX "player_ratingslipId_key";

-- DropIndex
DROP INDEX "ratingslip_playerId_key";

-- AlterTable
ALTER TABLE "player" DROP COLUMN "ratingslipId";

-- AlterTable
ALTER TABLE "ratingslip" DROP CONSTRAINT "ratingslip_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "ratingslip_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "ratingslip_playerId_end_time_key" ON "ratingslip"("playerId", "end_time");

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ==============================================================================
-- MIGRATION: 20250116093905_add_points_to_ratingslip
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250116093905_add_points_to_ratingslip/migration.sql
-- ==============================================================================

-- AlterTable
ALTER TABLE "ratingslip" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;


-- ==============================================================================
-- MIGRATION: 20250116112656_utc_adjustment
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250116112656_utc_adjustment/migration.sql
-- ==============================================================================

-- AlterTable
ALTER TABLE "gamesettings" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "gamingtable" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "gamingtablesettings" ALTER COLUMN "active_from" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "ratingslip" ALTER COLUMN "start_time" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "end_time" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "visit" ALTER COLUMN "check_in_date" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "check_out_date" SET DATA TYPE TIMESTAMPTZ(6);


-- ==============================================================================
-- MIGRATION: 20250118062541_update_gaming_table_settings
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250118062541_update_gaming_table_settings/migration.sql
-- ==============================================================================

/*
  Warnings:

  - Made the column `game_settings_id` on table `gamingtablesettings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gaming_table_id` on table `gamingtablesettings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `active_from` on table `gamingtablesettings` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "gamingtablesettings" ADD COLUMN     "active_until" TIMESTAMPTZ(6),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "game_settings_id" SET NOT NULL,
ALTER COLUMN "gaming_table_id" SET NOT NULL,
ALTER COLUMN "active_from" SET NOT NULL;

-- CreateIndex
CREATE INDEX "gamingtablesettings_gaming_table_id_active_from_idx" ON "gamingtablesettings"("gaming_table_id", "active_from");


-- ==============================================================================
-- MIGRATION: 20250123095552_one_rating_slip_per_player
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250123095552_one_rating_slip_per_player/migration.sql
-- ==============================================================================

/*
  Warnings:

  - A unique constraint covering the columns `[playerId,status]` on the table `ratingslip` will be created. If there are existing duplicate values, this will fail.
  -Truncate will drp all the data
*/
TRUNCATE TABLE "ratingslip" CASCADE;
-- DropIndex
DROP INDEX "ratingslip_playerId_end_time_key";

-- AlterTable
ALTER TABLE "ratingslip" ADD COLUMN     "game_settings_id" UUID,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "ratingslip_playerId_idx" ON "ratingslip"("playerId");

-- CreateIndex
CREATE INDEX "ratingslip_game_settings_id_idx" ON "ratingslip"("game_settings_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratingslip_playerId_status_key" ON "ratingslip"("playerId", "status");

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_game_settings_id_fkey" FOREIGN KEY ("game_settings_id") REFERENCES "gamesettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ==============================================================================
-- MIGRATION: 20250129110728_reward_system
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250129110728_reward_system/migration.sql
-- ==============================================================================

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('MATCH_PLAY_LEVEL', 'MEAL_COMPLIMENTARY');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'ISSUED', 'REDEEMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "reward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "RewardType" NOT NULL,
    "criteria" JSONB NOT NULL,
    "expiry_duration" INTEGER,
    "issuance_limit" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "casino_id" UUID,

    CONSTRAINT "reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playerReward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "player_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "details" JSONB,
    "expires_at" TIMESTAMP,

    CONSTRAINT "playerReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_type_idx" ON "reward"("type");

-- CreateIndex
CREATE INDEX "playerReward_player_id_idx" ON "playerReward"("player_id");

-- CreateIndex
CREATE INDEX "playerReward_reward_id_idx" ON "playerReward"("reward_id");

-- AddForeignKey
ALTER TABLE "reward" ADD CONSTRAINT "reward_casino_id_fkey" FOREIGN KEY ("casino_id") REFERENCES "casino"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "playerReward" ADD CONSTRAINT "playerReward_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "playerReward" ADD CONSTRAINT "playerReward_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "reward"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- ==============================================================================
-- MIGRATION: 20250129113940_visit_update
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250129113940_visit_update/migration.sql
-- ==============================================================================

/*
  Warnings:

  - Made the column `player_id` on table `visit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `casino_id` on table `visit` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('ONGOING', 'COMPLETED', 'CANCELED');

-- DropForeignKey
ALTER TABLE "ratingslip" DROP CONSTRAINT "ratingslip_game_settings_id_fkey";

-- DropForeignKey
ALTER TABLE "ratingslip" DROP CONSTRAINT "ratingslip_playerId_fkey";

-- DropForeignKey
ALTER TABLE "ratingslip" DROP CONSTRAINT "ratingslip_visit_id_fkey";

-- DropForeignKey
ALTER TABLE "visit" DROP CONSTRAINT "visit_casino_id_fkey";

-- DropForeignKey
ALTER TABLE "visit" DROP CONSTRAINT "visit_player_id_fkey";

-- AlterTable
ALTER TABLE "visit" ADD COLUMN     "status" "VisitStatus" NOT NULL DEFAULT 'ONGOING',
ALTER COLUMN "player_id" SET NOT NULL,
ALTER COLUMN "casino_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "visit_player_id_casino_id_idx" ON "visit"("player_id", "casino_id");

-- CreateIndex
CREATE INDEX "visit_check_in_date_idx" ON "visit"("check_in_date");

-- CreateIndex
CREATE INDEX "visit_check_out_date_idx" ON "visit"("check_out_date");

-- CreateIndex
CREATE INDEX "visit_status_idx" ON "visit"("status");

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_game_settings_id_fkey" FOREIGN KEY ("game_settings_id") REFERENCES "gamesettings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratingslip" ADD CONSTRAINT "ratingslip_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_casino_id_fkey" FOREIGN KEY ("casino_id") REFERENCES "casino"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- ==============================================================================
-- MIGRATION: 20250129131313_rating_status_enums
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250129131313_rating_status_enums/migration.sql
-- ==============================================================================

/*
  Warnings:

  - The `status` column on the `ratingslip` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RatingSlipStatus" AS ENUM ('OPEN', 'CLOSED', 'PAUSED');

-- AlterTable
ALTER TABLE "ratingslip" DROP COLUMN "status",
ADD COLUMN     "status" "RatingSlipStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "ratingslip_playerId_status_key" ON "ratingslip"("playerId", "status");


-- ==============================================================================
-- MIGRATION: 20250130000000_add_close_player_session
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250130000000_add_close_player_session/migration.sql
-- ==============================================================================

-- Drop existing functions with the same name but different signatures
DROP FUNCTION IF EXISTS close_player_session(uuid, uuid, numeric, timestamp with time zone, numeric);
DROP FUNCTION IF EXISTS close_player_session(text, text, numeric, timestamp with time zone, numeric);

-- Create a function to close both rating slip and visit in a transaction
create or replace function close_player_session(
  p_rating_slip_id uuid,
  p_visit_id uuid,
  p_chips_taken numeric,
  p_end_time timestamp with time zone default now(),
  p_points numeric default 0
)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
begin
  -- Start transaction
  begin
    -- Update rating slip
    update ratingslip
    set 
      status = 'CLOSED'::text,
      chips_taken = p_chips_taken,
      end_time = p_end_time,
      points = p_points,
      updated_at = now()
    where id = p_rating_slip_id
    and status = 'OPEN'::text;

    -- Update visit
    update visit
    set 
      check_out_date = p_end_time,
      updated_at = now()
    where id = p_visit_id
    and check_out_date is null;

    -- Get the number of rows affected
    if not found then
      raise exception 'No rating slip or visit found with the provided IDs';
    end if;

    -- Prepare result
    select json_build_object(
      'success', true,
      'message', 'Player session closed successfully',
      'rating_slip_id', p_rating_slip_id,
      'visit_id', p_visit_id,
      'end_time', p_end_time
    ) into v_result;

    -- Return result
    return v_result;
  exception
    when others then
      -- Rollback transaction
      raise exception 'Failed to close player session: %', SQLERRM;
  end;
end;
$$; 

-- ==============================================================================
-- MIGRATION: 20250131103611_remove_unique_status_constraint
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250131103611_remove_unique_status_constraint/migration.sql
-- ==============================================================================

-- Step 1: Drop the existing unique constraint
ALTER TABLE "ratingslip" DROP CONSTRAINT IF EXISTS "unique_open_slip_per_player";

-- Step 2: Add a new unique index for only OPEN slips
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_slip_per_player
ON "ratingslip" ("playerId")
WHERE "status" = 'OPEN';

-- Step 3 (Optional but recommended): Create a general index for fast lookup
CREATE INDEX IF NOT EXISTS idx_ratingslip_player_status
ON "ratingslip" ("playerId", "status");

-- ==============================================================================
-- MIGRATION: 20250131_performance_indexes
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250131_performance_indexes/migration.sql
-- ==============================================================================

-- Migration: Add Critical Performance Indexes for Player Operations
-- Date: 2025-01-31
-- Purpose: Optimize player move operations from 3+ seconds to <500ms

-- Critical index for player move operations (most important for seat changes)
CREATE INDEX idx_rating_slips_move_performance
ON "ratingslip"("gaming_table_id", "seat_number", "status")
WHERE "status" = 'OPEN';

-- Index for gaming table operations lookup (table assignment)
CREATE INDEX idx_rating_slips_table_operations  
ON "ratingslip"("gaming_table_id", "status");

-- Index for gaming table casino lookup (floor view performance)
CREATE INDEX idx_gaming_tables_casino_lookup
ON "gamingtable"("casino_id", "id")
WHERE "casino_id" IS NOT NULL;

-- Index for gaming table settings active lookup
CREATE INDEX idx_gaming_table_settings_active
ON "gamingtablesettings"("gaming_table_id", "is_active")
WHERE "is_active" = true;

-- Index for player search optimization (name-based search)
CREATE INDEX idx_players_search_optimization
ON "player"("firstName", "lastName", "email");

-- Index for visit status optimization (active visits)
CREATE INDEX idx_visits_active_status
ON "visit"("casino_id", "status", "player_id")
WHERE "status" = 'ONGOING';

-- Index for active visits by player (checkout operations)
CREATE INDEX idx_visit_player_active
ON "visit"("player_id", "check_out_date")
WHERE "check_out_date" IS NULL;

-- Index for gaming table settings time-based lookup (current settings)
CREATE INDEX idx_gaming_table_settings_current
ON "gamingtablesettings"("gaming_table_id", "active_until")
WHERE "is_active" = true AND "active_until" IS NULL;

-- Index for real-time table updates (subscription optimization)
CREATE INDEX idx_rating_slips_table_realtime
ON "ratingslip"("gaming_table_id", "start_time")
WHERE "status" IN ('OPEN', 'PAUSED');

-- Comments for future reference
COMMENT ON INDEX idx_rating_slips_move_performance IS 'Critical performance index for player move operations - targets <500ms response time';
COMMENT ON INDEX idx_rating_slips_table_operations IS 'Optimizes table-based rating slip queries for floor management';
COMMENT ON INDEX idx_gaming_tables_casino_lookup IS 'Speeds up table lookup by casino for floor views';
COMMENT ON INDEX idx_players_search_optimization IS 'Optimizes player name and email search operations'; 

-- ==============================================================================
-- MIGRATION: 20250621100926_add_version_to_ratingslip
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250621100926_add_version_to_ratingslip/migration.sql
-- ==============================================================================

-- DropIndex
DROP INDEX "ratingslip_playerId_status_key";

-- AlterTable
ALTER TABLE "ratingslip" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "ratingslip_id_version_idx" ON "ratingslip"("id", "version");

-- RenameIndex
ALTER INDEX "idx_ratingslip_player_status" RENAME TO "ratingslip_playerId_status_idx";


-- ==============================================================================
-- MIGRATION: 20250627221405_add_player_id_scanning_fields
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250627221405_add_player_id_scanning_fields/migration.sql
-- ==============================================================================

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F');

-- DropIndex
DROP INDEX "idx_players_search_optimization";

-- DropIndex
DROP INDEX "idx_rating_slips_table_operations";

-- AlterTable
ALTER TABLE "player" ADD COLUMN     "address" JSONB,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "expirationDate" DATE,
ADD COLUMN     "eyeColor" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "height" TEXT,
ADD COLUMN     "issueDate" DATE,
ADD COLUMN     "issuingState" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "weight" TEXT;


-- ==============================================================================
-- MIGRATION: 20250702004939_table_context
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250702004939_table_context/migration.sql
-- ==============================================================================

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('DEALER', 'SUPERVISOR', 'PIT_BOSS', 'AUDITOR');

-- CreateEnum
CREATE TYPE "InventorySlipType" AS ENUM ('OPEN', 'CLOSE');

-- CreateEnum
CREATE TYPE "CountType" AS ENUM ('INITIAL', 'PERIODIC', 'CLOSING');

-- CreateEnum
CREATE TYPE "KeyAction" AS ENUM ('CHECKOUT', 'RETURN');

-- CreateEnum
CREATE TYPE "RFIDEvent" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('CTR', 'MTL', 'VARIANCE', 'BREAK_OVERDUE', 'SECURITY');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('SHIFT_SUMMARY', 'DAILY_OVERVIEW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'CSV', 'JSON');

-- CreateTable
CREATE TABLE "Staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableInventorySlip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gamingTableId" UUID NOT NULL,
    "slipType" "InventorySlipType" NOT NULL,
    "initialCount" JSONB NOT NULL,
    "finalCount" JSONB,
    "openedById" UUID NOT NULL,
    "closedById" UUID,
    "openedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TableInventorySlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FillSlip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "casinoId" UUID NOT NULL,
    "gamingTableId" UUID NOT NULL,
    "denominations" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "FillSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandover" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gamingTableId" UUID NOT NULL,
    "fromDealerId" UUID NOT NULL,
    "toDealerId" UUID NOT NULL,
    "shiftStart" TIMESTAMP NOT NULL,
    "shiftEnd" TIMESTAMP NOT NULL,
    "signedByFrom" TEXT NOT NULL,
    "signedByTo" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChipCountEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gamingTableId" UUID NOT NULL,
    "countType" "CountType" NOT NULL,
    "countDetails" JSONB NOT NULL,
    "countedById" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChipCountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gamingTableId" UUID NOT NULL,
    "amount" DECIMAL NOT NULL,
    "scheduledAt" TIMESTAMP NOT NULL,
    "actualPulledAt" TIMESTAMP,
    "variance" DECIMAL,
    "recordedById" UUID NOT NULL,

    CONSTRAINT "DropEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyControlLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "keyIdentifier" TEXT NOT NULL,
    "action" "KeyAction" NOT NULL,
    "performedById" UUID NOT NULL,
    "authorizedById" UUID,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyControlLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFIDChipMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chipSerial" TEXT NOT NULL,
    "gamingTableId" UUID,
    "location" TEXT NOT NULL,
    "eventType" "RFIDEvent" NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" UUID,

    CONSTRAINT "RFIDChipMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAlert" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alertType" "AlertType" NOT NULL,
    "description" TEXT NOT NULL,
    "triggeredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP,
    "relatedEventId" TEXT,

    CONSTRAINT "ComplianceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerRotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tableStringId" TEXT NOT NULL,
    "dealerId" UUID NOT NULL,
    "shiftStart" TIMESTAMP NOT NULL,
    "shiftEnd" TIMESTAMP NOT NULL,

    CONSTRAINT "DealerRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakAlert" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dealerId" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "alertTime" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,

    CONSTRAINT "BreakAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "parameters" JSONB NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "generatedById" UUID NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- AddForeignKey
ALTER TABLE "TableInventorySlip" ADD CONSTRAINT "TableInventorySlip_gamingTableId_fkey" FOREIGN KEY ("gamingTableId") REFERENCES "gamingtable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableInventorySlip" ADD CONSTRAINT "TableInventorySlip_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableInventorySlip" ADD CONSTRAINT "TableInventorySlip_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillSlip" ADD CONSTRAINT "FillSlip_casinoId_fkey" FOREIGN KEY ("casinoId") REFERENCES "casino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillSlip" ADD CONSTRAINT "FillSlip_gamingTableId_fkey" FOREIGN KEY ("gamingTableId") REFERENCES "gamingtable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillSlip" ADD CONSTRAINT "FillSlip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillSlip" ADD CONSTRAINT "FillSlip_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandover" ADD CONSTRAINT "ShiftHandover_gamingTableId_fkey" FOREIGN KEY ("gamingTableId") REFERENCES "gamingtable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandover" ADD CONSTRAINT "ShiftHandover_fromDealerId_fkey" FOREIGN KEY ("fromDealerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandover" ADD CONSTRAINT "ShiftHandover_toDealerId_fkey" FOREIGN KEY ("toDealerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChipCountEvent" ADD CONSTRAINT "ChipCountEvent_gamingTableId_fkey" FOREIGN KEY ("gamingTableId") REFERENCES "gamingtable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChipCountEvent" ADD CONSTRAINT "ChipCountEvent_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropEvent" ADD CONSTRAINT "DropEvent_gamingTableId_fkey" FOREIGN KEY ("gamingTableId") REFERENCES "gamingtable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropEvent" ADD CONSTRAINT "DropEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyControlLog" ADD CONSTRAINT "KeyControlLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyControlLog" ADD CONSTRAINT "KeyControlLog_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFIDChipMovement" ADD CONSTRAINT "RFIDChipMovement_gamingTableId_fkey" FOREIGN KEY ("gamingTableId") REFERENCES "gamingtable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFIDChipMovement" ADD CONSTRAINT "RFIDChipMovement_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerRotation" ADD CONSTRAINT "DealerRotation_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakAlert" ADD CONSTRAINT "BreakAlert_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakAlert" ADD CONSTRAINT "BreakAlert_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "gamingtable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ==============================================================================
-- MIGRATION: 20250730014000_add_performance_monitoring
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250730014000_add_performance_monitoring/migration.sql
-- ==============================================================================

-- Performance Monitoring Migration - Phase 5D.1
-- Add performance monitoring tables using Prisma instead of raw Supabase migrations

-- CreateEnum for MetricType
CREATE TYPE "MetricType" AS ENUM ('page_load', 'api_response', 'ui_interaction', 'resource_load', 'error');

-- CreateEnum for AlertTypePerf
CREATE TYPE "AlertTypePerf" AS ENUM ('threshold_breach', 'sla_violation', 'error_spike', 'performance_degradation');

-- CreateEnum for Severity
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateTable: performance_metrics
CREATE TABLE "performance_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metric_type" "MetricType" NOT NULL,
    "metric_name" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "user_session" TEXT,
    "page_path" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: performance_alerts
CREATE TABLE "performance_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alert_type" "AlertTypePerf" NOT NULL,
    "severity" "Severity" NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "metric_name" TEXT NOT NULL,
    "threshold_value" DECIMAL(10,2),
    "actual_value" DECIMAL(10,2),
    "message" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: performance_thresholds
CREATE TABLE "performance_thresholds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metric_type" "MetricType" NOT NULL,
    "metric_name" TEXT NOT NULL,
    "warning_threshold" DECIMAL(10,2) NOT NULL,
    "critical_threshold" DECIMAL(10,2) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable: performance_config
CREATE TABLE "performance_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metric_name" TEXT NOT NULL,
    "target_value" DECIMAL(10,2) NOT NULL,
    "warning_value" DECIMAL(10,2) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: performance_metrics indexes
CREATE INDEX "performance_metrics_timestamp_idx" ON "performance_metrics"("timestamp");
CREATE INDEX "performance_metrics_metric_type_idx" ON "performance_metrics"("metric_type");
CREATE INDEX "performance_metrics_user_session_idx" ON "performance_metrics"("user_session");
CREATE INDEX "performance_metrics_page_path_idx" ON "performance_metrics"("page_path");
CREATE INDEX "performance_metrics_metric_type_timestamp_idx" ON "performance_metrics"("metric_type", "timestamp");

-- CreateIndex: performance_alerts indexes
CREATE INDEX "performance_alerts_created_at_idx" ON "performance_alerts"("created_at");
CREATE INDEX "performance_alerts_severity_idx" ON "performance_alerts"("severity");
CREATE INDEX "performance_alerts_resolved_at_idx" ON "performance_alerts"("resolved_at");

-- CreateIndex: performance_thresholds indexes
CREATE UNIQUE INDEX "performance_thresholds_metric_type_metric_name_key" ON "performance_thresholds"("metric_type", "metric_name");

-- CreateIndex: performance_config indexes
CREATE UNIQUE INDEX "performance_config_metric_name_key" ON "performance_config"("metric_name");

-- Insert default performance thresholds
INSERT INTO "performance_thresholds" ("metric_type", "metric_name", "warning_threshold", "critical_threshold") VALUES
  ('page_load', 'load', 1000, 3000),
  ('page_load', 'lcp', 2500, 4000),
  ('page_load', 'cls', 0.1, 0.25),
  ('page_load', 'ttfb', 600, 1500),
  ('api_response', 'default', 200, 1000),
  ('ui_interaction', 'fid', 100, 300),
  ('ui_interaction', 'click', 100, 300),
  ('ui_interaction', 'long_task', 50, 100)
ON CONFLICT ("metric_type", "metric_name") DO NOTHING;

-- Insert default performance configuration
INSERT INTO "performance_config" ("metric_name", "target_value", "warning_value") VALUES
('lcp', 2500, 2000),
('fid', 100, 50),
('cls', 0.1, 0.05),
('rating_slip_load_time', 1000, 500),
('table_switch_time', 200, 100),
('realtime_update_latency', 50, 25),
('database_query_time', 200, 100),
('ttfb', 800, 500),
('fcp', 1800, 1200)
ON CONFLICT ("metric_name") DO NOTHING;

-- Performance monitoring functions and triggers
-- Function to create performance alerts
CREATE OR REPLACE FUNCTION create_performance_alert(
  p_alert_type text,
  p_severity text,
  p_metric_type text,
  p_metric_name text,
  p_threshold_value numeric DEFAULT NULL,
  p_actual_value numeric DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
) 
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  alert_id uuid;
BEGIN
  INSERT INTO "performance_alerts" (
    "alert_type",
    "severity",
    "metric_type",
    "metric_name",
    "threshold_value",
    "actual_value",
    "message",
    "metadata"
  ) VALUES (
    p_alert_type::"AlertTypePerf",
    p_severity::"Severity",
    p_metric_type::"MetricType",
    p_metric_name,
    p_threshold_value,
    p_actual_value,
    COALESCE(p_message, format('Performance alert: %s %s exceeded threshold', p_metric_type, p_metric_name)),
    p_metadata
  ) RETURNING "id" INTO alert_id;
  
  RETURN alert_id;
END;
$$;

-- Function to resolve performance alerts
CREATE OR REPLACE FUNCTION resolve_performance_alert(alert_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE "performance_alerts" 
  SET "resolved_at" = NOW()
  WHERE "id" = alert_id 
    AND "resolved_at" IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Real-time performance monitoring trigger
CREATE OR REPLACE FUNCTION check_performance_thresholds()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  threshold_rec record;
  alert_severity text;
BEGIN
  -- Get threshold for this metric
  SELECT * INTO threshold_rec 
  FROM "performance_thresholds" 
  WHERE "metric_type" = NEW."metric_type" 
    AND "metric_name" = NEW."metric_name"
    AND "enabled" = true;
  
  -- If no specific threshold, try default for metric type
  IF NOT FOUND THEN
    SELECT * INTO threshold_rec 
    FROM "performance_thresholds" 
    WHERE "metric_type" = NEW."metric_type" 
      AND "metric_name" = 'default'
      AND "enabled" = true;
  END IF;
  
  -- Check thresholds and create alerts
  IF FOUND THEN
    IF NEW."value" > threshold_rec."critical_threshold" THEN
      alert_severity := 'critical';
    ELSIF NEW."value" > threshold_rec."warning_threshold" THEN
      alert_severity := 'high';
    END IF;
    
    -- Create alert if threshold breached
    IF alert_severity IS NOT NULL THEN
      PERFORM create_performance_alert(
        'threshold_breach',
        alert_severity,
        NEW."metric_type"::text,
        NEW."metric_name",
        CASE 
          WHEN alert_severity = 'critical' THEN threshold_rec."critical_threshold"
          ELSE threshold_rec."warning_threshold"
        END,
        NEW."value",
        format('Performance threshold breached: %s %s took %sms', 
               NEW."metric_type", NEW."metric_name", NEW."value"),
        jsonb_build_object(
          'user_session', NEW."user_session",
          'page_path', NEW."page_path",
          'timestamp', NEW."timestamp"
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for automatic threshold monitoring
CREATE TRIGGER performance_threshold_check
  AFTER INSERT ON "performance_metrics"
  FOR EACH ROW EXECUTE FUNCTION check_performance_thresholds();

-- RLS Policies for performance monitoring
ALTER TABLE "performance_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_thresholds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_config" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own metrics
CREATE POLICY "Allow authenticated users to insert metrics" ON "performance_metrics"
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to read metrics (for dashboard)
CREATE POLICY "Allow authenticated users to read metrics" ON "performance_metrics"
  FOR SELECT TO authenticated
  USING (true);

-- Allow service role full access for system monitoring
CREATE POLICY "Service role full access to metrics" ON "performance_metrics"
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Similar policies for alerts, thresholds, and config
CREATE POLICY "Allow authenticated users to read alerts" ON "performance_alerts"
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access to alerts" ON "performance_alerts"
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read thresholds" ON "performance_thresholds"
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access to thresholds" ON "performance_thresholds"
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read config" ON "performance_config"
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access to config" ON "performance_config"
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ==============================================================================
-- MIGRATION: 20250808224233_add_lightweight_points_tracking
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250808224233_add_lightweight_points_tracking/migration.sql
-- ==============================================================================

-- AlterTable
ALTER TABLE "ratingslip" ADD COLUMN     "accumulated_seconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pause_intervals" JSONB DEFAULT '[]';

-- CreateTable
CREATE TABLE "accrual_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,
    "raw_theo" DECIMAL(10,2),
    "promo_applied" BOOLEAN NOT NULL DEFAULT false,
    "promo_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accrual_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accrual_history_session_id_created_at_idx" ON "accrual_history"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "accrual_history_event_id_idx" ON "accrual_history"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "accrual_history_session_id_event_id_key" ON "accrual_history"("session_id", "event_id");

-- AddForeignKey
ALTER TABLE "accrual_history" ADD CONSTRAINT "accrual_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ratingslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ==============================================================================
-- MIGRATION: 20250817083642_add_mtl_system
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250817083642_add_mtl_system/migration.sql
-- ==============================================================================

-- CreateEnum
CREATE TYPE "MtlDirection" AS ENUM ('cash_in', 'cash_out');

-- CreateEnum
CREATE TYPE "MtlArea" AS ENUM ('pit', 'cage', 'slot', 'poker', 'kiosk', 'sportsbook', 'other');

-- CreateEnum
CREATE TYPE "TenderType" AS ENUM ('cash', 'cashier_check', 'tito', 'money_order', 'chips', 'other');

-- CreateTable
CREATE TABLE "mtl_entry" (
    "id" BIGSERIAL NOT NULL,
    "casino_id" TEXT NOT NULL,
    "patron_id" TEXT,
    "person_name" TEXT,
    "person_last_name" TEXT,
    "person_description" TEXT,
    "direction" "MtlDirection" NOT NULL,
    "area" "MtlArea" NOT NULL,
    "tender_type" "TenderType" NOT NULL DEFAULT 'cash',
    "amount" DECIMAL(12,2) NOT NULL,
    "table_number" TEXT,
    "location_note" TEXT,
    "event_time" TIMESTAMPTZ(6) NOT NULL,
    "gaming_day" DATE NOT NULL,
    "recorded_by_employee_id" UUID NOT NULL,
    "recorded_by_signature" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mtl_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_settings" (
    "id" TEXT NOT NULL,
    "casino_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "gaming_day_start" TEXT NOT NULL DEFAULT '06:00',
    "watchlist_floor" DECIMAL(10,2) NOT NULL DEFAULT 3000,
    "ctr_threshold" DECIMAL(10,2) NOT NULL DEFAULT 10000,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "casino_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mtl_entry_casino_id_gaming_day_patron_id_idx" ON "mtl_entry"("casino_id", "gaming_day", "patron_id");

-- CreateIndex
CREATE INDEX "mtl_entry_casino_id_gaming_day_direction_idx" ON "mtl_entry"("casino_id", "gaming_day", "direction");

-- CreateIndex
CREATE INDEX "mtl_entry_casino_id_event_time_idx" ON "mtl_entry"("casino_id", "event_time");

-- CreateIndex
CREATE INDEX "mtl_entry_amount_idx" ON "mtl_entry"("amount");

-- CreateIndex
CREATE INDEX "mtl_entry_gaming_day_direction_amount_idx" ON "mtl_entry"("gaming_day", "direction", "amount");

-- CreateIndex
CREATE INDEX "mtl_entry_casino_id_gaming_day_person_name_person_last_name_idx" ON "mtl_entry"("casino_id", "gaming_day", "person_name", "person_last_name");

-- CreateIndex
CREATE INDEX "mtl_entry_recorded_by_employee_id_created_at_idx" ON "mtl_entry"("recorded_by_employee_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "casino_settings_casino_id_key" ON "casino_settings"("casino_id");

-- AddForeignKey
ALTER TABLE "mtl_entry" ADD CONSTRAINT "mtl_entry_recorded_by_employee_id_fkey" FOREIGN KEY ("recorded_by_employee_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ==============================================================================
-- MIGRATION: 20250817083643_add_gaming_day_function
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250817083643_add_gaming_day_function/migration.sql
-- ==============================================================================

-- Gaming Day Computation Function and Trigger
-- This function computes the gaming day based on casino settings and timezone

-- Function to compute gaming day based on casino settings
CREATE OR REPLACE FUNCTION compute_gaming_day()
RETURNS TRIGGER AS $$
DECLARE
  casino_tz TEXT;
  day_start TEXT;
  local_time TIMESTAMP WITH TIME ZONE;
  day_boundary TIME;
BEGIN
  -- Get casino settings (with fallback defaults)
  SELECT 
    COALESCE(timezone, 'America/Los_Angeles'),
    COALESCE(gaming_day_start, '06:00')
  INTO casino_tz, day_start
  FROM casino_settings
  WHERE casino_id = NEW.casino_id;
  
  -- Use default values if no casino settings found
  IF casino_tz IS NULL THEN
    casino_tz := 'America/Los_Angeles';
    day_start := '06:00';
  END IF;
  
  -- Convert event time to casino timezone
  local_time := NEW.event_time AT TIME ZONE casino_tz;
  day_boundary := day_start::TIME;
  
  -- Compute gaming day
  IF local_time::TIME >= day_boundary THEN
    NEW.gaming_day := local_time::DATE;
  ELSE
    NEW.gaming_day := (local_time - INTERVAL '1 day')::DATE;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback to current date on any error
    NEW.gaming_day := CURRENT_DATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS set_gaming_day ON mtl_entry;
CREATE TRIGGER set_gaming_day
BEFORE INSERT OR UPDATE ON mtl_entry
FOR EACH ROW
EXECUTE FUNCTION compute_gaming_day();

-- Data validation constraints
ALTER TABLE mtl_entry
ADD CONSTRAINT mtl_entry_amount_positive 
CHECK (amount > 0);

ALTER TABLE mtl_entry
ADD CONSTRAINT mtl_entry_person_identification
CHECK (
  (patron_id IS NOT NULL) OR 
  (person_name IS NOT NULL AND person_last_name IS NOT NULL)
);

ALTER TABLE mtl_entry
ADD CONSTRAINT mtl_entry_event_time_reasonable
CHECK (
  event_time >= '2020-01-01'::timestamp AND 
  event_time <= (CURRENT_TIMESTAMP + INTERVAL '1 day')
);

ALTER TABLE mtl_entry
ADD CONSTRAINT mtl_entry_signature_not_empty
CHECK (TRIM(recorded_by_signature) != '');

-- Add partial unique constraints to prevent duplicate entries
-- For identified patrons
CREATE UNIQUE INDEX mtl_entry_duplicate_prevention_patron
ON mtl_entry (casino_id, patron_id, direction, amount, event_time)
WHERE patron_id IS NOT NULL;

-- For unidentified persons  
CREATE UNIQUE INDEX mtl_entry_duplicate_prevention_person
ON mtl_entry (casino_id, person_name, person_last_name, direction, amount, event_time)
WHERE patron_id IS NULL AND person_name IS NOT NULL AND person_last_name IS NOT NULL;

-- ==============================================================================
-- MIGRATION: 20250817083644_add_mtl_views
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250817083644_add_mtl_views/migration.sql
-- ==============================================================================

-- MTL Aggregation Views for Compliance Monitoring
-- These views provide real-time patron aggregation and threshold monitoring

-- View for patron aggregates by gaming day
CREATE OR REPLACE VIEW mtl_patron_aggregates AS
SELECT 
  casino_id,
  gaming_day,
  -- Create unified patron key for both identified and unidentified patrons
  CASE 
    WHEN patron_id IS NOT NULL THEN 
      CONCAT('patron:', patron_id)
    ELSE 
      CONCAT('person:', COALESCE(person_name, ''), ':', COALESCE(person_last_name, ''))
  END as patron_key,
  patron_id,
  person_name,
  person_last_name,
  person_description,
  
  -- Cash flow aggregations
  SUM(CASE WHEN direction = 'cash_in' THEN amount ELSE 0 END) as cash_in_total,
  SUM(CASE WHEN direction = 'cash_out' THEN amount ELSE 0 END) as cash_out_total,
  
  -- Transaction metrics
  COUNT(*) as transaction_count,
  COUNT(CASE WHEN direction = 'cash_in' THEN 1 END) as cash_in_count,
  COUNT(CASE WHEN direction = 'cash_out' THEN 1 END) as cash_out_count,
  
  -- Threshold calculations
  GREATEST(
    SUM(CASE WHEN direction = 'cash_in' THEN amount ELSE 0 END),
    SUM(CASE WHEN direction = 'cash_out' THEN amount ELSE 0 END)
  ) as max_direction_total,
  
  -- Time tracking
  MIN(event_time) as first_transaction_time,
  MAX(event_time) as last_transaction_time
  
FROM mtl_entry
GROUP BY 
  casino_id,
  gaming_day,
  patron_key,
  patron_id,
  person_name,
  person_last_name,
  person_description;

-- View for threshold monitoring with configurable thresholds
CREATE OR REPLACE VIEW mtl_threshold_monitor AS
SELECT 
  ma.*,
  cs.watchlist_floor,
  cs.ctr_threshold,
  
  -- Threshold status determination
  CASE 
    WHEN ma.max_direction_total >= cs.ctr_threshold THEN 'ctr'
    WHEN ma.max_direction_total >= cs.watchlist_floor THEN 'watchlist'
    ELSE 'normal'
  END as threshold_status,
  
  -- Proximity to thresholds (for early warnings)
  CASE 
    WHEN ma.max_direction_total >= cs.ctr_threshold * 0.9 THEN 'critical'
    WHEN ma.max_direction_total >= cs.watchlist_floor * 0.9 THEN 'warning'
    ELSE 'normal'
  END as proximity_status,
  
  -- Days since thresholds
  (ma.max_direction_total / NULLIF(cs.watchlist_floor, 0)) * 100 as watchlist_percentage,
  (ma.max_direction_total / NULLIF(cs.ctr_threshold, 0)) * 100 as ctr_percentage
  
FROM mtl_patron_aggregates ma
LEFT JOIN casino_settings cs ON ma.casino_id = cs.casino_id;

-- Daily summary view for compliance reporting
CREATE OR REPLACE VIEW mtl_daily_summary AS
WITH daily_aggregates AS (
  SELECT 
    casino_id,
    gaming_day,
    area,
    COUNT(*) as area_transaction_count,
    SUM(CASE WHEN direction = 'cash_in' THEN amount ELSE 0 END) as area_cash_in_total,
    SUM(CASE WHEN direction = 'cash_out' THEN amount ELSE 0 END) as area_cash_out_total
  FROM mtl_entry
  GROUP BY casino_id, gaming_day, area
),
threshold_counts AS (
  SELECT 
    casino_id,
    gaming_day,
    COUNT(CASE WHEN threshold_status = 'ctr' THEN 1 END) as ctr_candidates,
    COUNT(CASE WHEN threshold_status = 'watchlist' THEN 1 END) as watchlist_candidates
  FROM mtl_threshold_monitor
  GROUP BY casino_id, gaming_day
)
SELECT 
  me.casino_id,
  me.gaming_day,
  COUNT(DISTINCT 
    CASE 
      WHEN me.patron_id IS NOT NULL THEN 
        CONCAT('patron:', me.patron_id)
      ELSE 
        CONCAT('person:', COALESCE(me.person_name, ''), ':', COALESCE(me.person_last_name, ''))
    END
  ) as unique_patrons,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN me.direction = 'cash_in' THEN me.amount ELSE 0 END) as total_cash_in,
  SUM(CASE WHEN me.direction = 'cash_out' THEN me.amount ELSE 0 END) as total_cash_out,
  
  -- Compliance metrics
  COALESCE(tc.ctr_candidates, 0) as ctr_candidates,
  COALESCE(tc.watchlist_candidates, 0) as watchlist_candidates,
  
  -- Area breakdown
  jsonb_object_agg(
    da.area,
    jsonb_build_object(
      'transaction_count', da.area_transaction_count,
      'cash_in_total', da.area_cash_in_total,
      'cash_out_total', da.area_cash_out_total
    )
  ) as area_breakdown

FROM mtl_entry me
LEFT JOIN daily_aggregates da ON 
  me.casino_id = da.casino_id AND 
  me.gaming_day = da.gaming_day AND
  me.area = da.area
LEFT JOIN threshold_counts tc ON 
  me.casino_id = tc.casino_id AND 
  me.gaming_day = tc.gaming_day
GROUP BY me.casino_id, me.gaming_day, tc.ctr_candidates, tc.watchlist_candidates;

-- Performance monitoring view
CREATE OR REPLACE VIEW mtl_performance_metrics AS
SELECT 
  gaming_day,
  casino_id,
  COUNT(*) as transaction_count,
  AVG(amount) as avg_amount,
  MAX(amount) as max_amount,
  COUNT(DISTINCT COALESCE(patron_id, CONCAT(person_name, person_last_name))) as unique_patrons,
  
  -- Performance indicators
  COUNT(*) / 24.0 as avg_transactions_per_hour,
  CASE 
    WHEN COUNT(*) > 2000 THEN 'high_volume'
    WHEN COUNT(*) > 1000 THEN 'normal_volume'
    ELSE 'low_volume'
  END as volume_status
  
FROM mtl_entry
WHERE gaming_day >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY gaming_day, casino_id;

-- ==============================================================================
-- MIGRATION: 20250817120000_enhance_gaming_day_function
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250817120000_enhance_gaming_day_function/migration.sql
-- ==============================================================================

-- Enhanced Gaming Day Computation Function
-- Optimized for timezone edge cases, DST transitions, and performance
-- Performance target: <5ms execution time

-- Enhanced gaming day computation function
CREATE OR REPLACE FUNCTION compute_gaming_day()
RETURNS TRIGGER AS $$
DECLARE
  casino_tz TEXT;
  day_start TEXT;
  local_time TIMESTAMP WITH TIME ZONE;
  day_boundary TIME;
  timezone_valid BOOLEAN := TRUE;
BEGIN
  -- Get casino settings with optimized query (ensure index exists)
  SELECT 
    COALESCE(timezone, 'America/Los_Angeles'),
    COALESCE(gaming_day_start, '06:00')
  INTO casino_tz, day_start
  FROM casino_settings
  WHERE casino_id = NEW.casino_id;
  
  -- Use default values if no casino settings found
  IF casino_tz IS NULL THEN
    casino_tz := 'America/Los_Angeles';
    day_start := '06:00';
  END IF;
  
  -- Validate timezone (attempt conversion to catch invalid timezones)
  BEGIN
    PERFORM NEW.event_time AT TIME ZONE casino_tz;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      timezone_valid := FALSE;
      casino_tz := 'America/Los_Angeles'; -- Fallback to PST
  END;
  
  -- Convert event time to casino timezone with DST awareness
  local_time := NEW.event_time AT TIME ZONE casino_tz;
  day_boundary := day_start::TIME;
  
  -- Enhanced gaming day computation with DST considerations
  -- The AT TIME ZONE operation handles DST transitions correctly
  IF local_time::TIME >= day_boundary THEN
    NEW.gaming_day := local_time::DATE;
  ELSE
    -- For times before gaming day boundary, use previous calendar day
    NEW.gaming_day := (local_time - INTERVAL '1 day')::DATE;
  END IF;
  
  RETURN NEW;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Enhanced error handling with logging
    -- Fallback to current date in local timezone
    NEW.gaming_day := CURRENT_DATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger with enhanced function
DROP TRIGGER IF EXISTS set_gaming_day ON mtl_entry;
CREATE TRIGGER set_gaming_day
BEFORE INSERT OR UPDATE ON mtl_entry
FOR EACH ROW
EXECUTE FUNCTION compute_gaming_day();

-- Ensure casino_settings has proper index for performance
CREATE INDEX IF NOT EXISTS idx_casino_settings_casino_id 
ON casino_settings (casino_id);

-- ==============================================================================
-- MIGRATION: 20250821_partial_unique_indexes
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250821_partial_unique_indexes/migration.sql
-- ==============================================================================

-- Migration: Partial Unique Indexes for Business Logic Constraints
-- Created: 2025-08-21
-- Purpose: Add partial unique indexes that Prisma cannot express natively
-- These indexes enforce critical business rules at the database level

-- =============================================================================
-- UP MIGRATION
-- =============================================================================

-- 1. Ensure only one ONGOING visit per player per casino
-- Business Rule: A player cannot have multiple active visits at the same casino
DROP INDEX IF EXISTS uniq_active_visit_per_player_casino;
CREATE UNIQUE INDEX uniq_active_visit_per_player_casino 
ON visit(player_id, casino_id) 
WHERE status = 'ONGOING';

-- 2. Ensure only one OPEN rating slip per visit
-- Business Rule: A visit can only have one active rating slip at a time
DROP INDEX IF EXISTS uniq_open_slip_per_visit;
CREATE UNIQUE INDEX uniq_open_slip_per_visit 
ON ratingslip(visit_id) 
WHERE status = 'OPEN';

-- 3. Ensure only one OPEN rating slip per table seat
-- Business Rule: A seat at a gaming table can only be occupied by one active player
DROP INDEX IF EXISTS uniq_open_seat_per_table;
CREATE UNIQUE INDEX uniq_open_seat_per_table 
ON ratingslip(gaming_table_id, seat_number) 
WHERE status = 'OPEN' AND seat_number IS NOT NULL;

-- ==============================================================================
-- MIGRATION: 20250822075352_add_visit_modes_and_loyalty_ledger
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250822075352_add_visit_modes_and_loyalty_ledger/migration.sql
-- ==============================================================================

/*
  Warnings:

  - You are about to drop the `mtl_trigger_performance` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "VisitMode" AS ENUM ('RATED', 'UNRATED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- AlterTable
ALTER TABLE "casino_settings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "mtl_entry" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "playerReward" ADD COLUMN     "visit_id" UUID;

-- AlterTable
ALTER TABLE "visit" ADD COLUMN     "mode" "VisitMode" NOT NULL DEFAULT 'UNRATED';

-- CreateTable
CREATE TABLE "LoyaltyLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "player_id" UUID NOT NULL,
    "visit_id" UUID,
    "points" INTEGER NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "description" TEXT NOT NULL,
    "transaction_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance_after" INTEGER NOT NULL,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyLedger_player_id_transaction_date_idx" ON "LoyaltyLedger"("player_id", "transaction_date");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_visit_id_idx" ON "LoyaltyLedger"("visit_id");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_direction_idx" ON "LoyaltyLedger"("direction");

-- CreateIndex
CREATE INDEX "playerReward_visit_id_idx" ON "playerReward"("visit_id");

-- CreateIndex
CREATE INDEX "visit_mode_idx" ON "visit"("mode");

-- AddForeignKey
ALTER TABLE "playerReward" ADD CONSTRAINT "playerReward_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- ==============================================================================
-- MIGRATION: 20250826000001_add_jwt_claims_functions - FIXED FOR SUPABASE
-- FILE: /home/diepulp/projects/pt-1/prisma/migrations/20250826000001_add_jwt_claims_functions/migration.sql
-- ==============================================================================

-- Migration: Add JWT Claims Functions for MTL Authentication
-- Phase 2: JWT Enhancement with Custom Claims
-- Created: 2025-08-26
-- FIXED: Moved auth functions to public schema for Supabase compatibility

-- Function to get permissions by staff role
CREATE OR REPLACE FUNCTION get_permissions_by_role(staff_role text)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  CASE staff_role
    WHEN 'DEALER' THEN
      RETURN jsonb_build_object(
        'canRecordTransactions', true,
        'canViewReports', true,
        'canExportData', false,
        'canVoidTransactions', false,
        'canViewThresholds', true
      );
    WHEN 'SUPERVISOR', 'PIT_BOSS' THEN
      RETURN jsonb_build_object(
        'canRecordTransactions', true,
        'canViewReports', true,
        'canExportData', true,
        'canVoidTransactions', true,
        'canViewThresholds', true
      );
    WHEN 'AUDITOR' THEN
      RETURN jsonb_build_object(
        'canRecordTransactions', false,
        'canViewReports', true,
        'canExportData', true,
        'canVoidTransactions', false,
        'canViewThresholds', true
      );
    ELSE
      RETURN jsonb_build_object(
        'canRecordTransactions', false,
        'canViewReports', false,
        'canExportData', false,
        'canVoidTransactions', false,
        'canViewThresholds', false
      );
  END CASE;
END;
$$;

-- Function to populate staff claims for JWT tokens (moved to public schema)
CREATE OR REPLACE FUNCTION populate_staff_claims(user_email text)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  staff_record record;
  claims jsonb;
  casino_record record;
BEGIN
  -- Get staff details by email
  SELECT s.id, s."firstName", s."lastName", s.email, s.role
  INTO staff_record
  FROM public."Staff" s
  WHERE s.email = user_email
  LIMIT 1;

  -- If no staff record found, return empty claims
  IF staff_record IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Get first casino for MVP (single casino setup)
  SELECT c.id, c.name
  INTO casino_record
  FROM public.casino c
  ORDER BY c."createdAt" ASC
  LIMIT 1;

  -- Build claims object with all required staff information
  claims := jsonb_build_object(
    'staff_id', staff_record.id,
    'staff_name', staff_record."firstName" || ' ' || staff_record."lastName",
    'staff_email', staff_record.email,
    'staff_role', staff_record.role::text,
    'casino_id', COALESCE(casino_record.id, 'default-casino-id'),
    'casino_name', COALESCE(casino_record.name, 'Default Casino'),
    'permissions', get_permissions_by_role(staff_record.role::text),
    'claims_version', '1.0',
    'updated_at', extract(epoch from now())::bigint
  );

  RETURN claims;
EXCEPTION
  WHEN OTHERS THEN
    -- Return empty claims on any error to prevent auth failures
    RETURN '{}'::jsonb;
END;
$$;

-- Function to handle JWT claims updates on user auth events (moved to public schema)
CREATE OR REPLACE FUNCTION handle_user_claims()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  staff_claims jsonb;
BEGIN
  -- Only process if user has an email
  IF NEW.email IS NOT NULL THEN
    -- Get staff claims
    staff_claims := populate_staff_claims(NEW.email);
    
    -- Update app_metadata with staff claims
    NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || staff_claims;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Continue without claims on error to prevent auth failures
    RETURN NEW;
END;
$$;

-- Create utility function to refresh user claims manually (for testing/admin) (moved to public schema)
CREATE OR REPLACE FUNCTION refresh_user_claims(user_email text)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  user_record record;
  updated_claims jsonb;
BEGIN
  -- Get user by email
  SELECT id, email, raw_app_meta_data
  INTO user_record
  FROM auth.users
  WHERE email = user_email;

  IF user_record IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Get fresh claims
  updated_claims := populate_staff_claims(user_email);

  -- Update user's app_metadata
  UPDATE auth.users 
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || updated_claims,
      updated_at = now()
  WHERE email = user_email;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_record.id,
    'claims', updated_claims
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error', 'Failed to refresh claims: ' || SQLERRM
    );
END;
$$;

-- Grant necessary permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION get_permissions_by_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION populate_staff_claims(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION handle_user_claims() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_user_claims(text) TO authenticated, service_role;

-- Grant specific permission to supabase_auth_admin for the auth hook function
GRANT EXECUTE ON FUNCTION handle_user_claims() TO supabase_auth_admin;

-- Grant select permissions needed for the functions
GRANT SELECT ON public."Staff" TO authenticated, service_role, supabase_auth_admin;
GRANT SELECT ON public.casino TO authenticated, service_role, supabase_auth_admin;

-- Create trigger for user claims updates on auth.users table
-- Note: This requires the function to be accessible by supabase_auth_admin
DROP TRIGGER IF EXISTS on_auth_user_claims ON auth.users;
CREATE TRIGGER on_auth_user_claims
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_claims();

-- Add comment for documentation
COMMENT ON FUNCTION get_permissions_by_role(text) IS 'Returns MTL permissions based on staff role for JWT claims';
COMMENT ON FUNCTION populate_staff_claims(text) IS 'Populates JWT app_metadata with staff information and permissions';
COMMENT ON FUNCTION handle_user_claims() IS 'Trigger function to automatically populate JWT claims on user auth events';
COMMENT ON FUNCTION refresh_user_claims(text) IS 'Utility function to manually refresh user JWT claims';

-- =============================================================================
-- SUPABASE POST-MIGRATION SETUP SUGGESTIONS
-- =============================================================================
-- 
-- After running this migration, consider the following Supabase-specific setup:
-- 
-- 1. Enable Realtime for tables that need live updates:
--    ALTER PUBLICATION supabase_realtime ADD TABLE casino;
--    ALTER PUBLICATION supabase_realtime ADD TABLE gamingtable;
--    ALTER PUBLICATION supabase_realtime ADD TABLE ratingslip;
--    ALTER PUBLICATION supabase_realtime ADD TABLE visit;
--    ALTER PUBLICATION supabase_realtime ADD TABLE mtl_entry;
-- 
-- 2. Consider Row Level Security policies for data isolation:
--    -- Example: Casino-based data isolation
--    -- ALTER TABLE casino ENABLE ROW LEVEL SECURITY;
--    -- CREATE POLICY "Casino access" ON casino FOR ALL TO authenticated 
--    --   USING (auth.jwt() ->> 'casino_id' = id::text);
-- 
-- 3. Performance optimizations:
--    -- Run ANALYZE to update table statistics
--    ANALYZE;
--    
--    -- Consider additional indexes based on your query patterns
--    -- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_custom_query_pattern 
--    -- ON your_table (columns_you_query_frequently);
-- 
-- 4. Monitoring and maintenance:
--    -- Set up log retention policies if using performance monitoring
--    -- Consider partitioning for high-volume tables like performance_metrics
-- 
-- =============================================================================
-- SANITIZATION COMPLETE
-- =============================================================================