import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TestStep {
  id: number;
  stepNumber: number;
  description: string;
  expectedResult?: string;
}

interface TestStepListProps {
  steps: TestStep[];
}

export function TestStepList({ steps }: TestStepListProps) {
  return (
    <div className="border border-neutral-100 rounded-md overflow-hidden dark:border-neutral-800">
      <Table>
        <TableHeader>
          <TableRow className="bg-neutral-50 dark:bg-neutral-800">
            <TableHead className="w-[60px]">Step</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Expected Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-16 text-center text-neutral-500 dark:text-neutral-400">
                No steps defined
              </TableCell>
            </TableRow>
          ) : (
            steps.map((step) => (
              <TableRow key={step.id}>
                <TableCell className="font-medium text-center text-primary-600 dark:text-primary-400">
                  {step.stepNumber}
                </TableCell>
                <TableCell className="text-neutral-700 dark:text-neutral-300">{step.description}</TableCell>
                <TableCell className="text-neutral-500 dark:text-neutral-400">{step.expectedResult || '-'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
