import * as XLSX from 'xlsx';

// Define test case structure for import/export
interface TestCaseExport {
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  assignedTo?: string;
  expectedResult?: string;
  steps: {
    stepNumber: number;
    description: string;
    expectedResult?: string;
  }[];
  folder?: string;
}

// Export test cases to Excel
export function exportTestCasesToExcel(testCases: TestCaseExport[]): void {
  try {
    // Create worksheet from test cases
    const worksheet = XLSX.utils.json_to_sheet(
      testCases.map(tc => ({
        'Title': tc.title,
        'Description': tc.description || '',
        'Status': tc.status,
        'Priority': tc.priority,
        'Type': tc.type,
        'Assigned To': tc.assignedTo || '',
        'Expected Result': tc.expectedResult || '',
        'Folder': tc.folder || '',
        // We'll handle steps separately
      }))
    );

    // Create a workbook with main sheet and steps sheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');

    // Create steps worksheet
    const stepsData: any[] = [];
    testCases.forEach((tc, index) => {
      tc.steps.forEach(step => {
        stepsData.push({
          'Test Case Index': index + 1,
          'Test Case Title': tc.title,
          'Step Number': step.stepNumber,
          'Step Description': step.description,
          'Step Expected Result': step.expectedResult || ''
        });
      });
    });

    const stepsWorksheet = XLSX.utils.json_to_sheet(stepsData);
    XLSX.utils.book_append_sheet(workbook, stepsWorksheet, 'Test Steps');

    // Generate Excel file
    XLSX.writeFile(workbook, 'TestCases.xlsx');
  } catch (error) {
    console.error('Error exporting test cases to Excel:', error);
    throw error;
  }
}

// Parse test cases from Excel file
export async function parseTestCasesFromExcel(file: File): Promise<TestCaseExport[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get test cases sheet
        const testCasesSheet = workbook.Sheets[workbook.SheetNames[0]];
        const testCasesJson = XLSX.utils.sheet_to_json(testCasesSheet);

        // Get steps sheet if available
        const stepsSheet = workbook.SheetNames.length > 1 ? workbook.Sheets[workbook.SheetNames[1]] : null;
        const stepsJson = stepsSheet ? XLSX.utils.sheet_to_json(stepsSheet) : [];

        // Map the raw data to our expected format
        const testCases: TestCaseExport[] = testCasesJson.map((row: any, index) => {
          // Find steps for this test case
          const testCaseSteps = stepsJson
            .filter((step: any) => step['Test Case Index'] === index + 1 || step['Test Case Title'] === row['Title'])
            .map((step: any) => ({
              stepNumber: step['Step Number'] || 1,
              description: step['Step Description'] || '',
              expectedResult: step['Step Expected Result'] || ''
            }))
            .sort((a, b) => a.stepNumber - b.stepNumber);

          return {
            title: row['Title'] || '',
            description: row['Description'] || '',
            status: row['Status'] || 'pending',
            priority: row['Priority'] || 'medium',
            type: row['Type'] || 'functional',
            assignedTo: row['Assigned To'] || '',
            expectedResult: row['Expected Result'] || '',
            folder: row['Folder'] || '',
            steps: testCaseSteps.length > 0 ? testCaseSteps : [{ stepNumber: 1, description: '', expectedResult: '' }]
          };
        });

        resolve(testCases);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };

    reader.readAsArrayBuffer(file);
  });
}
