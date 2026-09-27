import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageService } from "@/lib/storage/storage-service";

function getEnv(name: string) {
  return process.env[name]?.trim();
}

export class SupabaseStorageService implements StorageService {
  private readonly client: SupabaseClient;
  private readonly url: string;

  constructor() {
    const url = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceRoleKey) {
      throw new Error("Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    this.url = url
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/$/, "");
    this.client = createClient(this.url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async upload(input: { bucket: string; key: string; buffer: Buffer; contentType: string }) {
    const key = input.key.replace(/^\/+/, "");
    const { error } = await this.client.storage.from(input.bucket).upload(key, input.buffer, {
      contentType: input.contentType,
      upsert: true,
      cacheControl: "31536000",
    });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    return { key, url: this.getPublicUrl(input.bucket, key) };
  }

  async delete(input: { bucket: string; key: string }) {
    const { error } = await this.client.storage.from(input.bucket).remove([input.key.replace(/^\/+/, "")]);
    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }

  getPublicUrl(bucket: string, key: string) {
    return `${this.url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key.replace(/^\/+/, "")}`;
  }

  async createSignedUrl(bucket: string, key: string, expiresIn = 300) {
    const normalizedKey = key.replace(/^\/+/, "");
    let lastError = "No signed URL returned.";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
      }

      const { data, error } = await this.client.storage.from(bucket).createSignedUrl(normalizedKey, expiresIn);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }

      lastError = error?.message ?? lastError;
    }

    throw new Error(`Supabase signed URL failed: ${lastError}`);
  }
}
