import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email không hợp lệ.")
  .max(254, "Email quá dài.");
export const passwordSchema = z
  .string()
  .min(12, "Mật khẩu phải có ít nhất 12 ký tự.")
  .max(128, "Mật khẩu tối đa 128 ký tự.");
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Tên phải có ít nhất 2 ký tự.")
  .max(80, "Tên tối đa 80 ký tự.");
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu.")
      .max(128, "Mật khẩu tối đa 128 ký tự."),
  })
  .strict();
export const ownerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    workspaceName: nameSchema,
  })
  .strict();
export const memberSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(["ADMIN", "MANAGER", "MEDIA_BUYER", "UPLOADER", "VIEWER"], {
      error: "Vai trò không hợp lệ.",
    }),
  })
  .strict();
export const memberUpdateSchema = z.object({ active: z.boolean() }).strict();
