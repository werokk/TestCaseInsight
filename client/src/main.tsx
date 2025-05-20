import React from "react";
import { createRoot } from "react-dom/client";
import { Route, Router, Switch, Link } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import "./index.css";

// Simple page components
const Dashboard = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Test Cases Overview</h2>
        <div className="flex justify-between text-sm">
          <div>Total: 0</div>
          <div>Passed: 0</div>
          <div>Failed: 0</div>
          <div>Pending: 0</div>
        </div>
      </div>
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Recent Activity</h2>
        <p className="text-gray-500 text-sm">No recent activity</p>
      </div>
    </div>
  </div>
);

const TestCases = () => (
  <div className="p-6">
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-2xl font-bold">Test Cases</h1>
      <div className="space-x-2">
        <Link href="/create-test-case">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">+ Create Test Case</button>
        </Link>
        <Link href="/ai-generate">
          <button className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">AI Generate</button>
        </Link>
      </div>
    </div>
    <div className="bg-white rounded shadow p-4">
      <p className="text-gray-500">No test cases found. Create one to get started.</p>
    </div>
  </div>
);

const CreateTestCase = () => {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState("medium");
  const [type, setType] = React.useState("functional");
  const [steps, setSteps] = React.useState([{ description: "", expectedResult: "" }]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  
  const addStep = () => {
    setSteps([...steps, { description: "", expectedResult: "" }]);
  };
  
  const updateStep = (index: number, field: string, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    try {
      // Format the test case data
      const testCaseData = {
        title,
        description,
        priority,
        type,
        expectedResult: "",
        steps: steps.map((step, index) => ({
          ...step,
          stepNumber: index + 1
        }))
      };
      
      console.log("Creating test case:", testCaseData);
      
      // Submit to API
      const response = await fetch('/api/testcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCaseData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create test case');
      }
      
      // Reset form
      setTitle("");
      setDescription("");
      setPriority("medium");
      setType("functional");
      setSteps([{ description: "", expectedResult: "" }]);
      
      alert("Test case created successfully!");
    } catch (err) {
      console.error("Error creating test case:", err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center mb-6">
        <Link href="/test-cases">
          <button className="mr-4 text-blue-500">← Back</button>
        </Link>
        <h1 className="text-2xl font-bold">Create New Test Case</h1>
      </div>
      
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1" htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            className="w-full p-2 border rounded"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1" htmlFor="description">Description</label>
          <textarea
            id="description"
            className="w-full p-2 border rounded"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>
        </div>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">Test Steps</label>
            <button 
              type="button" 
              onClick={addStep}
              className="text-sm px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              + Add Step
            </button>
          </div>
          
          {steps.map((step, index) => (
            <div key={index} className="border p-3 rounded mb-2">
              <div className="flex items-center mb-2">
                <span className="font-medium mr-2">Step {index + 1}</span>
              </div>
              <div className="mb-2">
                <label className="block text-xs mb-1">Description</label>
                <textarea
                  className="w-full p-2 border rounded text-sm"
                  rows={2}
                  value={step.description}
                  onChange={(e) => updateStep(index, "description", e.target.value)}
                  required
                ></textarea>
              </div>
              <div>
                <label className="block text-xs mb-1">Expected Result</label>
                <textarea
                  className="w-full p-2 border rounded text-sm"
                  rows={2}
                  value={step.expectedResult}
                  onChange={(e) => updateStep(index, "expectedResult", e.target.value)}
                ></textarea>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6">
          <button 
            type="submit" 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create Test Case
          </button>
        </div>
      </form>
    </div>
  );
};

const AiGenerate = () => {
  const [prompt, setPrompt] = React.useState("");
  const [testType, setTestType] = React.useState("functional");
  const [count, setCount] = React.useState(3);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedTests, setGeneratedTests] = React.useState<any[]>([]);
  const [error, setError] = React.useState("");
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError("");
    
    try {
      // Call the actual API endpoint
      const response = await fetch('/api/ai/generate-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, testType, count })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate test cases');
      }
      
      const data = await response.json();
      setGeneratedTests(data);
    } catch (err) {
      console.error("Error generating tests:", err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const importTest = async (test: any) => {
    try {
      // Save the test case to the database
      const response = await fetch('/api/ai/import-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to import test case');
      }
      
      alert('Test case imported successfully!');
    } catch (err) {
      console.error("Error importing test:", err);
      alert(err instanceof Error ? err.message : 'Failed to import test case');
    }
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center mb-6">
        <Link href="/test-cases">
          <button className="mr-4 text-blue-500">← Back</button>
        </Link>
        <h1 className="text-2xl font-bold">AI Test Case Generator</h1>
      </div>
      
      <div className="bg-white p-6 rounded shadow mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1" htmlFor="prompt">Describe what you want to test</label>
          <textarea
            id="prompt"
            className="w-full p-2 border rounded"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. Generate test cases for a login form with validation, password reset, and remember me functionality"
            required
          ></textarea>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="testType">Test Type</label>
            <select
              id="testType"
              className="w-full p-2 border rounded"
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
            >
              <option value="functional">Functional</option>
              <option value="performance">Performance</option>
              <option value="security">Security</option>
              <option value="usability">Usability</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="count">Number of Test Cases</label>
            <input
              type="number"
              id="count"
              className="w-full p-2 border rounded"
              min="1"
              max="10"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
            />
          </div>
        </div>
        
        <button 
          onClick={handleGenerate}
          disabled={!prompt || isGenerating}
          className={`px-4 py-2 rounded text-white ${
            !prompt || isGenerating ? "bg-gray-400" : "bg-purple-500 hover:bg-purple-600"
          }`}
        >
          {isGenerating ? "Generating..." : "Generate Test Cases"}
        </button>
      </div>
      
      {generatedTests.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Generated Test Cases</h2>
          {generatedTests.map((test, index) => (
            <div key={index} className="bg-white p-4 rounded shadow mb-4 border-l-4 border-purple-500">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold">{test.title}</h3>
                <button 
                  onClick={() => importTest(test)}
                  className="text-sm px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                >
                  Import
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-3">{test.description}</p>
              <div className="mb-2">
                <span className="text-xs font-medium text-gray-500">Steps:</span>
                <ol className="ml-4 mt-1 text-sm">
                  {test.steps.map((step: any, i: number) => (
                    <li key={i} className="mb-1">
                      <span className="font-medium">Step {i+1}:</span> {step.description}
                      {step.expectedResult && (
                        <div className="text-xs text-gray-600 ml-4">
                          Expected: {step.expectedResult}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-2 flex text-xs">
                <span className="mr-4">Priority: <span className="font-medium">{test.priority}</span></span>
                <span>Type: <span className="font-medium">{test.type}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Reports = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Reports</h1>
    <p className="text-gray-500">No reports available yet.</p>
  </div>
);

const Settings = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Settings</h1>
    <div className="bg-white p-4 rounded shadow">
      <h2 className="text-lg font-semibold mb-2">User Settings</h2>
      <p className="text-gray-500 text-sm">Settings will be available soon.</p>
    </div>
  </div>
);

// Navigation component
const Nav = () => (
  <nav className="bg-gray-800 text-white px-4 py-3">
    <div className="container mx-auto flex justify-between items-center">
      <div className="font-bold text-xl">Test Sphere</div>
      <div className="space-x-4">
        <Link href="/">
          <span className="hover:text-blue-300 cursor-pointer">Dashboard</span>
        </Link>
        <Link href="/test-cases">
          <span className="hover:text-blue-300 cursor-pointer">Test Cases</span>
        </Link>
        <Link href="/reports">
          <span className="hover:text-blue-300 cursor-pointer">Reports</span>
        </Link>
        <Link href="/settings">
          <span className="hover:text-blue-300 cursor-pointer">Settings</span>
        </Link>
      </div>
    </div>
  </nav>
);

// Layout component
const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-gray-100">
    <Nav />
    <main className="container mx-auto">{children}</main>
  </div>
);

// Import auth pages
import Login from './pages/login';
import Register from './pages/register';

// App Component with simplified routing
function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(true); // Temporarily set to true for development

  // In production, this would check if the user is authenticated
  React.useEffect(() => {
    // For now, we'll assume the user is logged in to bypass authentication
    setIsLoggedIn(true);
    
    // This is where we would typically check authentication status
    // const checkAuth = async () => {
    //   try {
    //     const response = await fetch('/api/auth/me');
    //     if (response.ok) {
    //       setIsLoggedIn(true);
    //     } else {
    //       setIsLoggedIn(false);
    //     }
    //   } catch (error) {
    //     setIsLoggedIn(false);
    //   }
    // };
    // checkAuth();
  }, []);

  if (!isLoggedIn) {
    return (
      <Router>
        <QueryClientProvider client={queryClient}>
          <Switch>
            <Route path="/register" component={Register} />
            <Route component={Login} />
          </Switch>
        </QueryClientProvider>
      </Router>
    );
  }

  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/test-cases" component={TestCases} />
            <Route path="/create-test-case" component={CreateTestCase} />
            <Route path="/ai-generate" component={AiGenerate} />
            <Route path="/reports" component={Reports} />
            <Route path="/settings" component={Settings} />
            <Route path="/login" component={Login} />
            <Route path="/register" component={Register} />
          </Switch>
        </Layout>
      </QueryClientProvider>
    </Router>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
