import { z } from "zod";
import { getNewPasswordPolicyError } from "@/lib/password-policy";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters"),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .transform((value) => value.toLowerCase()),

  phone: z
    .string()
    .trim()
    .optional()
    .default(""),

  address: z
    .string()
    .trim()
    .optional()
    .default(""),

  password: z.string().superRefine((value, context) => {
    const message = getNewPasswordPolicyError(value);
    if (message) context.addIssue({ code: "custom", message });
  }),

  confirmPassword: z.string(),

  gdprConsent: z
    .boolean()
    .refine((value) => value === true, {
      message: "You must agree to the Terms and Conditions and Privacy Policy.",
    }),
})
.refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(8, "Password is required"),

  rememberMe: z.boolean().optional().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
