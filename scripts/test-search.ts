import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Use service role to bypass RLS for testing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function test() {
  const pattern = "Joh%";

  // Test: Query player table with !inner join to player_casino
  console.log("\n--- Testing player search query ---");
  console.log("Pattern:", pattern);

  const { data, error } = await supabase
    .from("player")
    .select(
      `
      id,
      first_name,
      last_name,
      player_casino!inner (
        status
      )
    `,
    )
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .limit(5);

  if (error) {
    console.log("ERROR:", error.message);
    console.log("Code:", error.code);
  } else {
    console.log("SUCCESS - Count:", data?.length);
    console.log("Data:", JSON.stringify(data, null, 2));
  }
}

test();
