import { z } from "zod";

export const teacherCreateSchema = z.object({
  name: z.string().min(1).max(120),
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  monthlySalary: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

export const teacherUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).max(200).optional(),
  monthlySalary: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

export const classCreateSchema = z.object({
  name: z.string().min(1).max(120),
  schedule: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  teacherId: z.string().nullable().optional(),
});

export const classUpdateSchema = classCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const enrollmentUpdateSchema = z.object({
  studentIds: z.array(z.string()),
});

export const studentCreateSchema = z.object({
  name: z.string().min(1).max(120),
  studentCode: z.string().max(64).optional().or(z.literal("")),
  parentPhone: z.string().max(30).optional().or(z.literal("")),
  classIds: z.array(z.string()).optional(),
});

export const studentUpdateSchema = studentCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const adminCreateSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(200),
});

export const attendanceSubmitSchema = z.object({
  classId: z.string(),
  records: z.array(z.object({ studentId: z.string(), status: z.enum(["PRESENT", "ABSENT"]) })),
});

export const attendanceAdminEditSchema = z.object({
  classId: z.string(),
  studentId: z.string(),
  date: z.string(),
  status: z.enum(["PRESENT", "ABSENT", "CLEAR"]),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
