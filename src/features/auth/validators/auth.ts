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
  role: z.literal("CUSTOMER").optional(),
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

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address.").max(160).transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  token: z.string().trim().min(1).max(2048),
  password: z.string().min(1).max(72),
  confirmPassword: z.string().min(1).max(72),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export const customerProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one profile field to update.",
});

export const customerAccountDeletionSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
