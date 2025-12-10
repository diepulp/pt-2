drop extension if exists "pg_net";

drop policy "staff_read" on "public"."staff";

alter table "public"."staff" drop constraint "chk_staff_role_user_id";

drop function if exists "public"."rpc_start_rating_slip"(p_casino_id uuid, p_visit_id uuid, p_table_id uuid, p_seat_number text, p_game_settings jsonb, p_actor_id uuid);

drop index if exists "public"."idx_rating_slip_active_seat_unique";

drop index if exists "public"."idx_rating_slip_table_seat_status";

drop index if exists "public"."ux_rating_slip_visit_table_active";

alter table "public"."rating_slip" add column "player_id" uuid not null;

CREATE UNIQUE INDEX ux_rating_slip_player_table_active ON public.rating_slip USING btree (player_id, table_id) WHERE (status = ANY (ARRAY['open'::public.rating_slip_status, 'paused'::public.rating_slip_status]));

alter table "public"."rating_slip" add constraint "rating_slip_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.player(id) ON DELETE CASCADE not valid;

alter table "public"."rating_slip" validate constraint "rating_slip_player_id_fkey";


  create policy "staff_read"
  on "public"."staff"
  as permissive
  for select
  to public
using ((casino_id = (current_setting('app.casino_id'::text, true))::uuid));



