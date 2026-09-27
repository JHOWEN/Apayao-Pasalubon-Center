import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const profileBucket = process.env.SUPABASE_PROFILE_BUCKET?.trim() || "profile-images";

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Unable to list Supabase Storage buckets: ${listError.message}`);
  }

  if (buckets.some((bucket) => bucket.name === profileBucket)) {
    console.log(`Supabase bucket already exists: ${profileBucket}`);
    return;
  }

  const { error } = await supabase.storage.createBucket(profileBucket, {
    public: true,
    fileSizeLimit: "2MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });

  if (error) {
    throw new Error(`Unable to create Supabase bucket ${profileBucket}: ${error.message}`);
  }

  console.log(`Created public Supabase bucket: ${profileBucket}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
