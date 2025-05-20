import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, foreignKey, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  avatar: text("avatar"),
  role: text("role").notNull().default("tester"), // system_owner, admin, tester, viewer
  lastLogin: timestamp("last_login"),
  isActive: boolean("is_active").notNull().default(true),
});

// Folders
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Test Cases
export const testCases = pgTable("test_cases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // passed, failed, pending, blocked
  priority: text("priority").notNull().default("medium"), // critical, high, medium, low
  type: text("type").notNull().default("functional"), // functional, performance, security, usability
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastRun: timestamp("last_run"),
  expectedResult: text("expected_result"),
  version: integer("version").notNull().default(1),
});

// Test Steps
export const testSteps = pgTable("test_steps", {
  id: serial("id").primaryKey(),
  testCaseId: integer("test_case_id").notNull().references(() => testCases.id),
  stepNumber: integer("step_number").notNull(),
  description: text("description").notNull(),
  expectedResult: text("expected_result"),
});

// Test Case Version History
export const testVersions = pgTable("test_versions", {
  id: serial("id").primaryKey(),
  testCaseId: integer("test_case_id").notNull().references(() => testCases.id),
  version: integer("version").notNull(),
  data: jsonb("data").notNull(), // Full snapshot of the test case at this version
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  changeComment: text("change_comment"),
});

// Test Case Folders Association (many-to-many)
export const testCaseFolders = pgTable("test_case_folders", {
  id: serial("id").primaryKey(),
  testCaseId: integer("test_case_id").notNull().references(() => testCases.id),
  folderId: integer("folder_id").notNull().references(() => folders.id),
}, (table) => {
  return {
    testCaseFolderIdx: uniqueIndex("test_case_folder_idx").on(table.testCaseId, table.folderId),
  };
});

// Test Runs
export const testRuns = pgTable("test_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // in_progress, completed, aborted
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  executedBy: integer("executed_by").notNull().references(() => users.id),
  duration: integer("duration"), // in seconds
});

// Test Run Results
export const testRunResults = pgTable("test_run_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => testRuns.id),
  testCaseId: integer("test_case_id").notNull().references(() => testCases.id),
  status: text("status").notNull(), // passed, failed, blocked, skipped
  notes: text("notes"),
  executedBy: integer("executed_by").notNull().references(() => users.id),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  duration: integer("duration"), // in seconds
});

// Bugs
export const bugs = pgTable("bugs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // open, in_progress, fixed, closed
  severity: text("severity").notNull().default("medium"), // critical, high, medium, low
  testCaseId: integer("test_case_id").references(() => testCases.id),
  testRunResultId: integer("test_run_result_id").references(() => testRunResults.id),
  reportedBy: integer("reported_by").notNull().references(() => users.id),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  assignedTo: integer("assigned_to").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Whiteboard Sessions
export const whiteboards = pgTable("whiteboards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: jsonb("content").default([]),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI Generated Test Cases
export const aiTestCases = pgTable("ai_test_cases", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  response: jsonb("response").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  imported: boolean("imported").notNull().default(false),
});

// User Activity Log
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // create_test, update_test, delete_test, run_test, etc.
  entityType: text("entity_type").notNull(), // test_case, test_run, bug, folder, etc.
  entityId: integer("entity_id").notNull(),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastLogin: true });
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true });
export const insertTestCaseSchema = createInsertSchema(testCases).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true, 
  lastRun: true, 
  version: true 
});
export const insertTestStepSchema = createInsertSchema(testSteps).omit({ id: true });
export const insertTestVersionSchema = createInsertSchema(testVersions).omit({ id: true, createdAt: true });
export const insertTestCaseFolderSchema = createInsertSchema(testCaseFolders).omit({ id: true });
export const insertTestRunSchema = createInsertSchema(testRuns).omit({ 
  id: true, 
  startedAt: true, 
  completedAt: true, 
  duration: true 
});
export const insertTestRunResultSchema = createInsertSchema(testRunResults).omit({ 
  id: true, 
  executedAt: true, 
  duration: true 
});
export const insertBugSchema = createInsertSchema(bugs).omit({ 
  id: true, 
  reportedAt: true, 
  updatedAt: true 
});
export const insertWhiteboardSchema = createInsertSchema(whiteboards).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export const insertAITestCaseSchema = createInsertSchema(aiTestCases).omit({ 
  id: true, 
  createdAt: true, 
  imported: true 
});
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ 
  id: true, 
  timestamp: true 
});

// Types for insert
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type InsertTestStep = z.infer<typeof insertTestStepSchema>;
export type InsertTestVersion = z.infer<typeof insertTestVersionSchema>;
export type InsertTestCaseFolder = z.infer<typeof insertTestCaseFolderSchema>;
export type InsertTestRun = z.infer<typeof insertTestRunSchema>;
export type InsertTestRunResult = z.infer<typeof insertTestRunResultSchema>;
export type InsertBug = z.infer<typeof insertBugSchema>;
export type InsertWhiteboard = z.infer<typeof insertWhiteboardSchema>;
export type InsertAITestCase = z.infer<typeof insertAITestCaseSchema>;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// Types for select
export type User = typeof users.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type TestStep = typeof testSteps.$inferSelect;
export type TestVersion = typeof testVersions.$inferSelect;
export type TestCaseFolder = typeof testCaseFolders.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type TestRunResult = typeof testRunResults.$inferSelect;
export type Bug = typeof bugs.$inferSelect;
export type Whiteboard = typeof whiteboards.$inferSelect;
export type AITestCase = typeof aiTestCases.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Extended schemas for validation
export const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const testCaseWithStepsSchema = insertTestCaseSchema.extend({
  steps: z.array(insertTestStepSchema.omit({ testCaseId: true })),
});

export type TestCaseWithSteps = z.infer<typeof testCaseWithStepsSchema>;

export const aiGenerateSchema = z.object({
  prompt: z.string().min(10, "Prompt must be at least 10 characters"),
  testType: z.string(),
  count: z.number().min(1).max(20),
});

export type AIGenerateRequest = z.infer<typeof aiGenerateSchema>;
