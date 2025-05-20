import { generateTestCases } from "../client/src/lib/groq";

// Function to handle AI test case generation
export async function generateAITestCases(prompt: string, testType: string, count: number) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }
  
  try {
    // Call the Groq API
    const testCases = await generateTestCases(prompt, testType, count);
    return testCases;
  } catch (error) {
    console.error("Error generating test cases:", error);
    throw error;
  }
}