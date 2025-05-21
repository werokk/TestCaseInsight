import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { generateHash, verifyHash } from "./auth";

// Storage interfaces for all database entities
export interface IStorage {
  // User operations
  getUser(id: number): Promise<schema.User | undefined>;
  getUserByUsername(username: string): Promise<schema.User | undefined>;
  getUserByEmail(email: string): Promise<schema.User | undefined>;
  createUser(user: schema.InsertUser): Promise<schema.User>;
  updateUser(id: number, data: Partial<schema.InsertUser>): Promise<schema.User | undefined>;
  getUsers(): Promise<schema.User[]>;
  updateUserLastLogin(id: number): Promise<void>;
  
  // Auth operations
  verifyCredentials(username: string, password: string): Promise<schema.User | undefined>;

  // Folder operations
  createFolder(folder: schema.InsertFolder): Promise<schema.Folder>;
  getFolder(id: number): Promise<schema.Folder | undefined>;
  getFolders(): Promise<schema.Folder[]>;
  updateFolder(id: number, data: Partial<schema.InsertFolder>): Promise<schema.Folder | undefined>;
  deleteFolder(id: number): Promise<boolean>;
  getTestCountByFolder(): Promise<{ folderId: number, testCount: number }[]>;
  
  // Test case operations
  createTestCase(testCase: schema.TestCaseWithSteps): Promise<schema.TestCase>;
  getTestCase(id: number): Promise<schema.TestCase | undefined>;
  getTestCaseWithSteps(id: number): Promise<{ testCase: schema.TestCase, steps: schema.TestStep[] } | undefined>;
  getTestCases(filters?: { status?: string, folderId?: number }): Promise<schema.TestCase[]>;
  updateTestCase(id: number, data: Partial<schema.InsertTestCase>, steps?: schema.InsertTestStep[]): Promise<schema.TestCase | undefined>;
  deleteTestCase(id: number): Promise<boolean>;
  getTestCasesByFolder(folderId: number): Promise<schema.TestCase[]>;
  
  // Test steps operations
  getTestSteps(testCaseId: number): Promise<schema.TestStep[]>;
  
  // Test case version operations
  createTestVersion(version: schema.InsertTestVersion): Promise<schema.TestVersion>;
  getTestVersions(testCaseId: number): Promise<schema.TestVersion[]>;
  revertToVersion(testCaseId: number, version: number): Promise<boolean>;
  
  // Test case folders operations
  assignTestCaseToFolder(testCaseId: number, folderId: number): Promise<schema.TestCaseFolder>;
  removeTestCaseFromFolder(testCaseId: number, folderId: number): Promise<boolean>;
  getTestCaseFolders(testCaseId: number): Promise<schema.Folder[]>;
  
  // Test run operations
  createTestRun(testRun: schema.InsertTestRun): Promise<schema.TestRun>;
  getTestRun(id: number): Promise<schema.TestRun | undefined>;
  getTestRuns(): Promise<schema.TestRun[]>;
  updateTestRun(id: number, data: Partial<schema.InsertTestRun>): Promise<schema.TestRun | undefined>;
  completeTestRun(id: number): Promise<schema.TestRun | undefined>;
  
  // Test run results operations
  createTestRunResult(result: schema.InsertTestRunResult): Promise<schema.TestRunResult>;
  getTestRunResults(runId: number): Promise<schema.TestRunResult[]>;
  getTestStatusCounts(): Promise<{ status: string, count: number }[]>;
  
  // Bug operations
  createBug(bug: schema.InsertBug): Promise<schema.Bug>;
  getBug(id: number): Promise<schema.Bug | undefined>;
  getBugs(filters?: { status?: string, testCaseId?: number }): Promise<schema.Bug[]>;
  updateBug(id: number, data: Partial<schema.InsertBug>): Promise<schema.Bug | undefined>;
  
  // Whiteboard operations
  createWhiteboard(whiteboard: schema.InsertWhiteboard): Promise<schema.Whiteboard>;
  getWhiteboard(id: number): Promise<schema.Whiteboard | undefined>;
  getWhiteboards(): Promise<schema.Whiteboard[]>;
  updateWhiteboard(id: number, data: Partial<schema.InsertWhiteboard>): Promise<schema.Whiteboard | undefined>;
  
  // AI Test Case operations
  saveAITestCase(aiTestCase: schema.InsertAITestCase): Promise<schema.AITestCase>;
  markAITestCaseAsImported(id: number): Promise<void>;
  getAITestCases(userId: number): Promise<schema.AITestCase[]>;
  
  // Activity log operations
  logActivity(log: schema.InsertActivityLog): Promise<schema.ActivityLog>;
  getRecentActivities(limit?: number): Promise<(schema.ActivityLog & { user: Pick<schema.User, 'username' | 'fullName'> })[]>;
  
  // Dashboard statistics
  getTestStatusStats(): Promise<{ status: string, count: number }[]>;
  getRecentTestCases(limit?: number): Promise<schema.TestCase[]>;
  getTestRunStats(): Promise<{ 
    totalRuns: number, 
    avgDuration: number | null, 
    passRate: number | null 
  }>;
}

const dbUrl = process.env.DATABASE_URL;
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export class SupabaseStorage implements IStorage {
  private supabase;

  constructor() {
    this.supabase = supabase;
  }

  // User operations
  async getUser(id: number): Promise<schema.User | undefined> {
    const { data, error } = await this.supabase
      .from('users')
      .select()
      .eq('id', id)
      .single();
      
    if (error) throw error;
    return data;
  }

  async createTestCase(testCaseWithSteps: schema.TestCaseWithSteps): Promise<schema.TestCase> {
    const { steps, ...testCase } = testCaseWithSteps;
    
    // Insert test case
    const { data: newTestCase, error: testCaseError } = await this.supabase
      .from('test_cases')
      .insert([testCase])
      .select()
      .single();
      
    if (testCaseError) throw testCaseError;
    
    // Insert test steps if provided
    if (steps && steps.length > 0) {
      const stepsWithTestCaseId = steps.map((step, index) => ({
        ...step,
        testCaseId: newTestCase.id,
        stepNumber: index + 1
      }));
      
      const { error: stepsError } = await this.supabase
        .from('test_steps')
        .insert(stepsWithTestCaseId);
        
      if (stepsError) throw stepsError;
    }
    
    return newTestCase;
  }

  async getUserByUsername(username: string): Promise<schema.User | undefined> {
    const users = await this.db.select().from(schema.users).where(eq(schema.users.username, username));
    return users[0];
  }

  async getUserByEmail(email: string): Promise<schema.User | undefined> {
    const users = await this.db.select().from(schema.users).where(eq(schema.users.email, email));
    return users[0];
  }

  async createUser(user: schema.InsertUser): Promise<schema.User> {
    // Hash the password before storing
    const hashedUser = {
      ...user,
      password: await generateHash(user.password)
    };
    
    const result = await this.db.insert(schema.users).values(hashedUser).returning();
    return result[0];
  }

  async updateUser(id: number, data: Partial<schema.InsertUser>): Promise<schema.User | undefined> {
    // If password is being updated, hash it
    if (data.password) {
      data.password = await generateHash(data.password);
    }
    
    const result = await this.db.update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async getUsers(): Promise<schema.User[]> {
    return await this.db.select().from(schema.users);
  }

  async updateUserLastLogin(id: number): Promise<void> {
    await this.db.update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.id, id));
  }

  // Auth operations
  async verifyCredentials(username: string, password: string): Promise<schema.User | undefined> {
    const user = await this.getUserByUsername(username);
    if (!user) return undefined;
    
    const passwordValid = await verifyHash(password, user.password);
    return passwordValid ? user : undefined;
  }

  // Folder operations
  async createFolder(folder: schema.InsertFolder): Promise<schema.Folder> {
    const result = await this.db.insert(schema.folders).values(folder).returning();
    return result[0];
  }

  async getFolder(id: number): Promise<schema.Folder | undefined> {
    const folders = await this.db.select().from(schema.folders).where(eq(schema.folders.id, id));
    return folders[0];
  }

  async getFolders(): Promise<schema.Folder[]> {
    return await this.db.select().from(schema.folders);
  }

  async updateFolder(id: number, data: Partial<schema.InsertFolder>): Promise<schema.Folder | undefined> {
    const result = await this.db.update(schema.folders)
      .set(data)
      .where(eq(schema.folders.id, id))
      .returning();
    return result[0];
  }

  async deleteFolder(id: number): Promise<boolean> {
    const result = await this.db.delete(schema.folders).where(eq(schema.folders.id, id)).returning();
    return result.length > 0;
  }

  async getTestCountByFolder(): Promise<{ folderId: number; testCount: number; }[]> {
    const result = await this.db
      .select({
        folderId: schema.testCaseFolders.folderId,
        testCount: sql<number>`count(${schema.testCaseFolders.testCaseId})`.as('count')
      })
      .from(schema.testCaseFolders)
      .groupBy(schema.testCaseFolders.folderId);
      
    return result;
  }

  // Test case operations
  async createTestCase(testCaseWithSteps: schema.TestCaseWithSteps): Promise<schema.TestCase> {
    const { steps, ...testCase } = testCaseWithSteps;
    
    // Insert test case and get its ID
    const result = await this.db.insert(schema.testCases).values(testCase).returning();
    const newTestCase = result[0];
    
    // Insert test steps
    if (steps && steps.length > 0) {
      const stepsWithTestCaseId = steps.map((step, index) => ({
        ...step,
        testCaseId: newTestCase.id,
        stepNumber: index + 1
      }));
      
      await this.db.insert(schema.testSteps).values(stepsWithTestCaseId);
    }
    
    // Create initial version for version control
    await this.createTestVersion({
      testCaseId: newTestCase.id,
      version: 1,
      data: newTestCase,
      createdBy: testCase.createdBy,
      changeComment: "Initial version"
    });
    
    return newTestCase;
  }

  async getTestCase(id: number): Promise<schema.TestCase | undefined> {
    const testCases = await this.db.select().from(schema.testCases).where(eq(schema.testCases.id, id));
    return testCases[0];
  }

  async getTestCaseWithSteps(id: number): Promise<{ testCase: schema.TestCase; steps: schema.TestStep[]; } | undefined> {
    const testCase = await this.getTestCase(id);
    if (!testCase) return undefined;
    
    const steps = await this.getTestSteps(id);
    return { testCase, steps };
  }

  async getTestCases(filters?: { status?: string; folderId?: number; }): Promise<schema.TestCase[]> {
    if (!filters) {
      return await this.db.select().from(schema.testCases).orderBy(desc(schema.testCases.updatedAt));
    }
    
    if (filters.status && filters.folderId) {
      // Get test cases by status and folder
      const folderTestCases = await this.db
        .select()
        .from(schema.testCases)
        .innerJoin(schema.testCaseFolders, eq(schema.testCases.id, schema.testCaseFolders.testCaseId))
        .where(
          and(
            eq(schema.testCases.status, filters.status),
            eq(schema.testCaseFolders.folderId, filters.folderId)
          )
        )
        .orderBy(desc(schema.testCases.updatedAt));
        
      return folderTestCases.map(row => row.test_cases);
    } else if (filters.status) {
      // Get test cases by status only
      return await this.db
        .select()
        .from(schema.testCases)
        .where(eq(schema.testCases.status, filters.status))
        .orderBy(desc(schema.testCases.updatedAt));
    } else if (filters.folderId) {
      // Get test cases by folder only
      return await this.getTestCasesByFolder(filters.folderId);
    }
    
    return [];
  }

  async updateTestCase(id: number, data: Partial<schema.InsertTestCase>, steps?: schema.InsertTestStep[]): Promise<schema.TestCase | undefined> {
    // Update the test case
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    const result = await this.db.update(schema.testCases)
      .set(updateData)
      .where(eq(schema.testCases.id, id))
      .returning();
      
    const updatedTestCase = result[0];
    if (!updatedTestCase) return undefined;
    
    // If steps are provided, update them
    if (steps) {
      // Delete existing steps
      await this.db.delete(schema.testSteps).where(eq(schema.testSteps.testCaseId, id));
      
      // Insert new steps
      const stepsWithTestCaseId = steps.map((step, index) => ({
        ...step,
        testCaseId: id,
        stepNumber: index + 1
      }));
      
      await this.db.insert(schema.testSteps).values(stepsWithTestCaseId);
    }
    
    // Create a new version
    const currentVersion = updatedTestCase.version;
    await this.db.update(schema.testCases)
      .set({ version: currentVersion + 1 })
      .where(eq(schema.testCases.id, id));
      
    // Get the updated test case with new version
    const finalResult = await this.db.select().from(schema.testCases).where(eq(schema.testCases.id, id));
    
    // Store the version history
    await this.createTestVersion({
      testCaseId: id,
      version: currentVersion + 1,
      data: finalResult[0],
      createdBy: data.createdBy || finalResult[0].createdBy,
      changeComment: "Updated test case"
    });
    
    return finalResult[0];
  }

  async deleteTestCase(id: number): Promise<boolean> {
    // Delete steps first (foreign key constraint)
    await this.db.delete(schema.testSteps).where(eq(schema.testSteps.testCaseId, id));
    
    // Delete test case folder associations
    await this.db.delete(schema.testCaseFolders).where(eq(schema.testCaseFolders.testCaseId, id));
    
    // Delete versions
    await this.db.delete(schema.testVersions).where(eq(schema.testVersions.testCaseId, id));
    
    // Delete the test case
    const result = await this.db.delete(schema.testCases).where(eq(schema.testCases.id, id)).returning();
    
    return result.length > 0;
  }

  async getTestCasesByFolder(folderId: number): Promise<schema.TestCase[]> {
    const folderTestCases = await this.db
      .select()
      .from(schema.testCases)
      .innerJoin(schema.testCaseFolders, eq(schema.testCases.id, schema.testCaseFolders.testCaseId))
      .where(eq(schema.testCaseFolders.folderId, folderId))
      .orderBy(desc(schema.testCases.updatedAt));
      
    return folderTestCases.map(row => row.test_cases);
  }

  // Test steps operations
  async getTestSteps(testCaseId: number): Promise<schema.TestStep[]> {
    return await this.db
      .select()
      .from(schema.testSteps)
      .where(eq(schema.testSteps.testCaseId, testCaseId))
      .orderBy(schema.testSteps.stepNumber);
  }

  // Test case version operations
  async createTestVersion(version: schema.InsertTestVersion): Promise<schema.TestVersion> {
    const result = await this.db.insert(schema.testVersions).values(version).returning();
    return result[0];
  }

  async getTestVersions(testCaseId: number): Promise<schema.TestVersion[]> {
    return await this.db
      .select()
      .from(schema.testVersions)
      .where(eq(schema.testVersions.testCaseId, testCaseId))
      .orderBy(desc(schema.testVersions.version));
  }

  async revertToVersion(testCaseId: number, version: number): Promise<boolean> {
    // Get the specific version
    const versions = await this.db
      .select()
      .from(schema.testVersions)
      .where(
        and(
          eq(schema.testVersions.testCaseId, testCaseId),
          eq(schema.testVersions.version, version)
        )
      );
      
    if (versions.length === 0) return false;
    
    const versionData = versions[0];
    const testCaseData = versionData.data as schema.TestCase;
    
    // Update the test case with the version data
    const result = await this.db.update(schema.testCases)
      .set({
        title: testCaseData.title,
        description: testCaseData.description,
        status: testCaseData.status,
        priority: testCaseData.priority,
        type: testCaseData.type,
        assignedTo: testCaseData.assignedTo,
        expectedResult: testCaseData.expectedResult,
        updatedAt: new Date(),
        // Increment version number
        version: sql`${schema.testCases.version} + 1`
      })
      .where(eq(schema.testCases.id, testCaseId))
      .returning();
      
    return result.length > 0;
  }

  // Test case folders operations
  async assignTestCaseToFolder(testCaseId: number, folderId: number): Promise<schema.TestCaseFolder> {
    // Check if already assigned
    const existing = await this.db
      .select()
      .from(schema.testCaseFolders)
      .where(
        and(
          eq(schema.testCaseFolders.testCaseId, testCaseId),
          eq(schema.testCaseFolders.folderId, folderId)
        )
      );
      
    if (existing.length > 0) return existing[0];
    
    // Assign to folder
    const result = await this.db
      .insert(schema.testCaseFolders)
      .values({ testCaseId, folderId })
      .returning();
      
    return result[0];
  }

  async removeTestCaseFromFolder(testCaseId: number, folderId: number): Promise<boolean> {
    const result = await this.db
      .delete(schema.testCaseFolders)
      .where(
        and(
          eq(schema.testCaseFolders.testCaseId, testCaseId),
          eq(schema.testCaseFolders.folderId, folderId)
        )
      )
      .returning();
      
    return result.length > 0;
  }

  async getTestCaseFolders(testCaseId: number): Promise<schema.Folder[]> {
    const folderAssociations = await this.db
      .select()
      .from(schema.testCaseFolders)
      .innerJoin(schema.folders, eq(schema.testCaseFolders.folderId, schema.folders.id))
      .where(eq(schema.testCaseFolders.testCaseId, testCaseId));
      
    return folderAssociations.map(row => row.folders);
  }

  // Test run operations
  async createTestRun(testRun: schema.InsertTestRun): Promise<schema.TestRun> {
    const result = await this.db.insert(schema.testRuns).values(testRun).returning();
    return result[0];
  }

  async getTestRun(id: number): Promise<schema.TestRun | undefined> {
    const testRuns = await this.db.select().from(schema.testRuns).where(eq(schema.testRuns.id, id));
    return testRuns[0];
  }

  async getTestRuns(): Promise<schema.TestRun[]> {
    return await this.db
      .select()
      .from(schema.testRuns)
      .orderBy(desc(schema.testRuns.startedAt));
  }

  async updateTestRun(id: number, data: Partial<schema.InsertTestRun>): Promise<schema.TestRun | undefined> {
    const result = await this.db
      .update(schema.testRuns)
      .set(data)
      .where(eq(schema.testRuns.id, id))
      .returning();
      
    return result[0];
  }

  async completeTestRun(id: number): Promise<schema.TestRun | undefined> {
    const now = new Date();
    
    // Calculate duration
    const testRun = await this.getTestRun(id);
    if (!testRun) return undefined;
    
    const startTime = testRun.startedAt.getTime();
    const endTime = now.getTime();
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    
    const result = await this.db
      .update(schema.testRuns)
      .set({
        status: "completed",
        completedAt: now,
        duration: durationSeconds
      })
      .where(eq(schema.testRuns.id, id))
      .returning();
      
    return result[0];
  }

  // Test run results operations
  async createTestRunResult(result: schema.InsertTestRunResult): Promise<schema.TestRunResult> {
    const insertedResult = await this.db.insert(schema.testRunResults).values(result).returning();
    
    // Update test case status based on this result
    await this.db
      .update(schema.testCases)
      .set({
        status: result.status,
        lastRun: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.testCases.id, result.testCaseId));
      
    return insertedResult[0];
  }

  async getTestRunResults(runId: number): Promise<schema.TestRunResult[]> {
    return await this.db
      .select()
      .from(schema.testRunResults)
      .where(eq(schema.testRunResults.runId, runId))
      .orderBy(desc(schema.testRunResults.executedAt));
  }

  async getTestStatusCounts(): Promise<{ status: string; count: number; }[]> {
    const result = await this.db
      .select({
        status: schema.testCases.status,
        count: sql<number>`count(*)`.as('count')
      })
      .from(schema.testCases)
      .groupBy(schema.testCases.status);
      
    return result;
  }

  // Bug operations
  async createBug(bug: schema.InsertBug): Promise<schema.Bug> {
    const result = await this.db.insert(schema.bugs).values(bug).returning();
    return result[0];
  }

  async getBug(id: number): Promise<schema.Bug | undefined> {
    const bugs = await this.db.select().from(schema.bugs).where(eq(schema.bugs.id, id));
    return bugs[0];
  }

  async getBugs(filters?: { status?: string; testCaseId?: number; }): Promise<schema.Bug[]> {
    if (!filters) {
      return await this.db.select().from(schema.bugs).orderBy(desc(schema.bugs.reportedAt));
    }
    
    if (filters.status && filters.testCaseId) {
      return await this.db
        .select()
        .from(schema.bugs)
        .where(
          and(
            eq(schema.bugs.status, filters.status),
            eq(schema.bugs.testCaseId, filters.testCaseId)
          )
        )
        .orderBy(desc(schema.bugs.reportedAt));
    } else if (filters.status) {
      return await this.db
        .select()
        .from(schema.bugs)
        .where(eq(schema.bugs.status, filters.status))
        .orderBy(desc(schema.bugs.reportedAt));
    } else if (filters.testCaseId) {
      return await this.db
        .select()
        .from(schema.bugs)
        .where(eq(schema.bugs.testCaseId, filters.testCaseId))
        .orderBy(desc(schema.bugs.reportedAt));
    }
    
    return [];
  }

  async updateBug(id: number, data: Partial<schema.InsertBug>): Promise<schema.Bug | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    const result = await this.db
      .update(schema.bugs)
      .set(updateData)
      .where(eq(schema.bugs.id, id))
      .returning();
      
    return result[0];
  }

  // Whiteboard operations
  async createWhiteboard(whiteboard: schema.InsertWhiteboard): Promise<schema.Whiteboard> {
    const result = await this.db.insert(schema.whiteboards).values(whiteboard).returning();
    return result[0];
  }

  async getWhiteboard(id: number): Promise<schema.Whiteboard | undefined> {
    const whiteboards = await this.db.select().from(schema.whiteboards).where(eq(schema.whiteboards.id, id));
    return whiteboards[0];
  }

  async getWhiteboards(): Promise<schema.Whiteboard[]> {
    return await this.db
      .select()
      .from(schema.whiteboards)
      .orderBy(desc(schema.whiteboards.updatedAt));
  }

  async updateWhiteboard(id: number, data: Partial<schema.InsertWhiteboard>): Promise<schema.Whiteboard | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    const result = await this.db
      .update(schema.whiteboards)
      .set(updateData)
      .where(eq(schema.whiteboards.id, id))
      .returning();
      
    return result[0];
  }

  // AI Test Case operations
  async saveAITestCase(aiTestCase: schema.InsertAITestCase): Promise<schema.AITestCase> {
    const result = await this.db.insert(schema.aiTestCases).values(aiTestCase).returning();
    return result[0];
  }

  async markAITestCaseAsImported(id: number): Promise<void> {
    await this.db
      .update(schema.aiTestCases)
      .set({ imported: true })
      .where(eq(schema.aiTestCases.id, id));
  }

  async getAITestCases(userId: number): Promise<schema.AITestCase[]> {
    return await this.db
      .select()
      .from(schema.aiTestCases)
      .where(eq(schema.aiTestCases.createdBy, userId))
      .orderBy(desc(schema.aiTestCases.createdAt));
  }

  // Activity log operations
  async logActivity(log: schema.InsertActivityLog): Promise<schema.ActivityLog> {
    const result = await this.db.insert(schema.activityLogs).values(log).returning();
    return result[0];
  }

  async getRecentActivities(limit: number = 10): Promise<(schema.ActivityLog & { user: Pick<schema.User, "username" | "fullName"> })[]> {
    const activities = await this.db
      .select({
        id: schema.activityLogs.id,
        userId: schema.activityLogs.userId,
        action: schema.activityLogs.action,
        entityType: schema.activityLogs.entityType,
        entityId: schema.activityLogs.entityId,
        details: schema.activityLogs.details,
        timestamp: schema.activityLogs.timestamp,
        username: schema.users.username,
        fullName: schema.users.fullName
      })
      .from(schema.activityLogs)
      .innerJoin(schema.users, eq(schema.activityLogs.userId, schema.users.id))
      .orderBy(desc(schema.activityLogs.timestamp))
      .limit(limit);
      
    return activities.map(act => ({
      id: act.id,
      userId: act.userId,
      action: act.action,
      entityType: act.entityType,
      entityId: act.entityId,
      details: act.details,
      timestamp: act.timestamp,
      user: {
        username: act.username,
        fullName: act.fullName
      }
    }));
  }

  // Dashboard statistics
  async getTestStatusStats(): Promise<{ status: string; count: number; }[]> {
    return await this.getTestStatusCounts();
  }

  async getRecentTestCases(limit: number = 5): Promise<schema.TestCase[]> {
    return await this.db
      .select()
      .from(schema.testCases)
      .orderBy(desc(schema.testCases.updatedAt))
      .limit(limit);
  }

  async getTestRunStats(): Promise<{ totalRuns: number; avgDuration: number | null; passRate: number | null; }> {
    // Get total runs
    const totalRunsResult = await this.db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(schema.testRuns);
      
    const totalRuns = totalRunsResult[0]?.count || 0;
    
    // Get average duration of completed runs
    const avgDurationResult = await this.db
      .select({ avgDuration: sql<number>`avg(${schema.testRuns.duration})`.as('avg_duration') })
      .from(schema.testRuns)
      .where(eq(schema.testRuns.status, 'completed'));
      
    const avgDuration = avgDurationResult[0]?.avgDuration || null;
    
    // Calculate pass rate
    const passedResults = await this.db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(schema.testRunResults)
      .where(eq(schema.testRunResults.status, 'passed'));
      
    const totalResults = await this.db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(schema.testRunResults);
      
    const passedCount = passedResults[0]?.count || 0;
    const totalCount = totalResults[0]?.count || 0;
    
    const passRate = totalCount > 0 ? (passedCount / totalCount) * 100 : null;
    
    return {
      totalRuns,
      avgDuration,
      passRate
    };
  }
}

// For in-memory testing
export class MemStorage implements IStorage {
  private users: Map<number, schema.User>;
  private folders: Map<number, schema.Folder>;
  private testCases: Map<number, schema.TestCase>;
  private testSteps: Map<number, schema.TestStep[]>;
  private testVersions: Map<number, schema.TestVersion[]>;
  private testCaseFolders: Map<number, Set<number>>;
  private testRuns: Map<number, schema.TestRun>;
  private testRunResults: Map<number, schema.TestRunResult[]>;
  private bugs: Map<number, schema.Bug>;
  private whiteboards: Map<number, schema.Whiteboard>;
  private aiTestCases: Map<number, schema.AITestCase>;
  private activityLogs: schema.ActivityLog[];
  
  private userId: number = 1;
  private folderId: number = 1;
  private testCaseId: number = 1;
  private testStepId: number = 1;
  private testVersionId: number = 1;
  private testCaseFolderId: number = 1;
  private testRunId: number = 1;
  private testRunResultId: number = 1;
  private bugId: number = 1;
  private whiteboardId: number = 1;
  private aiTestCaseId: number = 1;
  private activityLogId: number = 1;

  constructor() {
    this.users = new Map();
    this.folders = new Map();
    this.testCases = new Map();
    this.testSteps = new Map();
    this.testVersions = new Map();
    this.testCaseFolders = new Map();
    this.testRuns = new Map();
    this.testRunResults = new Map();
    this.bugs = new Map();
    this.whiteboards = new Map();
    this.aiTestCases = new Map();
    this.activityLogs = [];

    // Create a system owner user
    this.createUser({
      username: "admin",
      email: "admin@example.com",
      password: "password",
      fullName: "System Admin",
      role: "system_owner",
      isActive: true
    });
    
    // Create some initial folders
    this.createFolder({
      name: "Regression Tests",
      description: "Tests for regression testing",
      createdBy: 1
    });
    
    this.createFolder({
      name: "Smoke Tests",
      description: "Quick smoke tests",
      createdBy: 1
    });
    
    this.createFolder({
      name: "Feature Tests",
      description: "Feature specific tests",
      createdBy: 1
    });
    
    // Create some initial test cases
    const testCase1 = this.createTestCase({
      title: "User Login Verification",
      description: "Verify that users can login with valid credentials",
      status: "passed",
      priority: "high",
      type: "functional",
      assignedTo: 1,
      createdBy: 1,
      expectedResult: "User should be logged in successfully",
      steps: [
        { description: "Navigate to login page", expectedResult: "Login page is displayed", stepNumber: 1 },
        { description: "Enter valid username and password", expectedResult: "Credentials are accepted", stepNumber: 2 },
        { description: "Click on Login button", expectedResult: "User is redirected to dashboard", stepNumber: 3 }
      ]
    });
    
    this.assignTestCaseToFolder(1, 1);
    
    const testCase2 = this.createTestCase({
      title: "Password Reset Flow",
      description: "Test the complete password reset workflow",
      status: "failed",
      priority: "critical",
      type: "functional",
      assignedTo: 1,
      createdBy: 1,
      expectedResult: "Password reset email should be sent and new password should work",
      steps: [
        { description: "Navigate to login page", expectedResult: "Login page is displayed", stepNumber: 1 },
        { description: "Click on Forgot Password link", expectedResult: "Reset page is displayed", stepNumber: 2 },
        { description: "Enter valid email address", expectedResult: "Success message is shown", stepNumber: 3 },
        { description: "Check email and click reset link", expectedResult: "Reset form is displayed", stepNumber: 4 },
        { description: "Enter new password and confirm", expectedResult: "Password is updated", stepNumber: 5 }
      ]
    });
    
    this.assignTestCaseToFolder(2, 1);
    
    this.createTestCase({
      title: "User Registration Form Validation",
      description: "Validate all form fields during user registration",
      status: "pending",
      priority: "medium",
      type: "functional",
      assignedTo: 1,
      createdBy: 1,
      expectedResult: "Form should validate all fields correctly",
      steps: [
        { description: "Navigate to registration page", expectedResult: "Registration form is displayed", stepNumber: 1 },
        { description: "Leave required fields empty and submit", expectedResult: "Validation errors are shown", stepNumber: 2 },
        { description: "Enter invalid format for email", expectedResult: "Email validation error is shown", stepNumber: 3 },
        { description: "Enter short password", expectedResult: "Password validation error is shown", stepNumber: 4 },
        { description: "Enter valid details and submit", expectedResult: "Registration is successful", stepNumber: 5 }
      ]
    });
    
    this.assignTestCaseToFolder(3, 2);
  }

  async getUser(id: number): Promise<schema.User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<schema.User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<schema.User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(user: schema.InsertUser): Promise<schema.User> {
    const id = this.userId++;
    const newUser: schema.User = {
      ...user,
      id,
      lastLogin: null
    };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(id: number, data: Partial<schema.InsertUser>): Promise<schema.User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...data };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUsers(): Promise<schema.User[]> {
    return Array.from(this.users.values());
  }

  async updateUserLastLogin(id: number): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastLogin = new Date();
      this.users.set(id, user);
    }
  }

  async verifyCredentials(username: string, password: string): Promise<schema.User | undefined> {
    const user = await this.getUserByUsername(username);
    if (user && user.password === password) {
      return user;
    }
    return undefined;
  }

  async createFolder(folder: schema.InsertFolder): Promise<schema.Folder> {
    const id = this.folderId++;
    const newFolder: schema.Folder = {
      ...folder,
      id,
      createdAt: new Date()
    };
    this.folders.set(id, newFolder);
    return newFolder;
  }

  async getFolder(id: number): Promise<schema.Folder | undefined> {
    return this.folders.get(id);
  }

  async getFolders(): Promise<schema.Folder[]> {
    return Array.from(this.folders.values());
  }

  async updateFolder(id: number, data: Partial<schema.InsertFolder>): Promise<schema.Folder | undefined> {
    const folder = this.folders.get(id);
    if (!folder) return undefined;
    
    const updatedFolder = { ...folder, ...data };
    this.folders.set(id, updatedFolder);
    return updatedFolder;
  }

  async deleteFolder(id: number): Promise<boolean> {
    return this.folders.delete(id);
  }

  async getTestCountByFolder(): Promise<{ folderId: number; testCount: number; }[]> {
    const result: { folderId: number; testCount: number; }[] = [];
    
    for (const [folderId, testCaseIds] of this.testCaseFolders.entries()) {
      result.push({
        folderId,
        testCount: testCaseIds.size
      });
    }
    
    return result;
  }

  async createTestCase(testCaseWithSteps: schema.TestCaseWithSteps): Promise<schema.TestCase> {
    const { steps, ...testCaseData } = testCaseWithSteps;
    const id = this.testCaseId++;
    const now = new Date();
    
    const newTestCase: schema.TestCase = {
      ...testCaseData,
      id,
      createdAt: now,
      updatedAt: now,
      lastRun: null,
      version: 1
    };
    
    this.testCases.set(id, newTestCase);
    
    // Handle test steps
    if (steps && steps.length > 0) {
      const testSteps: schema.TestStep[] = steps.map((step, index) => ({
        id: this.testStepId++,
        testCaseId: id,
        stepNumber: index + 1,
        description: step.description,
        expectedResult: step.expectedResult
      }));
      
      this.testSteps.set(id, testSteps);
    }
    
    // Create initial version
    this.createTestVersion({
      testCaseId: id,
      version: 1,
      data: newTestCase,
      createdBy: testCaseData.createdBy,
      changeComment: "Initial version"
    });
    
    return newTestCase;
  }

  async getTestCase(id: number): Promise<schema.TestCase | undefined> {
    return this.testCases.get(id);
  }

  async getTestCaseWithSteps(id: number): Promise<{ testCase: schema.TestCase; steps: schema.TestStep[]; } | undefined> {
    const testCase = this.testCases.get(id);
    if (!testCase) return undefined;
    
    const steps = this.testSteps.get(id) || [];
    return { testCase, steps };
  }

  async getTestCases(filters?: { status?: string; folderId?: number; }): Promise<schema.TestCase[]> {
    if (!filters) {
      return Array.from(this.testCases.values())
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    
    let testCases = Array.from(this.testCases.values());
    
    if (filters.status) {
      testCases = testCases.filter(tc => tc.status === filters.status);
    }
    
    if (filters.folderId) {
      const folderTestCaseIds = this.testCaseFolders.get(filters.folderId);
      if (folderTestCaseIds) {
        testCases = testCases.filter(tc => folderTestCaseIds.has(tc.id));
      } else {
        testCases = [];
      }
    }
    
    return testCases.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateTestCase(id: number, data: Partial<schema.InsertTestCase>, steps?: schema.InsertTestStep[]): Promise<schema.TestCase | undefined> {
    const testCase = this.testCases.get(id);
    if (!testCase) return undefined;
    
    const now = new Date();
    const updatedTestCase: schema.TestCase = {
      ...testCase,
      ...data,
      updatedAt: now,
      version: testCase.version + 1
    };
    
    this.testCases.set(id, updatedTestCase);
    
    // Update steps if provided
    if (steps) {
      const newSteps: schema.TestStep[] = steps.map((step, index) => ({
        id: this.testStepId++,
        testCaseId: id,
        stepNumber: index + 1,
        description: step.description,
        expectedResult: step.expectedResult
      }));
      
      this.testSteps.set(id, newSteps);
    }
    
    // Create new version entry
    this.createTestVersion({
      testCaseId: id,
      version: updatedTestCase.version,
      data: updatedTestCase,
      createdBy: data.createdBy || updatedTestCase.createdBy,
      changeComment: "Updated test case"
    });
    
    return updatedTestCase;
  }

  async deleteTestCase(id: number): Promise<boolean> {
    // Remove test steps
    this.testSteps.delete(id);
    
    // Remove from folders
    for (const [folderId, testCaseIds] of this.testCaseFolders.entries()) {
      testCaseIds.delete(id);
    }
    
    // Remove versions
    const versionsMap = new Map<number, schema.TestVersion[]>();
    for (const [testCaseId, versions] of this.testVersions.entries()) {
      if (testCaseId !== id) {
        versionsMap.set(testCaseId, versions);
      }
    }
    this.testVersions = versionsMap;
    
    // Delete test case
    return this.testCases.delete(id);
  }

  async getTestCasesByFolder(folderId: number): Promise<schema.TestCase[]> {
    const folderTestCaseIds = this.testCaseFolders.get(folderId);
    if (!folderTestCaseIds) return [];
    
    return Array.from(folderTestCaseIds)
      .map(id => this.testCases.get(id))
      .filter((tc): tc is schema.TestCase => tc !== undefined)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getTestSteps(testCaseId: number): Promise<schema.TestStep[]> {
    return this.testSteps.get(testCaseId) || [];
  }

  async createTestVersion(version: schema.InsertTestVersion): Promise<schema.TestVersion> {
    const id = this.testVersionId++;
    const newVersion: schema.TestVersion = {
      ...version,
      id,
      createdAt: new Date()
    };
    
    const versions = this.testVersions.get(version.testCaseId) || [];
    versions.push(newVersion);
    this.testVersions.set(version.testCaseId, versions);
    
    return newVersion;
  }

  async getTestVersions(testCaseId: number): Promise<schema.TestVersion[]> {
    const versions = this.testVersions.get(testCaseId) || [];
    return [...versions].sort((a, b) => b.version - a.version);
  }

  async revertToVersion(testCaseId: number, version: number): Promise<boolean> {
    const versions = this.testVersions.get(testCaseId) || [];
    const targetVersion = versions.find(v => v.version === version);
    
    if (!targetVersion) return false;
    
    const testCaseData = targetVersion.data as schema.TestCase;
    const currentTestCase = this.testCases.get(testCaseId);
    
    if (!currentTestCase) return false;
    
    const updatedTestCase: schema.TestCase = {
      ...currentTestCase,
      title: testCaseData.title,
      description: testCaseData.description,
      status: testCaseData.status,
      priority: testCaseData.priority,
      type: testCaseData.type,
      assignedTo: testCaseData.assignedTo,
      expectedResult: testCaseData.expectedResult,
      updatedAt: new Date(),
      version: currentTestCase.version + 1
    };
    
    this.testCases.set(testCaseId, updatedTestCase);
    
    // Create new version entry
    this.createTestVersion({
      testCaseId: testCaseId,
      version: updatedTestCase.version,
      data: updatedTestCase,
      createdBy: currentTestCase.createdBy,
      changeComment: `Reverted to version ${version}`
    });
    
    return true;
  }

  async assignTestCaseToFolder(testCaseId: number, folderId: number): Promise<schema.TestCaseFolder> {
    let folderTestCaseIds = this.testCaseFolders.get(folderId);
    
    if (!folderTestCaseIds) {
      folderTestCaseIds = new Set<number>();
      this.testCaseFolders.set(folderId, folderTestCaseIds);
    }
    
    folderTestCaseIds.add(testCaseId);
    
    const id = this.testCaseFolderId++;
    return { id, testCaseId, folderId };
  }

  async removeTestCaseFromFolder(testCaseId: number, folderId: number): Promise<boolean> {
    const folderTestCaseIds = this.testCaseFolders.get(folderId);
    if (!folderTestCaseIds) return false;
    
    return folderTestCaseIds.delete(testCaseId);
  }

  async getTestCaseFolders(testCaseId: number): Promise<schema.Folder[]> {
    const folderIds: number[] = [];
    
    for (const [folderId, testCaseIds] of this.testCaseFolders.entries()) {
      if (testCaseIds.has(testCaseId)) {
        folderIds.push(folderId);
      }
    }
    
    return folderIds
      .map(id => this.folders.get(id))
      .filter((f): f is schema.Folder => f !== undefined);
  }

  async createTestRun(testRun: schema.InsertTestRun): Promise<schema.TestRun> {
    const id = this.testRunId++;
    const now = new Date();
    
    const newTestRun: schema.TestRun = {
      ...testRun,
      id,
      startedAt: now,
      completedAt: null,
      duration: null
    };
    
    this.testRuns.set(id, newTestRun);
    return newTestRun;
  }

  async getTestRun(id: number): Promise<schema.TestRun | undefined> {
    return this.testRuns.get(id);
  }

  async getTestRuns(): Promise<schema.TestRun[]> {
    return Array.from(this.testRuns.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async updateTestRun(id: number, data: Partial<schema.InsertTestRun>): Promise<schema.TestRun | undefined> {
    const testRun = this.testRuns.get(id);
    if (!testRun) return undefined;
    
    const updatedTestRun: schema.TestRun = { ...testRun, ...data };
    this.testRuns.set(id, updatedTestRun);
    
    return updatedTestRun;
  }

  async completeTestRun(id: number): Promise<schema.TestRun | undefined> {
    const testRun = this.testRuns.get(id);
    if (!testRun) return undefined;
    
    const now = new Date();
    const startTime = testRun.startedAt.getTime();
    const endTime = now.getTime();
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    
    const updatedTestRun: schema.TestRun = {
      ...testRun,
      status: "completed",
      completedAt: now,
      duration: durationSeconds
    };
    
    this.testRuns.set(id, updatedTestRun);
    return updatedTestRun;
  }

  async createTestRunResult(result: schema.InsertTestRunResult): Promise<schema.TestRunResult> {
    const id = this.testRunResultId++;
    const now = new Date();
    
    const newResult: schema.TestRunResult = {
      ...result,
      id,
      executedAt: now,
      duration: null
    };
    
    const results = this.testRunResults.get(result.runId) || [];
    results.push(newResult);
    this.testRunResults.set(result.runId, results);
    
    // Update test case status
    const testCase = this.testCases.get(result.testCaseId);
    if (testCase) {
      testCase.status = result.status;
      testCase.lastRun = now;
      testCase.updatedAt = now;
      this.testCases.set(result.testCaseId, testCase);
    }
    
    return newResult;
  }

  async getTestRunResults(runId: number): Promise<schema.TestRunResult[]> {
    return this.testRunResults.get(runId) || [];
  }

  async getTestStatusCounts(): Promise<{ status: string; count: number; }[]> {
    const statusCounts = new Map<string, number>();
    
    for (const testCase of this.testCases.values()) {
      const count = statusCounts.get(testCase.status) || 0;
      statusCounts.set(testCase.status, count + 1);
    }
    
    return Array.from(statusCounts.entries()).map(([status, count]) => ({
      status,
      count
    }));
  }

  async createBug(bug: schema.InsertBug): Promise<schema.Bug> {
    const id = this.bugId++;
    const now = new Date();
    
    const newBug: schema.Bug = {
      ...bug,
      id,
      reportedAt: now,
      updatedAt: now
    };
    
    this.bugs.set(id, newBug);
    return newBug;
  }

  async getBug(id: number): Promise<schema.Bug | undefined> {
    return this.bugs.get(id);
  }

  async getBugs(filters?: { status?: string; testCaseId?: number; }): Promise<schema.Bug[]> {
    let bugs = Array.from(this.bugs.values());
    
    if (filters) {
      if (filters.status) {
        bugs = bugs.filter(bug => bug.status === filters.status);
      }
      
      if (filters.testCaseId) {
        bugs = bugs.filter(bug => bug.testCaseId === filters.testCaseId);
      }
    }
    
    return bugs.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  }

  async updateBug(id: number, data: Partial<schema.InsertBug>): Promise<schema.Bug | undefined> {
    const bug = this.bugs.get(id);
    if (!bug) return undefined;
    
    const updatedBug: schema.Bug = {
      ...bug,
      ...data,
      updatedAt: new Date()
    };
    
    this.bugs.set(id, updatedBug);
    return updatedBug;
  }

  async createWhiteboard(whiteboard: schema.InsertWhiteboard): Promise<schema.Whiteboard> {
    const id = this.whiteboardId++;
    const now = new Date();
    
    const newWhiteboard: schema.Whiteboard = {
      ...whiteboard,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.whiteboards.set(id, newWhiteboard);
    return newWhiteboard;
  }

  async getWhiteboard(id: number): Promise<schema.Whiteboard | undefined> {
    return this.whiteboards.get(id);
  }

  async getWhiteboards(): Promise<schema.Whiteboard[]> {
    return Array.from(this.whiteboards.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateWhiteboard(id: number, data: Partial<schema.InsertWhiteboard>): Promise<schema.Whiteboard | undefined> {
    const whiteboard = this.whiteboards.get(id);
    if (!whiteboard) return undefined;
    
    const updatedWhiteboard: schema.Whiteboard = {
      ...whiteboard,
      ...data,
      updatedAt: new Date()
    };
    
    this.whiteboards.set(id, updatedWhiteboard);
    return updatedWhiteboard;
  }

  async saveAITestCase(aiTestCase: schema.InsertAITestCase): Promise<schema.AITestCase> {
    const id = this.aiTestCaseId++;
    
    const newAITestCase: schema.AITestCase = {
      ...aiTestCase,
      id,
      createdAt: new Date(),
      imported: false
    };
    
    this.aiTestCases.set(id, newAITestCase);
    return newAITestCase;
  }

  async markAITestCaseAsImported(id: number): Promise<void> {
    const aiTestCase = this.aiTestCases.get(id);
    if (aiTestCase) {
      aiTestCase.imported = true;
      this.aiTestCases.set(id, aiTestCase);
    }
  }

  async getAITestCases(userId: number): Promise<schema.AITestCase[]> {
    return Array.from(this.aiTestCases.values())
      .filter(atc => atc.createdBy === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async logActivity(log: schema.InsertActivityLog): Promise<schema.ActivityLog> {
    const id = this.activityLogId++;
    
    const newActivityLog: schema.ActivityLog = {
      ...log,
      id,
      timestamp: new Date()
    };
    
    this.activityLogs.push(newActivityLog);
    return newActivityLog;
  }

  async getRecentActivities(limit: number = 10): Promise<(schema.ActivityLog & { user: Pick<schema.User, "username" | "fullName"> })[]> {
    return this.activityLogs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(activity => {
        const user = this.users.get(activity.userId);
        return {
          ...activity,
          user: {
            username: user?.username || "",
            fullName: user?.fullName || ""
          }
        };
      });
  }

  async getTestStatusStats(): Promise<{ status: string; count: number; }[]> {
    return this.getTestStatusCounts();
  }

  async getRecentTestCases(limit: number = 5): Promise<schema.TestCase[]> {
    return Array.from(this.testCases.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async getTestRunStats(): Promise<{ totalRuns: number; avgDuration: number | null; passRate: number | null; }> {
    const testRuns = Array.from(this.testRuns.values());
    const totalRuns = testRuns.length;
    
    const completedRuns = testRuns.filter(run => run.status === "completed" && run.duration !== null);
    const avgDuration = completedRuns.length > 0
      ? completedRuns.reduce((sum, run) => sum + (run.duration || 0), 0) / completedRuns.length
      : null;
    
    let passedCount = 0;
    let totalCount = 0;
    
    for (const results of this.testRunResults.values()) {
      totalCount += results.length;
      passedCount += results.filter(result => result.status === "passed").length;
    }
    
    const passRate = totalCount > 0 ? (passedCount / totalCount) * 100 : null;
    
    return {
      totalRuns,
      avgDuration,
      passRate
    };
  }
}

export const storage = process.env.NODE_ENV === 'production' 
  ? new SupabaseStorage() 
  : new MemStorage();
