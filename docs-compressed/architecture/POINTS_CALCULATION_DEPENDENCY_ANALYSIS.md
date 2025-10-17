Points Calculation 2025-10-10 Architectural decision Verify dependencies RatingSlip

Executive Summary dependencies RatingSlip table contains data calculate points `average_bet input `accumulated_seconds_settings blob config_settings_id` reference queries calculate points without external dependencies

Point Calculation Formula-calculator calculatePoints gameSettings averageBet totalRounds house_edge average_rounds_hour point_multiplier_conversion_rate seats_available 7 theoreticalWin house_edge 100 totalRounds pointsEarned_conversion_rate 10.0)\_multiplier 1.0 currentSeats 7 < emptySeats 7 bonusFactor 1 0.05 expectedRounds average_rounds_hour pointsEarned 1.1 Math.round(pointsEarned

Required Inputs Direct Inputs (3) configuration wager rounds GameSettings Fields_edge Casino edge 2.5%)\_rounds_per_hour rounds bonus calculation_multiplier Loyalty multiplier 1.0_conversion_rate Conversion rate 10.0)\_available table empty seat bonus

RatingSlip Table Schema Fields-L1390) ratingslip CALCULATION INPUTS average_bet Direct input accumulated_seconds calculating rounds game_settings Json GameSettings_id string Session context id playerId visit_id gaming_table_id Timing start_time end_time pause_intervals Calculated outputs points calculated result fields seat_number status RatingSlipStatus version Financial cash_in chips_brought chips_taken

GameSettings Table Schema:440-477#L440-L477): gamesettings Row id string name string REQUIRED FIELDS house_edge number average_rounds_per_hour point_multiplier points_conversion_rate seats_available number null 7) Metadata version number created updated string null

Dependency Mapping Input 1: `averageBet `ratingslip.average_bet `number User input > 0 Input 2: `totalRounds_seconds `average_rounds_per_hour durationHours_seconds totalRounds Not stored calculated Input 3: `gameSettings `ratingslip.game_settings JOIN `gamesettings table_settings_id `Json fields Copied from table configuration rating slip

Data Flow Analysis Scenario RatingSlip Creation User starts rating slip table.create playerId visit_id gaming_table_id average_bet 50 input start_time '2025-01-15T10:00:00Z System fetches active game settings Game settings into rating slip.update.id game_settings game_settings.id Reference preserved RatingSlip End Points Calculation User ends rating.endSession RatingSlipService.endSession endSession(id data in slip totalRounds calculateRounds_rounds Calculate points local data Store calculated points(id end_time status 'completed Emit event Loyalty Service'RatingSlipCompleted ratingSlipId playerId

Dependency Risks Risk 1: `game_settings JSON Structure_settings column typed not game_settings required fields house_edge average_rounds_per_hour point_multiplier_conversion_rate seats_available Validate_settings structure defaults nullable fields function validateGameSettings validation 'INVALID_GAME_SETTINGS house_edge validate fields return GameSettingsJson Risk 2: `totalRounds`Calculation Consistency`totalRounds not stored derived from `accumulated_seconds durationHours accumulated_seconds / totalRoundsround(durationHours average_rounds Rounding errors Points differ No audit trail rounds Store_rounds RatingSlip ALTER TABLE ADD COLUMN total_rounds Immutable snapshot calculation input Faster recalculations derivation Audit trail calculations Risk 3: `game_settings_id Nullable required calculation game_settings_id null set Database constraint ALTER TABLE game_settings_id NOT NULL Service-level validation_settings_id_GAME_SETTINGS required

Recommended Schema Enhancements Option Add_rounds Column total_rounds column audit TABLE COLUMN total_rounds Backfill data total_rounds_rounds NULL non-nullable backfill COLUMN total_rounds NULL calculation Faster recalculation Better audit trail Removes derivation complexity Enforce_settings_id NOT NULL Verify NULL values SELECT NULL non-nullable COLUMN NULL integrity Prevents calculation failures safety improvement

Architectural Decision Confirmation RatingSlip Calculate Points dependencies satisfied `average_bet` Stored `totalRounds` Derivable from `accumulated_seconds_settings.average_rounds_per_hour `gameSettings Stored JSON blob `game_settings column services/ratingslip/business export createRatingSlipBusinessService endSession<ServiceResult executeOperation Validate game settings Calculate rounds durationHours.accumulated_seconds totalRounds durationHours.average Calculate points_bet totalRounds Update calculated points update end_time status 'completed

Final Recommendations Implement( Calculate_seconds Store.points Emit `RatingSlipCompletedEvent points Loyalty Short-term Add_rounds column audit trail_settings_id NOT NULL check constraint >= 0 Long-term-MVP Consider computed column_rounds Add versioning point calculation Track calculation version

References Calculator (PT-1) Types Responsibility Matrix [Loyalty Service Design-3/LOYALTY_SERVICE_DESIGN 1.0.0 Assistant Verified Implement validated dependencies
