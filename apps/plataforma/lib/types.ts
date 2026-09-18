export type Role = "student" | "teacher" | "guardian" | "admin";
export type Answers = Record<string, string | string[]>;
export interface PlatformSession { userId: string; name: string; email?: string; role: Role; isDemo: boolean; institutionId: string; institutionName: string; studentId: string | null }
export interface Classroom { id: string; name: string; grade: string; teacherName: string; teacherUserId: string | null; createdAt: string }
export interface StaffMember { id: string; name: string; email?: string; role: "teacher" | "guardian" | "admin"; studentId: string | null }
export interface Student { id: string; name: string; classroomId: string | null; classroomName: string; avatar: string; grade: string; consentAudio: boolean; createdAt: string }
export interface Submission { id: string; studentId: string; activityId: string; activityVersion: number; score: number; correct: number; total: number; xpEarned: number; answers: Answers; completedAt: string; durationSeconds: number; isDiagnostic: boolean }
export interface Assignment { id: string; classroomId: string; activityId: string; title: string; dueDate: string; createdAt: string }
export interface TeacherNote { id: string; studentId: string; text: string; type: "observation" | "intervention"; author: string; createdAt: string }
export interface PlatformNotification { id: string; title: string; text: string; read: boolean; createdAt: string }
export interface CustomActivity { id: string; title: string; description: string; worldId: number; skill: string; type: "choice" | "order" | "multi" | "match"; durationMinutes: number; xp: number; questions: { id: string; type: "choice" | "order" | "multi" | "match"; prompt: string; stimulus?: string; options: string[]; matches?: string[]; answer: string | string[]; explanation: string; audioText?: string; visual?: string }[]; status: "draft" | "published"; version: number; createdAt: string }
export interface AudioRecording { id: string; studentId: string; activityId: string; createdAt: string; size: number; mimeType: string }
export interface PlatformData { session: PlatformSession; staff: StaffMember[]; classrooms: Classroom[]; students: Student[]; submissions: Submission[]; assignments: Assignment[]; notes: TeacherNote[]; notifications: PlatformNotification[]; customActivities: CustomActivity[]; recordings: AudioRecording[]; settings: { sound: boolean; reducedMotion: boolean; fontScale: number }; serverTime: string }
export type PlatformAction =
  | { action: "switchRole"; role: Role }
  | { action: "register"; name: string; email: string; password: string; institutionName: string }
  | { action: "login"; email: string; password: string }
  | { action: "studentLogin"; code: string }
  | { action: "logout" }
  | { action: "createClassroom"; name: string; grade: string; teacherName?: string; teacherUserId?: string | null }
  | { action: "updateClassroom"; id: string; name: string; grade: string; teacherUserId?: string | null }
  | { action: "deleteClassroom"; id: string }
  | { action: "createStudent"; name: string; classroomId?: string; avatar?: string; grade?: string }
  | { action: "updateStudent"; id: string; name: string; classroomId?: string; avatar?: string; grade?: string }
  | { action: "deleteStudent"; id: string }
  | { action: "resetStudentCode"; studentId: string }
  | { action: "submit"; submissionId: string; activityId: string; activityVersion?: number; practice?: boolean; answers: Answers; durationSeconds: number; studentId?: string }
  | { action: "diagnostic"; submissionId: string; answers: Answers; durationSeconds: number; studentId?: string }
  | { action: "assignActivity"; classroomId: string; activityId: string; dueDate: string; title?: string }
  | { action: "deleteAssignment"; id: string }
  | { action: "saveActivity"; activity: Partial<CustomActivity> & Pick<CustomActivity, "title" | "questions"> }
  | { action: "publishActivity"; id: string }
  | { action: "deleteActivity"; id: string }
  | { action: "addNote"; studentId: string; text: string; type?: "observation" | "intervention" }
  | { action: "deleteNote"; id: string }
  | { action: "setConsent"; studentId: string; consent: boolean }
  | { action: "readNotifications" }
  | { action: "saveSettings"; sound?: boolean; reducedMotion?: boolean; fontScale?: number }
  | { action: "deleteRecording"; id: string }
  | { action: "createUser"; name: string; email: string; password: string; role: "teacher" | "guardian"; studentId?: string };
export interface ApiResult { voicePreparation?: "queued" | "partial" | "unavailable" | "disabled"; ok: boolean; data?: PlatformData; error?: string; code?: string; submission?: Submission; accessCode?: string }
