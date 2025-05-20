import { createRoot } from "react-dom/client";
import "./index.css";

// Simple app component to get started
function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Case Management System</h1>
      <div className="mb-4">
        <p className="text-gray-600">Welcome to your test case management dashboard</p>
      </div>
      <nav className="flex mb-6 space-x-4">
        <a href="/dashboard" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Dashboard</a>
        <a href="/test-cases" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Test Cases</a>
        <a href="/reports" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Reports</a>
        <a href="/settings" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Settings</a>
      </nav>
      <div className="p-4 border rounded bg-gray-50">
        <h2 className="font-bold mb-2">System Status</h2>
        <ul className="list-disc pl-5">
          <li>Server: Connected</li>
          <li>Database: Connected</li>
          <li>API Keys: Configured</li>
        </ul>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
