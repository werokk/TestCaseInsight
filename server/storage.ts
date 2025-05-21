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
  updateUser(
    id: number,
    data: Partial<schema.InsertUser>,
  ): Promise<schema.User | undefined>;
  getUsers(): Promise<schema.User[]>;
  updateUserLastLogin(id: number): Promise<void>;

  // Auth operations
  verifyCredentials(
    username: string,
    password: string,
  ): Promise<schema.User | undefined>;

  // Folder operations
  createFolder(folder: schema.InsertFolder): Promise<schema.Folder>;
  getFolder(id: number): Promise<schema.Folder | undefined>;
  getFolders(): Promise<schema.Folder[]>;
  updateFolder(
    id: number,
    data: Partial<schema.InsertFolder>,
  ): Promise<schema.Folder | undefined>;
  deleteFolder(id: number): Promise<boolean>;
  getTestCountByFolder(): Promise<{ folderId: number; testCount: number }[]>;

  // Test case operations
  createTestCase(testCase: schema.TestCaseWithSteps): Promise<schema.TestCase>;
  getTestCase(id: number): Promise<schema.TestCase | undefined>;
  getTestCaseWithSteps(
    id: number,
  ): Promise<
    { testCase: schema.TestCase; steps: schema.TestStep[] } | undefined
  >;
  getTestCases(filters?: {
    status?: string;
    folderId?: number;
  }): Promise<schema.TestCase[]>;
  updateTestCase(
    id: number,
    data: Partial<schema.InsertTestCase>,
    steps?: schema.InsertTestStep[],
  ): Promise<schema.TestCase | undefined>;
  deleteTestCase(id: number): Promise<boolean>;
  getTestCasesByFolder(folderId: number): Promise<schema.TestCase[]>;

  // Test steps operations
  getTestSteps(testCaseId: number): Promise<schema.TestStep[]>;

  // Test case version operations
  createTestVersion(
    version: schema.InsertTestVersion,
  ): Promise<schema.TestVersion>;
  getTestVersions(testCaseId: number): Promise<schema.TestVersion[]>;
  revertToVersion(testCaseId: number, version: number): Promise<boolean>;

  // Test case folders operations
  assignTestCaseToFolder(
    testCaseId: number,
    folderId: number,
  ): Promise<schema.TestCaseFolder>;
  removeTestCaseFromFolder(
    testCaseId: number,
    folderId: number,
  ): Promise<boolean>;
  getTestCaseFolders(testCaseId: number): Promise<schema.Folder[]>;

  // Test run operations
  createTestRun(testRun: schema.InsertTestRun): Promise<schema.TestRun>;
  getTestRun(id: number): Promise<schema.TestRun | undefined>;
  getTestRuns(): Promise<schema.TestRun[]>;
  updateTestRun(
    id: number,
    data: Partial<schema.InsertTestRun>,
  ): Promise<schema.TestRun | undefined>;
  completeTestRun(id: number): Promise<schema.TestRun | undefined>;

  // Test run results operations
  createTestRunResult(
    result: schema.InsertTestRunResult,
  ): Promise<schema.TestRunResult>;
  getTestRunResults(runId: number): Promise<schema.TestRunResult[]>;
  getTestStatusCounts(): Promise<{ status: string; count: number }[]>;

  // Bug operations
  createBug(bug: schema.InsertBug): Promise<schema.Bug>;
  getBug(id: number): Promise<schema.Bug | undefined>;
  getBugs(filters?: {
    status?: string;
    testCaseId?: number;
  }): Promise<schema.Bug[]>;
  updateBug(
    id: number,
    data: Partial<schema.InsertBug>,
  ): Promise<schema.Bug | undefined>;

  // Whiteboard operations
  createWhiteboard(
    whiteboard: schema.InsertWhiteboard,
  ): Promise<schema.Whiteboard>;
  getWhiteboard(id: number): Promise<schema.Whiteboard | undefined>;
  getWhiteboards(): Promise<schema.Whiteboard[]>;
  updateWhiteboard(
    id: number,
    data: Partial<schema.InsertWhiteboard>,
  ): Promise<schema.Whiteboard | undefined>;

  // AI Test Case operations
  saveAITestCase(
    aiTestCase: schema.InsertAITestCase,
  ): Promise<schema.AITestCase>;
  markAITestCaseAsImported(id: number): Promise<void>;
  getAITestCases(userId: number): Promise<schema.AITestCase[]>;

  // Activity log operations
  logActivity(log: schema.InsertActivityLog): Promise<schema.ActivityLog>;
  getRecentActivities(
    limit?: number,
  ): Promise<
    (schema.ActivityLog & {
      user: Pick<schema.User, "username" | "fullName">;
    })[]
  >;

  // Dashboard statistics
  getTestStatusStats(): Promise<{ status: string; count: number }[]>;
  getRecentTestCases(limit?: number): Promise<schema.TestCase[]>;
  getTestRunStats(): Promise<{
    totalRuns: number;
    avgDuration: number | null;
    passRate: number | null;
  }>;
}

const dbUrl = process.env.DATABASE_URL;
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set",
  );
}

console.log('Initializing Supabase with URL:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

export class SupabaseStorage implements IStorage {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    
    this.baseUrl = `${process.env.SUPABASE_URL}/rest/v1`;
    this.headers = {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  // User operations
  async getUser(id: number): Promise<schema.User | undefined> {
    const response = await fetch(`${this.baseUrl}/users?id=eq.${id}`, {
      headers: this.headers
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data[0];
  }

  async getUserByUsername(username: string): Promise<schema.User | undefined> {
    const { data, error } = await this.supabase
      .from("users")
      .select()
      .eq("username", username)
      .single();

    if (error) throw error;
    return data;
  }

  async getUserByEmail(email: string): Promise<schema.User | undefined> {
    const { data, error } = await this.supabase
      .from("users")
      .select()
      .eq("email", email)
      .single();

    if (error) throw error;
    return data;
  }

  async createUser(user: schema.InsertUser): Promise<schema.User> {
    const hashedUser = {
      ...user,
      password: await generateHash(user.password),
    };

    const { data, error } = await this.supabase
      .from("users")
      .insert([hashedUser])
      .select()
      .single();

    if (error) {
      console.error("Error inserting user:", error.message); // Log the error message
      throw error;
    }
    return data;
  }

  async updateUser(
    id: number,
    data: Partial<schema.InsertUser>,
  ): Promise<schema.User | undefined> {
    // If password is being updated, hash it
    if (data.password) {
      data.password = await generateHash(data.password);
    }

    const result = await this.db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async getUsers(): Promise<schema.User[]> {
    const { data, error } = await this.supabase
      .from("users")
      .select();
    if (error) throw error;
    return data;
  }

  async updateUserLastLogin(id: number): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({ lastLogin: new Date() })
      .eq("id", id);
    if (error) throw error;
  }

  // Auth operations
  async verifyCredentials(
    username: string,
    password: string,
  ): Promise<schema.User | undefined> {
    const user = await this.getUserByUsername(username);
    if (!user) return undefined;

    const passwordValid = await verifyHash(password, user.password);
    return passwordValid ? user : undefined;
  }

  // Folder operations
  async createFolder(folder: schema.InsertFolder): Promise<schema.Folder> {
    const result = await this.db
      .insert(schema.folders)
      .values(folder)
      .returning();
    return result[0];
  }

  async getFolder(id: number): Promise<schema.Folder | undefined> {
    const folders = await this.db
      .select()
      .from(schema.folders)
      .where(eq(schema.folders.id, id));
    return folders[0];
  }

  async getFolders(): Promise<schema.Folder[]> {
    return await this.db.select().from(schema.folders);
  }

  async updateFolder(
    id: number,
    data: Partial<schema.InsertFolder>,
  ): Promise<schema.Folder | undefined> {
    const result = await this.db
      .update(schema.folders)
      .set(data)
      .where(eq(schema.folders.id, id))
      .returning();
    return result[0];
  }

  async deleteFolder(id: number): Promise<boolean> {
    const result = await this.db
      .delete(schema.folders)
      .where(eq(schema.folders.id, id))
      .returning();
    return result.length > 0;
  }

  async getTestCountByFolder(): Promise<
    { folderId: number; testCount: number }[]
  > {
    const result = await this.db
      .select({
        folderId: schema.testCaseFolders.folderId,
        testCount: sql<number>`count(${schema.testCaseFolders.testCaseId})`.as(
          "count",
        ),
      })
      .from(schema.testCaseFolders)
      .groupBy(schema.testCaseFolders.folderId);

    return result;
  }

  async createTestCase(
    testCaseWithSteps: schema.TestCaseWithSteps,
  ): Promise<schema.TestCase> {
    const { steps, ...testCase } = testCaseWithSteps;

    console.log("Creating test case with data:", testCase);

    const response = await fetch(`${this.baseUrl}/test_cases`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        title: testCase.title,
        description: testCase.description,
        priority: testCase.priority,
        type: testCase.type,
        status: testCase.status || 'pending',
        expected_result: testCase.expectedResult,
        created_by: testCase.createdBy,
        created_at: new Date(),
        updated_at: new Date()
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Error inserting test case:", error);
      throw new Error(error);
    }

    const [newTestCase] = await response.json();
    console.log("Created test case:", newTestCase);

    if (steps && steps.length > 0) {
      const stepsWithTestCaseId = steps.map((step, index) => ({
        description: step.description,
        expected_result: step.expectedResult,
        test_case_id: newTestCase.id,
        step_number: index + 1,
      }));

      console.log("Inserting steps:", stepsWithTestCaseId);

      const stepsResponse = await fetch(`${this.baseUrl}/test_steps`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(stepsWithTestCaseId)
      });

      if (!stepsResponse.ok) {
        const error = await stepsResponse.text();
        console.error("Error inserting test steps:", error);
        throw new Error(error);
      }
    }

    return newTestCase;
  }

  async getTestCase(id: number): Promise<schema.TestCase | undefined> {
    const testCases = await this.db
      .select()
      .from(schema.testCases)
      .where(eq(schema.testCases.id, id));
    return testCases[0];
  }

  async getTestCaseWithSteps(
    id: number,
  ): Promise<
    { testCase: schema.TestCase; steps: schema.TestStep[] } | undefined
  > {
    const testCase = await this.getTestCase(id);
    if (!testCase) return undefined;

    const steps = await this.getTestSteps(id);
    return { testCase, steps };
  }

  async getTestCases(filters?: {
    status?: string;
    folderId?: number;
  }): Promise<schema.TestCase[]> {
    if (!filters) {
      return await this.db
        .select()
        .from(schema.testCases)
        .orderBy(desc(schema.testCases.updatedAt));
    }

    if (filters.status && filters.folderId) {
      // Get test cases by status and folder
      const folderTestCases = await this.db
        .select()
        .from(schema.testCases)
        .innerJoin(
          schema.testCaseFolders,
          eq(schema.testCases.id, schema.testCaseFolders.testCaseId),
        )
        .where(
          and(
            eq(schema.testCases.status, filters.status),
            eq(schema.testCaseFolders.folderId, filters.folderId),
          ),
        )
        .orderBy(desc(schema.testCases.updatedAt));

      return folderTestCases.map((row) => row.test_cases);
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

  async updateTestCase(
    id: number,
    data: Partial<schema.InsertTestCase>,
    steps?: schema.InsertTestStep[],
  ): Promise<schema.TestCase | undefined> {
    // Update the test case
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const result = await this.db
      .update(schema.testCases)
      .set(updateData)
      .where(eq(schema.testCases.id, id))
      .returning();

    const updatedTestCase = result[0];
    if (!updatedTestCase) return undefined;

    // If steps are provided, update them
    if (steps) {
      // Delete existing steps
      await this.db
        .delete(schema.testSteps)
        .where(eq(schema.testSteps.testCaseId, id));

      // Insert new steps
      const stepsWithTestCaseId = steps.map((step, index) => ({
        ...step,
        testCaseId: id,
        stepNumber: index + 1,
      }));

      await this.db.insert(schema.testSteps).values(stepsWithTestCaseId);
    }

    // Create a new version
    const currentVersion = updatedTestCase.version;
    await this.db
      .update(schema.testCases)
      .set({ version: currentVersion + 1 })
      .where(eq(schema.testCases.id, id));

    // Get the updated test case with new version
    const finalResult = await this.db
      .select()
      .from(schema.testCases)
      .where(eq(schema.testCases.id, id));

    // Store the version history
    await this.createTestVersion({
      testCaseId: id,
      version: currentVersion + 1,
      data: finalResult[0],
      createdBy: data.createdBy || finalResult[0].createdBy,
      changeComment: "Updated test case",
    });

    return finalResult[0];
  }

  async deleteTestCase(id: number): Promise<boolean> {
    // Delete steps first (foreign key constraint)
    await this.db
      .delete(schema.testSteps)
      .where(eq(schema.testSteps.testCaseId, id));

    // Delete test case folder associations
    await this.db
      .delete(schema.testCaseFolders)
      .where(eq(schema.testCaseFolders.testCaseId, id));

    // Delete versions
    await this.db
      .delete(schema.testVersions)
      .where(eq(schema.testVersions.testCaseId, id));

    // Delete the test case
    const result = await this.db
      .delete(schema.testCases)
      .where(eq(schema.testCases.id, id))
      .returning();

    return result.length > 0;
  }

  async getTestCasesByFolder(folderId: number): Promise<schema.TestCase[]> {
    const folderTestCases = await this.db
      .select()
      .from(schema.testCases)
      .innerJoin(
        schema.testCaseFolders,
        eq(schema.testCases.id, schema.testCaseFolders.testCaseId),
      )
      .where(eq(schema.testCaseFolders.folderId, folderId))
      .orderBy(desc(schema.testCases.updatedAt));

    return folderTestCases.map((row) => row.test_cases);
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
  async createTestVersion(
    version: schema.InsertTestVersion,
  ): Promise<schema.TestVersion> {
    const result = await this.db
      .insert(schema.testVersions)
      .values(version)
      .returning();
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
          eq(schema.testVersions.version, version),
        ),
      );

    if (versions.length === 0) return false;

    const versionData = versions[0];
    const testCaseData = versionData.data as schema.TestCase;

    // Update the test case with the version data
    const result = await this.db
      .update(schema.testCases)
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
        version: sql`${schema.testCases.version} + 1`,
      })
      .where(eq(schema.testCases.id, testCaseId))
      .returning();

    return result.length > 0;
  }

  // Test case folders operations
  

  async removeTestCaseFromFolder(
    testCaseId: number,
    folderId: number,
  ): Promise<boolean> {
    const result = await this.db
      .delete(schema.testCaseFolders)
      .where(
        and(
          eq(schema.testCaseFolders.testCaseId, testCaseId),
          eq(schema.testCaseFolders.folderId, folderId),
        ),
      )
      .returning();

    return result.length > 0;
  }

  async getTestCaseFolders(testCaseId: number): Promise<schema.Folder[]> {
    const folderAssociations = await this.db
      .select()
      .from(schema.testCaseFolders)
      .innerJoin(
        schema.folders,
        eq(schema.testCaseFolders.folderId, schema.folders.id),
      )
      .where(eq(schema.testCaseFolders.testCaseId, testCaseId));

    return folderAssociations.map((row) => row.folders);
  }

  // Test run operations
  async createTestRun(testRun: schema.InsertTestRun): Promise<schema.TestRun> {
    const result = await this.db
      .insert(schema.testRuns)
      .values(testRun)
      .returning();
    return result[0];
  }

  async getTestRun(id: number): Promise<schema.TestRun | undefined> {
    const testRuns = await this.db
      .select()
      .from(schema.testRuns)
      .where(eq(schema.testRuns.id, id));
    return testRuns[0];
  }

  async getTestRuns(): Promise<schema.TestRun[]> {
    return await this.db
      .select()
      .from(schema.testRuns)
      .orderBy(desc(schema.testRuns.startedAt));
  }

  async updateTestRun(
    id: number,
    data: Partial<schema.InsertTestRun>,
  ): Promise<schema.TestRun | undefined> {
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
        duration: durationSeconds,
      })
      .where(eq(schema.testRuns.id, id))
      .returning();

    return result[0];
  }

  // Test run results operations
  async createTestRunResult(
    result: schema.InsertTestRunResult,
  ): Promise<schema.TestRunResult> {
    const insertedResult = await this.db
      .insert(schema.testRunResults)
      .values(result)
      .returning();

    // Update test case status based on this result
    await this.db
      .update(schema.testCases)
      .set({
        status: result.status,
        lastRun: new Date(),
        updatedAt: new Date(),
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

  async getTestStatusCounts(): Promise<{ status: string; count: number }[]> {
    const result = await this.db
      .select({
        status: schema.testCases.status,
        count: sql<number>`count(*)`.as("count"),
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
    const bugs = await this.db
      .select()
      .from(schema.bugs)
      .where(eq(schema.bugs.id, id));
    return bugs[0];
  }

  async getBugs(filters?: {
    status?: string;
    testCaseId?: number;
  }): Promise<schema.Bug[]> {
    if (!filters) {
      return await this.db
        .select()
        .from(schema.bugs)
        .orderBy(desc(schema.bugs.reportedAt));
    }

    if (filters.status && filters.testCaseId) {
      return await this.db
        .select()
        .from(schema.bugs)
        .where(
          and(
            eq(schema.bugs.status, filters.status),
            eq(schema.bugs.testCaseId, filters.testCaseId),
          ),
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

  async updateBug(
    id: number,
    data: Partial<schema.InsertBug>,
  ): Promise<schema.Bug | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const result = await this.db
      .update(schema.bugs)
      .set(updateData)
      .where(eq(schema.bugs.id, id))
      .returning();

    return result[0];
  }

  // Whiteboard operations
  async createWhiteboard(
    whiteboard: schema.InsertWhiteboard,
  ): Promise<schema.Whiteboard> {
    const result = await this.db
      .insert(schema.whiteboards)
      .values(whiteboard)
      .returning();
    return result[0];
  }

  async getWhiteboard(id: number): Promise<schema.Whiteboard | undefined> {
    const whiteboards = await this.db
      .select()
      .from(schema.whiteboards)
      .where(eq(schema.whiteboards.id, id));
    return whiteboards[0];
  }

  async getWhiteboards(): Promise<schema.Whiteboard[]> {
    return await this.db
      .select()
      .from(schema.whiteboards)
      .orderBy(desc(schema.whiteboards.updatedAt));
  }

  async updateWhiteboard(
    id: number,
    data: Partial<schema.InsertWhiteboard>,
  ): Promise<schema.Whiteboard | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const result = await this.db
      .update(schema.whiteboards)
      .set(updateData)
      .where(eq(schema.whiteboards.id, id))
      .returning();

    return result[0];
  }

  // AI Test Case operations
  async saveAITestCase(
    aiTestCase: schema.InsertAITestCase,
  ): Promise<schema.AITestCase> {
    const result = await this.db
      .insert(schema.aiTestCases)
      .values(aiTestCase)
      .returning();
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
  async logActivity(
    log: schema.InsertActivityLog,
  ): Promise<schema.ActivityLog> {
    const result = await this.db
      .insert(schema.activityLogs)
      .values(log)
      .returning();
    return result[0];
  }

  async getRecentActivities(
    limit: number = 10,
  ): Promise<
    (schema.ActivityLog & {
      user: Pick<schema.User, "username" | "fullName">;
    })[]
  > {
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
        fullName: schema.users.fullName,
      })
      .from(schema.activityLogs)
      .innerJoin(schema.users, eq(schema.activityLogs.userId, schema.users.id))
      .orderBy(desc(schema.activityLogs.timestamp))
      .limit(limit);

    return activities.map((act) => ({
      id: act.id,
      userId: act.userId,
      action: act.action,
      entityType: act.entityType,
      entityId: act.entityId,
      details: act.details,
      timestamp: act.timestamp,
      user: {
        username: act.username,
        fullName: act.fullName,
      },
    }));
  }

  // Dashboard statistics
  async getTestStatusStats(): Promise<{ status: string; count: number }[]> {
    return await this.getTestStatusCounts();
  }

  async getRecentTestCases(limit: number = 5): Promise<schema.TestCase[]> {
    return await this.db
      .select()
      .from(schema.testCases)
      .orderBy(desc(schema.testCases.updatedAt))
      .limit(limit);
  }

  async getTestRunStats(): Promise<{
    totalRuns: number;
    avgDuration: number | null;
    passRate: number | null;
  }> {
    // Get total runs
    const totalRunsResult = await this.db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(schema.testRuns);

    const totalRuns = totalRunsResult[0]?.count || 0;

    // Get average duration of completed runs
    const avgDurationResult = await this.db
      .select({
        avgDuration: sql<number>`avg(${schema.testRuns.duration})`.as(
          "avg_duration",
        ),
      })
      .from(schema.testRuns)
      .where(eq(schema.testRuns.status, "completed"));

    const avgDuration = avgDurationResult[0]?.avgDuration || null;

    // Calculate pass rate
    const passedResults = await this.db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(schema.testRunResults)
      .where(eq(schema.testRunResults.status, "passed"));

    const totalResults = await this.db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(schema.testRunResults);

    const passedCount = passedResults[0]?.count || 0;
    const totalCount = totalResults[0]?.count || 0;

    const passRate = totalCount > 0 ? (passedCount / totalCount) * 100 : null;

    return {
      totalRuns,
      avgDuration,
      passRate,
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

  async createTestCase(testCaseWithSteps: schema.TestCaseWithSteps): Promise<schema.TestCase> {
    const { steps, ...testCase } = testCaseWithSteps;
    const id = this.testCaseId++;

    const newTestCase: schema.TestCase = {
      ...testCase,
      id,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRun: null
    };

    this.testCases.set(id, newTestCase);

    if (steps?.length) {
      this.testSteps.set(id, steps.map((step, index) => ({
        ...step,
        id: this.testStepId++,
        testCaseId: id,
        stepNumber: index + 1
      })));
    }

    return newTestCase;
  }

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
      isActive: true,
    });

    // Create some initial folders
    this.createFolder({
      name: "Regression Tests",
      description: "Tests for regression testing",
      createdBy: 1,
    });

    this.createFolder({
      name: "Smoke Tests",
      description: "Quick smoke tests",
      createdBy: 1,
    });

    this.createFolder({
      name: "Feature Tests",
      description: "Feature specific tests",
      createdBy: 1,
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
        {
          description: "Navigate to login page",
          expectedResult: "Login page is displayed",
          stepNumber: 1,
        },
        {
          description: "Enter valid username and password",
          expectedResult: "Credentials are accepted",
          stepNumber: 2,
        },
        {
          description: "Click on Login button",
          expectedResult: "User is redirected to dashboard",
          stepNumber: 3,
        },
      ],
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
      expectedResult:
        "Password reset email should be sent and new password should work",
      steps: [
        {
          description: "Navigate to login page",
          expectedResult: "Login page is displayed",
          stepNumber: 1,
        },
        {
          description: "Click on Forgot Password link",
          expectedResult: "Reset page is displayed",
          stepNumber: 2,
        },
        {
          description: "Enter valid email address",
          expectedResult: "Success message is shown",
          stepNumber: 3,
        },
        {
          description: "Check email and click reset link",
          expectedResult: "Reset form is displayed",
          stepNumber: 4,
        },
        {
          description: "Enter new password and confirm",
          expectedResult: "Password is updated",
          stepNumber: 5,
        },
      ],
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
        {
          description: "Navigate to registration page",
          expectedResult: "Registration form is displayed",
          stepNumber: 1,
        },
        {
          description: "Leave required fields empty and submit",
          expectedResult: "Validation errors are shown",
          stepNumber: 2,
        },
        {
          description: "Enter invalid format for email",
          expectedResult: "Email validation error is shown",
          stepNumber: 3,
        },
        {
          description: "Enter short password",
          expectedResult: "Password validation error is shown",
          stepNumber: 4,
        },
        {
          description: "Enter valid details and submit",
          expectedResult: "Registration is successful",
          stepNumber: 5,
        },
      ],
    });

    this.assignTestCaseToFolder(3, 2);
  }

  async getUser(id: number): Promise<schema.User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<schema.User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<schema.User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async createUser(user: schema.InsertUser): Promise<schema.User> {
    const id = this.userId++;
    const newUser: schema.User = {
      ...user,
      id,
      lastLogin: null,
    };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(
    id: number,
    data: Partial<schema.InsertUser>,
  ): Promise<schema.User | undefined> {
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

  async verifyCredentials(
    username: string,
    password: string,
  ): Promise<schema.User | undefined> {
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
      createdAt: new Date(),
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

  async updateFolder(
    id: number,
    data: Partial<schema.InsertFolder>,
  ): Promise<schema.Folder | undefined> {
    const folder = this.folders.get(id);
    if (!folder) return undefined;

    const updatedFolder = { ...folder, ...data };
    this.folders.set(id, updatedFolder);
    return updatedFolder;
  }

  async deleteFolder(id: number): Promise<boolean> {
    return this.folders.delete(id);
  }

  async getTestCountByFolder(): Promise<
    { folderId: number; testCount: number }[]
  > {
    const result: { folderId: number; testCount: number }[] = [];

    for (const [folderId, testCaseIds] of this.testCaseFolders.entries()) {
      result.push({
        folderId,
        testCount: testCaseIds.size,
      });
    }

    return result;
  }

  async assignTestCaseToFolder(
    testCaseId: number,
    folderId: number,
  ): Promise<schema.TestCaseFolder> {
    // Initialize folder set if it doesn't exist
    if (!this.testCaseFolders.has(folderId)) {
      this.testCaseFolders.set(folderId, new Set());
    }

    const folderSet = this.testCaseFolders.get(folderId)!;

    // Check if already assigned
    if (folderSet.has(testCaseId)) {
      return {
        id: this.testCaseFolderId++,
        testCaseId,
        folderId
      };
    }

    // Assign to folder
    folderSet.add(testCaseId);

    const result: schema.TestCaseFolder = {
      id: this.testCaseFolderId++,
      testCaseId,
      folderId
    };

    return result;
  }

  async removeTestCaseFromFolder(
    testCaseId: number,
    folderId: number,
  ): Promise<boolean> {
    let folderSet = this.testCaseFolders.get(folderId);

    if (!folderSet) {
      return false;
    }

    let result = folderSet.delete(testCaseId);
    return result;
  }

  async getTestCaseFolders(testCaseId: number): Promise<schema.Folder[]> {
    const folders: schema.Folder[] = [];

    for (let [folderId, testCaseIds] of this.testCaseFolders.entries()) {
      if (testCaseIds.has(testCaseId)) {
        let folder = this.folders.get(folderId);
        if (folder) {
          folders.push(folder);
        }
      }
    }

    return folders;
  }

  // Test run operations
  async createTestRun(testRun: schema.InsertTestRun): Promise<schema.TestRun> {
    const id = this.testRunId++;
    const newTestRun: schema.TestRun = {
      ...testRun,
      id,
      startedAt: new Date(),
      completedAt: null,
      duration: null,
    };
    this.testRuns.set(id, newTestRun);
    return newTestRun;
  }

  async getTestRun(id: number): Promise<schema.TestRun | undefined> {
    return this.testRuns.get(id);
  }

  async getTestRuns(): Promise<schema.TestRun[]> {
    return Array.from(this.testRuns.values()).sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    );
  }

  async updateTestRun(
    id: number,
    data: Partial<schema.InsertTestRun>,
  ): Promise<schema.TestRun | undefined> {
    const testRun = this.testRuns.get(id);
    if (!testRun) return undefined;

    const updatedTestRun = { ...testRun, ...data };
    this.testRuns.set(id, updatedTestRun);
    return updatedTestRun;
  }

  async completeTestRun(id: number): Promise<schema.TestRun | undefined> {
    const testRun = this.testRuns.get(id);
    if (!testRun) return undefined;

    const now = new Date();
    testRun.status = "completed";
    testRun.completedAt = now;
    testRun.duration = Math.floor(
      (now.getTime() - testRun.startedAt.getTime()) / 1000,
    );
    this.testRuns.set(id, testRun);
    return testRun;
  }

  // Test run results operations
  async createTestRunResult(
    result: schema.InsertTestRunResult,
  ): Promise<schema.TestRunResult> {
    const id = this.testRunResultId++;
    const newResult: schema.TestRunResult = {
      ...result,
      id,
      executedAt: new Date(),
    };

    if (!this.testRunResults.has(result.runId)) {
      this.testRunResults.set(result.runId, []);
    }

    this.testRunResults.get(result.runId)!.push(newResult);

    // Update test case status
    const testCase = this.testCases.get(result.testCaseId);
    if (testCase) {
      testCase.status = result.status;
      testCase.lastRun = new Date();
      this.testCases.set(result.testCaseId, testCase);
    }

    return newResult;
  }

  async getTestRunResults(runId: number): Promise<schema.TestRunResult[]> {
    return this.testRunResults.get(runId) || [];
  }

  async getTestStatusCounts(): Promise<{ status: string; count: number }[]> {
    const statusCounts: { status: string; count: number }[] = [];
    const statusMap: { [key: string]: number } = {};

    for (const testCase of this.testCases.values()) {
      if (statusMap[testCase.status]) {
        statusMap[testCase.status]++;
      } else {
        statusMap[testCase.status] = 1;
      }
    }

    for (const status in statusMap) {
      statusCounts.push({ status, count: statusMap[status] });
    }

    return statusCounts;
  }

  // Bug operations
  async createBug(bug: schema.InsertBug): Promise<schema.Bug> {
    const id = this.bugId++;
    const newBug: schema.Bug = {
      ...bug,
      id,
      reportedAt: new Date(),
      updatedAt: new Date(),
    };
    this.bugs.set(id, newBug);
    return newBug;
  }

  async getBug(id: number): Promise<schema.Bug | undefined> {
    return this.bugs.get(id);
  }

  async getBugs(filters?: {
    status?: string;
    testCaseId?: number;
  }): Promise<schema.Bug[]> {
    let bugs = Array.from(this.bugs.values());

    if (filters?.status) {
      bugs = bugs.filter((bug) => bug.status === filters.status);
    }

    if (filters?.testCaseId) {
      bugs = bugs.filter((bug) => bug.testCaseId === filters.testCaseId);
    }

    return bugs.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  }

  async updateBug(
    id: number,
    data: Partial<schema.InsertBug>,
  ): Promise<schema.Bug | undefined> {
    const bug = this.bugs.get(id);
    if (!bug) return undefined;

    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const updatedBug = { ...bug, ...updateData };
    this.bugs.set(id, updatedBug);
    return updatedBug;
  }

  // Whiteboard operations
  async createWhiteboard(
    whiteboard: schema.InsertWhiteboard,
  ): Promise<schema.Whiteboard> {
    const id = this.whiteboardId++;
    const newWhiteboard: schema.Whiteboard = {
      ...whiteboard,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.whiteboards.set(id, newWhiteboard);
    return newWhiteboard;
  }

  async getWhiteboard(id: number): Promise<schema.Whiteboard | undefined> {
    return this.whiteboards.get(id);
  }

  async getWhiteboards(): Promise<schema.Whiteboard[]> {
    return Array.from(this.whiteboards.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  async updateWhiteboard(
    id: number,
    data: Partial<schema.InsertWhiteboard>,
  ): Promise<schema.Whiteboard | undefined> {
    const whiteboard = this.whiteboards.get(id);
    if (!whiteboard) return undefined;

    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const updatedWhiteboard = { ...whiteboard, ...updateData };
    this.whiteboards.set(id, updatedWhiteboard);
    return updatedWhiteboard;
  }

  // AI Test Case operations
  async saveAITestCase(
    aiTestCase: schema.InsertAITestCase,
  ): Promise<schema.AITestCase> {
    const id = this.aiTestCaseId++;
    const newAITestCase: schema.AITestCase = {
      ...aiTestCase,
      id,
      createdAt: new Date(),
      imported: false,
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
      .filter((aiTestCase) => aiTestCase.createdBy === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Activity log operations
  async logActivity(
    log: schema.InsertActivityLog,
  ): Promise<schema.ActivityLog> {
    const id = this.activityLogId++;
    const newActivityLog: schema.ActivityLog = {
      ...log,
      id,
      timestamp: new Date(),
    };
    this.activityLogs.push(newActivityLog);
    return newActivityLog;
  }

  async getRecentActivities(
    limit: number = 10,
  ): Promise<
    (schema.ActivityLog & {
      user: Pick<schema.User, "username" | "fullName">;
    })[]
  > {
    return this.activityLogs
      .slice(0, limit)
      .map((log) => {
        const user = this.users.get(log.userId);
        return {
          ...log,
          user: {
            username: user?.username || "Unknown",
            fullName: user?.fullName || "Unknown",
          },
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getTestStatusStats(): Promise<{ status: string; count: number }[]> {
    return this.getTestStatusCounts();
  }

  async getRecentTestCases(limit: number = 5): Promise<schema.TestCase[]> {
    return Array.from(this.testCases.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async getTestRunStats(): Promise<{
    totalRuns: number;
    avgDuration: number | null;
    passRate: number | null;
  }> {
    const testRuns = Array.from(this.testRuns.values());
    const totalRuns = testRuns.length;

    const completedRuns = testRuns.filter(
      (run) => run.status === "completed" && run.duration !== null,
    );
    const avgDuration =
      completedRuns.length > 0
        ? completedRuns.reduce((sum, run) => sum + (run.duration || 0), 0) /
          completedRuns.length
        : null;

    let passedCount = 0;
    let totalCount = 0;

    for (const results of this.testRunResults.values()) {
      totalCount += results.length;
      passedCount += results.filter(
        (result) => result.status === "passed",
      ).length;
    }

    const passRate = totalCount > 0 ? (passedCount / totalCount) * 100 : null;

    return {
      totalRuns,
      avgDuration,
      passRate,
    };
  }
}

export const storage = new SupabaseStorage();