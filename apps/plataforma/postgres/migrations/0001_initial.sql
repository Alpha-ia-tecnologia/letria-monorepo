-- Letria PostgreSQL schema. The runner sets an isolated, validated search_path.
-- Flags stay SMALLINT to preserve the application's 0/1 SQL contract.
CREATE TABLE institutions (
  id text PRIMARY KEY, name text NOT NULL, is_demo smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  CONSTRAINT institutions_is_demo_check CHECK (is_demo IN (0, 1))
);
CREATE TABLE users (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL, email text, password_hash text, role text NOT NULL,
  student_id text, created_at timestamptz NOT NULL,
  CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'guardian', 'student'))
);
CREATE UNIQUE INDEX users_email_unique ON users(email);
CREATE INDEX users_institution_role ON users(institution_id, role);
CREATE INDEX users_student ON users(student_id);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL, expires_at timestamptz NOT NULL, settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sessions_role_check CHECK (role IN ('admin', 'teacher', 'guardian', 'student'))
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE classrooms (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL, grade text NOT NULL, teacher_name text NOT NULL,
  teacher_user_id text REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL
);
CREATE INDEX classrooms_institution_teacher ON classrooms(institution_id, teacher_user_id);
CREATE INDEX classrooms_teacher ON classrooms(teacher_user_id);
CREATE TABLE students (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  classroom_id text REFERENCES classrooms(id) ON DELETE SET NULL, name text NOT NULL,
  avatar text NOT NULL DEFAULT '🦊', grade text NOT NULL, code_hash text,
  consent_audio smallint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL,
  CONSTRAINT students_consent_audio_check CHECK (consent_audio IN (0, 1))
);
CREATE UNIQUE INDEX students_code_hash_unique ON students(code_hash);
CREATE INDEX students_institution_classroom ON students(institution_id, classroom_id);
CREATE INDEX students_classroom ON students(classroom_id);
-- Demo creation inserts its user before the linked student in the same transaction.
ALTER TABLE users ADD CONSTRAINT users_student_id_students_id_fk
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE activities (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL, body jsonb NOT NULL, status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL,
  CONSTRAINT activities_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT activities_version_check CHECK (version > 0)
);
CREATE INDEX activities_institution_status ON activities(institution_id, status);
CREATE TABLE activity_versions (
  id text PRIMARY KEY, activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  version integer NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL,
  CONSTRAINT activity_versions_version_check CHECK (version > 0)
);
CREATE UNIQUE INDEX activity_version_unique ON activity_versions(activity_id, version);
-- Operational activity IDs may reference the shared catalog in code or custom activities.
-- They intentionally have no FK to the institution-owned activities table.
CREATE TABLE submissions (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  activity_id text NOT NULL, activity_version integer NOT NULL, score integer NOT NULL,
  correct integer NOT NULL, total integer NOT NULL, xp_earned integer NOT NULL DEFAULT 0,
  answers jsonb NOT NULL, fingerprint text NOT NULL, completed_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL, is_diagnostic smallint NOT NULL DEFAULT 0,
  CONSTRAINT submissions_score_check CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT submissions_counts_check CHECK (total > 0 AND correct BETWEEN 0 AND total),
  CONSTRAINT submissions_nonnegative_check CHECK (xp_earned >= 0 AND duration_seconds >= 0 AND activity_version > 0),
  CONSTRAINT submissions_is_diagnostic_check CHECK (is_diagnostic IN (0, 1))
);
CREATE INDEX submissions_student_time ON submissions(student_id, completed_at);
CREATE INDEX submissions_institution_time ON submissions(institution_id, completed_at);
CREATE INDEX submissions_student_activity ON submissions(student_id, activity_id);
CREATE TABLE xp_awards (
  id text PRIMARY KEY, student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  activity_id text NOT NULL, submission_id text NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  xp integer NOT NULL, CONSTRAINT xp_awards_xp_check CHECK (xp >= 0)
);
CREATE UNIQUE INDEX xp_once_per_activity ON xp_awards(student_id, activity_id);
CREATE INDEX xp_awards_submission ON xp_awards(submission_id);
CREATE TABLE assignments (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  classroom_id text NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  activity_id text NOT NULL, title text NOT NULL, due_date date NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX assignments_institution_due ON assignments(institution_id, due_date);
CREATE INDEX assignments_classroom ON assignments(classroom_id);
CREATE TABLE notes (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text text NOT NULL, type text NOT NULL, author text NOT NULL, created_at timestamptz NOT NULL,
  CONSTRAINT notes_type_check CHECK (type IN ('observation', 'intervention'))
);
CREATE INDEX notes_institution_time ON notes(institution_id, created_at);
CREATE INDEX notes_student ON notes(student_id);
CREATE TABLE notifications (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id text, title text NOT NULL, text text NOT NULL, read smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  CONSTRAINT notifications_read_check CHECK (read IN (0, 1))
);
CREATE INDEX notifications_institution_student_time ON notifications(institution_id, student_id, created_at);
CREATE TABLE recordings (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  activity_id text NOT NULL, object_key text NOT NULL, mime_type text NOT NULL, size integer NOT NULL,
  created_at timestamptz NOT NULL, CONSTRAINT recordings_size_check CHECK (size >= 0)
);
CREATE INDEX recordings_student_time ON recordings(student_id, created_at);
CREATE INDEX recordings_institution ON recordings(institution_id);
CREATE TABLE audit_logs (
  id text PRIMARY KEY, institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id text NOT NULL, action text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX audit_logs_institution_time ON audit_logs(institution_id, created_at);
CREATE INDEX audit_logs_user ON audit_logs(user_id);
CREATE TABLE rate_limits (
  key text PRIMARY KEY, count integer NOT NULL, reset_at bigint NOT NULL,
  CONSTRAINT rate_limits_values_check CHECK (count >= 0 AND reset_at >= 0)
);
CREATE INDEX rate_limits_reset ON rate_limits(reset_at);
COMMENT ON TABLE institutions IS 'Tenant schools; demonstration tenants use is_demo = 1.';
COMMENT ON TABLE users IS 'School staff, guardians and student access accounts; password hashes are preserved.';
COMMENT ON TABLE sessions IS 'Hashed session tokens, role, expiry and JSON accessibility preferences.';
COMMENT ON TABLE classrooms IS 'School classes and optional assigned teacher.';
COMMENT ON TABLE students IS 'Student profiles, access-code hashes and audio consent.';
COMMENT ON TABLE activities IS 'School-owned editable activities; the shared learning catalog is versioned in application code.';
COMMENT ON TABLE activity_versions IS 'Published immutable snapshots of custom activities.';
COMMENT ON TABLE submissions IS 'Learning attempts, scored answers, elapsed time and diagnostic markers.';
COMMENT ON TABLE xp_awards IS 'At most one XP award per student/activity.';
COMMENT ON TABLE assignments IS 'Activities assigned to a class with a due date.';
COMMENT ON TABLE notes IS 'Teacher observations and intervention notes.';
COMMENT ON TABLE notifications IS 'Notifications; optional student reference remains historical text as in the original schema.';
COMMENT ON TABLE recordings IS 'Audio metadata and object-storage keys; audio bytes remain in object storage.';
COMMENT ON TABLE audit_logs IS 'Historical actions; user IDs intentionally survive account removal.';
COMMENT ON TABLE rate_limits IS 'Operational throttling counters; reset_at is Unix milliseconds.';
