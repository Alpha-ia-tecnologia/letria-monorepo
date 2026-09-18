ALTER TABLE `classrooms` ADD `teacher_user_id` text REFERENCES users(id);
--> statement-breakpoint
UPDATE classrooms SET teacher_user_id = (SELECT u.id FROM users u WHERE u.institution_id = classrooms.institution_id ORDER BY u.created_at LIMIT 1) WHERE institution_id IN (SELECT id FROM institutions WHERE is_demo = 1);