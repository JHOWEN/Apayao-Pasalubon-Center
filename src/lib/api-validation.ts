import { NextResponse } from "next/server";
import { z } from "zod";

export async function parseJsonRequestBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  message = "Request data is invalid.",
): Promise<
  | { success: true; data: z.infer<TSchema> }
  | { success: false; response: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ success: false, message: "Request body must be valid JSON." }, { status: 400 }),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, message, errors: result.error.flatten().fieldErrors },
        { status: 400 },
      ),
    };
  }

  return { success: true, data: result.data };
}
