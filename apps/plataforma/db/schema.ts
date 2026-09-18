import { sql } from "drizzle-orm";
import { pgSchema, text, integer, smallint, bigint, timestamp, date, jsonb, uniqueIndex, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";

// SQL migration adds users.student_id as DEFERRABLE INITIALLY DEFERRED to support demo batches.
const database = pgSchema(process.env.DATABASE_SCHEMA || "letria");
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const institutions = database.table("institutions", {
  id: text("id").primaryKey(), name: text("name").notNull(), isDemo: smallint("is_demo").notNull().default(0), createdAt: instant("created_at").notNull(),
}, (t) => [check("institutions_is_demo_check", sql`${t.isDemo} IN (0, 1)`)]);
export const users = database.table("users", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), name: text("name").notNull(), email: text("email"), passwordHash: text("password_hash"), role: text("role").notNull(), studentId: text("student_id").references((): AnyPgColumn => students.id, { onDelete: "set null" }), createdAt: instant("created_at").notNull(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email), index("users_institution_role").on(t.institutionId, t.role), index("users_student").on(t.studentId), check("users_role_check", sql`${t.role} IN ('admin', 'teacher', 'guardian', 'student')`)]);
export const sessions = database.table("sessions", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), role: text("role").notNull(), expiresAt: instant("expires_at").notNull(), settings: jsonb("settings").notNull().default({}),
}, (t) => [index("sessions_user").on(t.userId), index("sessions_expiry").on(t.expiresAt), check("sessions_role_check", sql`${t.role} IN ('admin', 'teacher', 'guardian', 'student')`)]);
export const classrooms = database.table("classrooms", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), name: text("name").notNull(), grade: text("grade").notNull(), teacherName: text("teacher_name").notNull(), teacherUserId: text("teacher_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }), createdAt: instant("created_at").notNull(),
}, (t) => [index("classrooms_institution_teacher").on(t.institutionId, t.teacherUserId), index("classrooms_teacher").on(t.teacherUserId)]);
export const students = database.table("students", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), classroomId: text("classroom_id").references((): AnyPgColumn => classrooms.id, { onDelete: "set null" }), name: text("name").notNull(), avatar: text("avatar").notNull().default("🦊"), grade: text("grade").notNull(), codeHash: text("code_hash"), consentAudio: smallint("consent_audio").notNull().default(0), createdAt: instant("created_at").notNull(),
}, (t) => [uniqueIndex("students_code_hash_unique").on(t.codeHash), index("students_institution_classroom").on(t.institutionId, t.classroomId), index("students_classroom").on(t.classroomId), check("students_consent_audio_check", sql`${t.consentAudio} IN (0, 1)`)]);
export const activities = database.table("activities", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), title: text("title").notNull(), body: jsonb("body").notNull(), status: text("status").notNull().default("draft"), version: integer("version").notNull().default(1), createdAt: instant("created_at").notNull(),
}, (t) => [index("activities_institution_status").on(t.institutionId, t.status), check("activities_status_check", sql`${t.status} IN ('draft', 'published')`), check("activities_version_check", sql`${t.version} > 0`)]);
export const activityVersions = database.table("activity_versions", {
  id: text("id").primaryKey(), activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }), version: integer("version").notNull(), body: jsonb("body").notNull(), createdAt: instant("created_at").notNull(),
}, (t) => [uniqueIndex("activity_version_unique").on(t.activityId, t.version), check("activity_versions_version_check", sql`${t.version} > 0`)]);
// Activity IDs can address the shared code catalog or an institution-owned activity.
export const submissions = database.table("submissions", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }), activityId: text("activity_id").notNull(), activityVersion: integer("activity_version").notNull(), score: integer("score").notNull(), correct: integer("correct").notNull(), total: integer("total").notNull(), xpEarned: integer("xp_earned").notNull().default(0), answers: jsonb("answers").notNull(), fingerprint: text("fingerprint").notNull(), completedAt: instant("completed_at").notNull(), durationSeconds: integer("duration_seconds").notNull(), isDiagnostic: smallint("is_diagnostic").notNull().default(0),
}, (t) => [index("submissions_student_time").on(t.studentId, t.completedAt), index("submissions_institution_time").on(t.institutionId, t.completedAt), index("submissions_student_activity").on(t.studentId, t.activityId), check("submissions_score_check", sql`${t.score} BETWEEN 0 AND 100`), check("submissions_counts_check", sql`${t.total} > 0 AND ${t.correct} BETWEEN 0 AND ${t.total}`), check("submissions_nonnegative_check", sql`${t.xpEarned} >= 0 AND ${t.durationSeconds} >= 0 AND ${t.activityVersion} > 0`), check("submissions_is_diagnostic_check", sql`${t.isDiagnostic} IN (0, 1)`)]);
export const xpAwards = database.table("xp_awards", {
  id: text("id").primaryKey(), studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }), activityId: text("activity_id").notNull(), submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }), xp: integer("xp").notNull(),
}, (t) => [uniqueIndex("xp_once_per_activity").on(t.studentId, t.activityId), index("xp_awards_submission").on(t.submissionId), check("xp_awards_xp_check", sql`${t.xp} >= 0`)]);
export const assignments = database.table("assignments", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), classroomId: text("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }), activityId: text("activity_id").notNull(), title: text("title").notNull(), dueDate: date("due_date", { mode: "string" }).notNull(), createdAt: instant("created_at").notNull(),
}, (t) => [index("assignments_institution_due").on(t.institutionId, t.dueDate), index("assignments_classroom").on(t.classroomId)]);
export const notes = database.table("notes", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }), text: text("text").notNull(), type: text("type").notNull(), author: text("author").notNull(), createdAt: instant("created_at").notNull(),
}, (t) => [index("notes_institution_time").on(t.institutionId, t.createdAt), index("notes_student").on(t.studentId), check("notes_type_check", sql`${t.type} IN ('observation', 'intervention')`)]);
// Historical notification/audit references remain text, preserving the SQLite contract.
export const notifications = database.table("notifications", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), studentId: text("student_id"), title: text("title").notNull(), text: text("text").notNull(), read: smallint("read").notNull().default(0), createdAt: instant("created_at").notNull(),
}, (t) => [index("notifications_institution_student_time").on(t.institutionId, t.studentId, t.createdAt), check("notifications_read_check", sql`${t.read} IN (0, 1)`)]);
export const recordings = database.table("recordings", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }), activityId: text("activity_id").notNull(), objectKey: text("object_key").notNull(), mimeType: text("mime_type").notNull(), size: integer("size").notNull(), createdAt: instant("created_at").notNull(),
}, (t) => [index("recordings_student_time").on(t.studentId, t.createdAt), index("recordings_institution").on(t.institutionId), check("recordings_size_check", sql`${t.size} >= 0`)]);
export const auditLogs = database.table("audit_logs", {
  id: text("id").primaryKey(), institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }), userId: text("user_id").notNull(), action: text("action").notNull(), detail: text("detail").notNull(), createdAt: instant("created_at").notNull(),
}, (t) => [index("audit_logs_institution_time").on(t.institutionId, t.createdAt), index("audit_logs_user").on(t.userId)]);
export const rateLimits = database.table("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), resetAt: bigint("reset_at", { mode: "number" }).notNull(),
}, (t) => [index("rate_limits_reset").on(t.resetAt), check("rate_limits_values_check", sql`${t.count} >= 0 AND ${t.resetAt} >= 0`)]);
