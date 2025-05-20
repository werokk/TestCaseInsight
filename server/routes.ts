import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import * as schema from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import MemoryStore from "memorystore";
import { generateAITestCases } from "./ai";

// Configure session store
const MemoryStoreFactory = MemoryStore(session);

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time collaboration
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Set up session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "test-sphere-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
      store: new MemoryStoreFactory({
        checkPeriod: 86400000 // 24 hours
      })
    })
  );
  
  // Set up passport for authentication
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Configure passport local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.verifyCredentials(username, password);
        
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        
        if (!user.isActive) {
          return done(null, false, { message: "Account is deactivated" });
        }
        
        await storage.updateUserLastLogin(user.id);
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );
  
  // Serialize and deserialize user for sessions
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });
  
  // Authentication middleware
  const isAuthenticated = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
  
  // Role-based access control middleware
  const hasRole = (roles: string[]) => {
    return (req: Request, res: Response, next: Function) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = req.user as schema.User;
      
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      next();
    };
  };
  
  const adminRoles = ["system_owner", "admin"];
  const testRoles = ["system_owner", "admin", "tester"];
  const viewRoles = ["system_owner", "admin", "tester", "viewer"];
  
  // Error handling utility
  const handleZodError = (error: unknown) => {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return { message: validationError.message };
    }
    return { message: String(error) };
  };
  
  // Authentication Routes
  app.post("/api/auth/login", (req, res, next) => {
    try {
      const result = schema.loginSchema.parse(req.body);
      
      passport.authenticate("local", (err: Error, user: schema.User, info: any) => {
        if (err) {
          return next(err);
        }
        
        if (!user) {
          return res.status(401).json({ message: info.message || "Authentication failed" });
        }
        
        req.logIn(user, (err) => {
          if (err) {
            return next(err);
          }
          
          // Log login activity
          storage.logActivity({
            userId: user.id,
            action: "user_login",
            entityType: "user",
            entityId: user.id,
            details: null
          });
          
          return res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            avatar: user.avatar
          });
        });
      })(req, res, next);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = schema.registerSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      // Create user
      const { confirmPassword, ...userData } = data;
      
      // Set default role as tester unless specified otherwise
      if (!userData.role) {
        userData.role = "tester";
      }
      
      const user = await storage.createUser(userData);
      
      // Log register activity
      storage.logActivity({
        userId: user.id,
        action: "user_register",
        entityType: "user",
        entityId: user.id,
        details: null
      });
      
      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      });
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.post("/api/auth/logout", (req, res) => {
    // Log logout activity if user is authenticated
    if (req.isAuthenticated()) {
      const user = req.user as schema.User;
      storage.logActivity({
        userId: user.id,
        action: "user_logout",
        entityType: "user",
        entityId: user.id,
        details: null
      });
    }
    
    req.logout(() => {
      res.json({ message: "Logged out successfully" });
    });
  });
  
  app.get("/api/auth/me", isAuthenticated, (req, res) => {
    const user = req.user as schema.User;
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatar: user.avatar
    });
  });
  
  // User Management Routes
  app.get("/api/users", isAuthenticated, hasRole(adminRoles), async (_req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  
  app.post("/api/users", isAuthenticated, hasRole(adminRoles), async (req, res) => {
    try {
      const data = schema.insertUserSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      const user = await storage.createUser(data);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "create_user",
        entityType: "user",
        entityId: user.id,
        details: { username: user.username, role: user.role }
      });
      
      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar,
        isActive: user.isActive
      });
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.put("/api/users/:id", isAuthenticated, hasRole(adminRoles), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent changing username to one that already exists
      if (req.body.username && req.body.username !== user.username) {
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      // Prevent changing email to one that already exists
      if (req.body.email && req.body.email !== user.email) {
        const existingEmail = await storage.getUserByEmail(req.body.email);
        if (existingEmail) {
          return res.status(400).json({ message: "Email already exists" });
        }
      }
      
      // Update user
      const updatedUser = await storage.updateUser(userId, req.body);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "update_user",
        entityType: "user",
        entityId: userId,
        details: { changes: req.body }
      });
      
      res.json({
        id: updatedUser!.id,
        username: updatedUser!.username,
        email: updatedUser!.email,
        fullName: updatedUser!.fullName,
        role: updatedUser!.role,
        avatar: updatedUser!.avatar,
        isActive: updatedUser!.isActive
      });
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  // Folder Routes
  app.get("/api/folders", isAuthenticated, async (_req, res) => {
    try {
      const folders = await storage.getFolders();
      
      // Get test count for each folder
      const testCounts = await storage.getTestCountByFolder();
      const testCountMap = new Map(testCounts.map(tc => [tc.folderId, tc.testCount]));
      
      const foldersWithTestCount = folders.map(folder => ({
        ...folder,
        testCount: testCountMap.get(folder.id) || 0
      }));
      
      res.json(foldersWithTestCount);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });
  
  app.post("/api/folders", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      const data = schema.insertFolderSchema.parse({
        ...req.body,
        createdBy: currentUser.id
      });
      
      const folder = await storage.createFolder(data);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "create_folder",
        entityType: "folder",
        entityId: folder.id,
        details: { name: folder.name }
      });
      
      res.status(201).json(folder);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.put("/api/folders/:id", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const folderId = parseInt(req.params.id);
      
      // Check if folder exists
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      // Update folder
      const updatedFolder = await storage.updateFolder(folderId, req.body);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "update_folder",
        entityType: "folder",
        entityId: folderId,
        details: { changes: req.body }
      });
      
      res.json(updatedFolder);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.delete("/api/folders/:id", isAuthenticated, hasRole(adminRoles), async (req, res) => {
    try {
      const folderId = parseInt(req.params.id);
      
      // Check if folder exists
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      const deleted = await storage.deleteFolder(folderId);
      
      if (deleted) {
        // Log activity
        const currentUser = req.user as schema.User;
        storage.logActivity({
          userId: currentUser.id,
          action: "delete_folder",
          entityType: "folder",
          entityId: folderId,
          details: { name: folder.name }
        });
        
        res.json({ message: "Folder deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete folder" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });
  
  // Test Case Routes
  app.get("/api/testcases", isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string;
      const folderId = req.query.folderId ? parseInt(req.query.folderId as string) : undefined;
      
      const filters: { status?: string, folderId?: number } = {};
      if (status && status !== 'all') {
        filters.status = status;
      }
      if (folderId) {
        filters.folderId = folderId;
      }
      
      const testCases = await storage.getTestCases(Object.keys(filters).length > 0 ? filters : undefined);
      res.json(testCases);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test cases" });
    }
  });
  
  app.get("/api/testcases/:id", isAuthenticated, async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      const testCaseWithSteps = await storage.getTestCaseWithSteps(testCaseId);
      
      if (!testCaseWithSteps) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      res.json(testCaseWithSteps);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test case" });
    }
  });
  
  app.post("/api/testcases", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      
      const data = schema.testCaseWithStepsSchema.parse({
        ...req.body,
        createdBy: currentUser.id
      });
      
      const testCase = await storage.createTestCase(data);
      
      // Assign to folder if specified
      if (req.body.folderId) {
        await storage.assignTestCaseToFolder(testCase.id, parseInt(req.body.folderId));
      }
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "create_test_case",
        entityType: "test_case",
        entityId: testCase.id,
        details: { title: testCase.title }
      });
      
      res.status(201).json(testCase);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.put("/api/testcases/:id", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      const currentUser = req.user as schema.User;
      
      // Extract steps from request if present
      const { steps, ...testCaseData } = req.body;
      
      // Update test case with steps if provided
      const updatedTestCase = await storage.updateTestCase(
        testCaseId, 
        { ...testCaseData, createdBy: currentUser.id }, 
        steps
      );
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "update_test_case",
        entityType: "test_case",
        entityId: testCaseId,
        details: { title: updatedTestCase!.title, version: updatedTestCase!.version }
      });
      
      res.json(updatedTestCase);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.delete("/api/testcases/:id", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      const deleted = await storage.deleteTestCase(testCaseId);
      
      if (deleted) {
        // Log activity
        const currentUser = req.user as schema.User;
        storage.logActivity({
          userId: currentUser.id,
          action: "delete_test_case",
          entityType: "test_case",
          entityId: testCaseId,
          details: { title: testCase.title }
        });
        
        res.json({ message: "Test case deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete test case" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete test case" });
    }
  });
  
  // Test Case Folders Routes
  app.post("/api/testcases/:id/folders", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      const folderId = parseInt(req.body.folderId);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      // Check if folder exists
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      const result = await storage.assignTestCaseToFolder(testCaseId, folderId);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "assign_test_case_to_folder",
        entityType: "test_case",
        entityId: testCaseId,
        details: { folderId, folderName: folder.name }
      });
      
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to assign test case to folder" });
    }
  });
  
  app.delete("/api/testcases/:id/folders/:folderId", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      const folderId = parseInt(req.params.folderId);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      // Check if folder exists
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      const removed = await storage.removeTestCaseFromFolder(testCaseId, folderId);
      
      if (removed) {
        // Log activity
        const currentUser = req.user as schema.User;
        storage.logActivity({
          userId: currentUser.id,
          action: "remove_test_case_from_folder",
          entityType: "test_case",
          entityId: testCaseId,
          details: { folderId, folderName: folder.name }
        });
        
        res.json({ message: "Test case removed from folder successfully" });
      } else {
        res.status(500).json({ message: "Failed to remove test case from folder" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to remove test case from folder" });
    }
  });
  
  app.get("/api/testcases/:id/folders", isAuthenticated, async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      const folders = await storage.getTestCaseFolders(testCaseId);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test case folders" });
    }
  });
  
  // Version Control Routes
  app.get("/api/testcases/:id/versions", isAuthenticated, async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      const versions = await storage.getTestVersions(testCaseId);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test case versions" });
    }
  });
  
  app.post("/api/testcases/:id/revert", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const testCaseId = parseInt(req.params.id);
      const version = parseInt(req.body.version);
      
      // Check if test case exists
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ message: "Test case not found" });
      }
      
      const reverted = await storage.revertToVersion(testCaseId, version);
      
      if (reverted) {
        // Get updated test case
        const updatedTestCase = await storage.getTestCase(testCaseId);
        
        // Log activity
        const currentUser = req.user as schema.User;
        storage.logActivity({
          userId: currentUser.id,
          action: "revert_test_case",
          entityType: "test_case",
          entityId: testCaseId,
          details: { fromVersion: testCase.version, toVersion: version }
        });
        
        res.json(updatedTestCase);
      } else {
        res.status(500).json({ message: "Failed to revert test case to specified version" });
      }
    } catch (error) {
      res.status(400).json({ message: "Invalid request data" });
    }
  });
  
  // Test Run Routes
  app.get("/api/runs", isAuthenticated, async (_req, res) => {
    try {
      const runs = await storage.getTestRuns();
      res.json(runs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test runs" });
    }
  });
  
  app.post("/api/runs", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      
      const data = schema.insertTestRunSchema.parse({
        ...req.body,
        executedBy: currentUser.id
      });
      
      const testRun = await storage.createTestRun(data);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "create_test_run",
        entityType: "test_run",
        entityId: testRun.id,
        details: { name: testRun.name }
      });
      
      res.status(201).json(testRun);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.get("/api/runs/:id", isAuthenticated, async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      const run = await storage.getTestRun(runId);
      
      if (!run) {
        return res.status(404).json({ message: "Test run not found" });
      }
      
      res.json(run);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test run" });
    }
  });
  
  app.put("/api/runs/:id/complete", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      // Check if run exists
      const run = await storage.getTestRun(runId);
      if (!run) {
        return res.status(404).json({ message: "Test run not found" });
      }
      
      const completedRun = await storage.completeTestRun(runId);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "complete_test_run",
        entityType: "test_run",
        entityId: runId,
        details: { name: run.name }
      });
      
      res.json(completedRun);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete test run" });
    }
  });
  
  // Test Run Results Routes
  app.get("/api/runs/:id/results", isAuthenticated, async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      // Check if run exists
      const run = await storage.getTestRun(runId);
      if (!run) {
        return res.status(404).json({ message: "Test run not found" });
      }
      
      const results = await storage.getTestRunResults(runId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test run results" });
    }
  });
  
  app.post("/api/runs/:id/results", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      // Check if run exists
      const run = await storage.getTestRun(runId);
      if (!run) {
        return res.status(404).json({ message: "Test run not found" });
      }
      
      const currentUser = req.user as schema.User;
      
      const data = schema.insertTestRunResultSchema.parse({
        ...req.body,
        runId,
        executedBy: currentUser.id
      });
      
      const result = await storage.createTestRunResult(data);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "record_test_result",
        entityType: "test_result",
        entityId: result.id,
        details: { testCaseId: result.testCaseId, status: result.status }
      });
      
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  // Bug Routes
  app.get("/api/bugs", isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string;
      const testCaseId = req.query.testCaseId ? parseInt(req.query.testCaseId as string) : undefined;
      
      const filters: { status?: string, testCaseId?: number } = {};
      if (status) {
        filters.status = status;
      }
      if (testCaseId) {
        filters.testCaseId = testCaseId;
      }
      
      const bugs = await storage.getBugs(Object.keys(filters).length > 0 ? filters : undefined);
      res.json(bugs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bugs" });
    }
  });
  
  app.post("/api/bugs", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      
      const data = schema.insertBugSchema.parse({
        ...req.body,
        reportedBy: currentUser.id
      });
      
      const bug = await storage.createBug(data);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "create_bug",
        entityType: "bug",
        entityId: bug.id,
        details: { title: bug.title, testCaseId: bug.testCaseId }
      });
      
      res.status(201).json(bug);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.put("/api/bugs/:id", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const bugId = parseInt(req.params.id);
      
      // Check if bug exists
      const bug = await storage.getBug(bugId);
      if (!bug) {
        return res.status(404).json({ message: "Bug not found" });
      }
      
      const updatedBug = await storage.updateBug(bugId, req.body);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "update_bug",
        entityType: "bug",
        entityId: bugId,
        details: { changes: req.body }
      });
      
      res.json(updatedBug);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  // Whiteboard Routes
  app.get("/api/whiteboards", isAuthenticated, async (_req, res) => {
    try {
      const whiteboards = await storage.getWhiteboards();
      res.json(whiteboards);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch whiteboards" });
    }
  });
  
  app.post("/api/whiteboards", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      
      const data = schema.insertWhiteboardSchema.parse({
        ...req.body,
        createdBy: currentUser.id
      });
      
      const whiteboard = await storage.createWhiteboard(data);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "create_whiteboard",
        entityType: "whiteboard",
        entityId: whiteboard.id,
        details: { name: whiteboard.name }
      });
      
      res.status(201).json(whiteboard);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.get("/api/whiteboards/:id", isAuthenticated, async (req, res) => {
    try {
      const whiteboardId = parseInt(req.params.id);
      const whiteboard = await storage.getWhiteboard(whiteboardId);
      
      if (!whiteboard) {
        return res.status(404).json({ message: "Whiteboard not found" });
      }
      
      res.json(whiteboard);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch whiteboard" });
    }
  });
  
  app.put("/api/whiteboards/:id", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const whiteboardId = parseInt(req.params.id);
      
      // Check if whiteboard exists
      const whiteboard = await storage.getWhiteboard(whiteboardId);
      if (!whiteboard) {
        return res.status(404).json({ message: "Whiteboard not found" });
      }
      
      const updatedWhiteboard = await storage.updateWhiteboard(whiteboardId, req.body);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "update_whiteboard",
        entityType: "whiteboard",
        entityId: whiteboardId,
        details: { name: whiteboard.name }
      });
      
      res.json(updatedWhiteboard);
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  // AI Test Case Generation Routes
  app.post("/api/ai/generate", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      
      // Validate request
      const { prompt, testType, count } = schema.aiGenerateSchema.parse(req.body);
      
      // Your implementation to call GROQ API will go here
      // For now, we'll simulate a response
      
      // Save the request and response to the database
      const aiTestCase = await storage.saveAITestCase({
        prompt,
        response: { generatedCases: [] }, // Placeholder until integrated with Groq
        createdBy: currentUser.id
      });
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "generate_ai_test_cases",
        entityType: "ai_test_case",
        entityId: aiTestCase.id,
        details: { prompt, testType, count }
      });
      
      // Return the AI-generated test cases
      res.json({ id: aiTestCase.id, generatedCases: [] }); // Placeholder until integrated with Groq
    } catch (error) {
      res.status(400).json(handleZodError(error));
    }
  });
  
  app.post("/api/ai/:id/import", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const aiTestCaseId = parseInt(req.params.id);
      const currentUser = req.user as schema.User;
      
      // Mark the AI test case as imported
      await storage.markAITestCaseAsImported(aiTestCaseId);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "import_ai_test_cases",
        entityType: "ai_test_case",
        entityId: aiTestCaseId,
        details: { testCases: req.body.testCases }
      });
      
      res.json({ message: "AI test cases imported successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to import AI test cases" });
    }
  });
  
  // Dashboard Statistics Routes
  app.get("/api/stats/test-status", isAuthenticated, async (_req, res) => {
    try {
      const stats = await storage.getTestStatusStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test status statistics" });
    }
  });
  
  app.get("/api/stats/recent-activities", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const activities = await storage.getRecentActivities(limit);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent activities" });
    }
  });
  
  app.get("/api/stats/recent-test-cases", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const testCases = await storage.getRecentTestCases(limit);
      res.json(testCases);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent test cases" });
    }
  });
  
  app.get("/api/stats/test-runs", isAuthenticated, async (_req, res) => {
    try {
      const stats = await storage.getTestRunStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch test run statistics" });
    }
  });
  
  // AI Test Case Generation Routes
  app.post("/api/ai/generate-tests", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const { prompt, testType, count } = schema.aiGenerateSchema.parse(req.body);
      
      if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ message: "GROQ_API_KEY environment variable is not set" });
      }
      
      const testCases = await generateAITestCases(prompt, testType, count);
      
      // Log activity
      const currentUser = req.user as schema.User;
      storage.logActivity({
        userId: currentUser.id,
        action: "generate_ai_test_cases",
        entityType: "ai_test_case",
        entityId: 0, // No specific entity ID for generation
        details: { prompt, testType, count }
      });
      
      res.json(testCases);
    } catch (error) {
      console.error("Error generating AI test cases:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to generate test cases" 
      });
    }
  });
  
  app.post("/api/ai/import-test", isAuthenticated, hasRole(testRoles), async (req, res) => {
    try {
      const currentUser = req.user as schema.User;
      
      // Save the original AI response
      const aiTestCase = await storage.saveAITestCase({
        prompt: req.body.description || "",
        response: req.body,
        createdBy: currentUser.id
      });
      
      // Format as a test case with steps
      const testCaseData = {
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority || "medium",
        type: req.body.type || "functional",
        expectedResult: req.body.expectedResult || "",
        createdBy: currentUser.id,
        steps: req.body.steps.map((step: any, index: number) => ({
          stepNumber: index + 1,
          description: step.description,
          expectedResult: step.expectedResult || ""
        }))
      };
      
      // Create the actual test case
      const testCase = await storage.createTestCase(testCaseData);
      
      // Mark the AI test case as imported
      await storage.markAITestCaseAsImported(aiTestCase.id);
      
      // Log activity
      storage.logActivity({
        userId: currentUser.id,
        action: "import_ai_test_case",
        entityType: "test_case",
        entityId: testCase.id,
        details: { aiTestCaseId: aiTestCase.id, title: testCase.title }
      });
      
      res.status(201).json(testCase);
    } catch (error) {
      console.error("Error importing AI test case:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to import test case" 
      });
    }
  });
  
  // WebSocket message handling for real-time collaboration
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Broadcast messages to all connected clients except the sender
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify(data));
          }
        });
        
        // If it's a whiteboard update, save it to the database
        if (data.type === 'whiteboard_update' && data.whiteboardId) {
          const whiteboard = await storage.getWhiteboard(data.whiteboardId);
          if (whiteboard) {
            await storage.updateWhiteboard(data.whiteboardId, {
              content: data.content
            });
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });
  
  return httpServer;
}
