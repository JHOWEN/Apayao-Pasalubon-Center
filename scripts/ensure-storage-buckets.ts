import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const profileBucket = process.env.SUPABASE_PROFILE_BUCKET?.trim() || "profile-images";
const ratingImageBucket = process.env.SUPABASE_RATING_IMAGE_BUCKET?.trim() || "RATINGS_IMAGES";

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

  const existingBucketNames = new Set(buckets.map((bucket) => bucket.name));
  const bucketsToEnsure = [
    {
      name: profileBucket,
      options: {
        public: true,
        fileSizeLimit: "2MB",
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      },
    },
    {
      name: ratingImageBucket,
      options: {
        public: true,
        fileSizeLimit: "10MB",
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
    },
  ];

  for (const bucket of bucketsToEnsure) {
    if (existingBucketNames.has(bucket.name)) {
      console.log(`Supabase bucket already exists: ${bucket.name}`);
      continue;
    }

    const { error } = await supabase.storage.createBucket(bucket.name, bucket.options);
    if (error) {
      throw new Error(`Unable to create Supabase bucket ${bucket.name}: ${error.message}`);
    }

    existingBucketNames.add(bucket.name);
    console.log(`Created public Supabase bucket: ${bucket.name}`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
