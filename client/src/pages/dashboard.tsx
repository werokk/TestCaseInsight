import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Navbar } from '@/components/layout/navbar';
import { StatsCard } from '@/components/dashboard/stats-card';
import { TestProgressChart } from '@/components/dashboard/test-progress-chart';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { RecentTestCases } from '@/components/dashboard/recent-test-cases';
import { ClipboardCheckIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { formatPercentage } from '@/lib/utils';

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Fetch test status statistics
  const { data: testStatusStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/stats/test-status'],
  });
  
  // Fetch test run statistics
  const { data: testRunStats, isLoading: runStatsLoading } = useQuery({
    queryKey: ['/api/stats/test-runs'],
  });
  
  // Calculate total tests and percentages for progress chart
  const totalTests = testStatusStats?.reduce((sum: number, stat: any) => sum + stat.count, 0) || 0;
  const progressChartData = testStatusStats?.map((stat: any) => ({
    ...stat,
    percentage: totalTests > 0 ? (stat.count / totalTests) * 100 : 0
  })) || [];
  
  // Prepare test status counts
  const passedTests = testStatusStats?.find((stat: any) => stat.status === 'passed')?.count || 0;
  const failedTests = testStatusStats?.find((stat: any) => stat.status === 'failed')?.count || 0;
  const pendingTests = testStatusStats?.find((stat: any) => stat.status === 'pending')?.count || 0;
  
  return (
    <div className="min-h-screen flex bg-neutral-50 dark:bg-neutral-900">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar title="Dashboard" onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Total Test Cases */}
              <StatsCard
                title="Total Test Cases"
                value={totalTests}
                icon={<ClipboardCheckIcon className="h-6 w-6" />}
                iconClassName="bg-primary-50 text-primary-500 dark:bg-primary-900 dark:text-primary-400"
              />
              
              {/* Passed Tests */}
              <StatsCard
                title="Passed Tests"
                value={passedTests}
                description={totalTests > 0 ? `${formatPercentage(passedTests / totalTests * 100)} of total` : undefined}
                icon={<CheckCircleIcon className="h-6 w-6" />}
                iconClassName="bg-green-50 text-green-500 dark:bg-green-900 dark:text-green-400"
              />
              
              {/* Failed Tests */}
              <StatsCard
                title="Failed Tests"
                value={failedTests}
                description={totalTests > 0 ? `${formatPercentage(failedTests / totalTests * 100)} of total` : undefined}
                icon={<XCircleIcon className="h-6 w-6" />}
                iconClassName="bg-red-50 text-red-500 dark:bg-red-900 dark:text-red-400"
              />
              
              {/* Pending Tests */}
              <StatsCard
                title="Pending Tests"
                value={pendingTests}
                description={totalTests > 0 ? `${formatPercentage(pendingTests / totalTests * 100)} of total` : undefined}
                icon={<ClockIcon className="h-6 w-6" />}
                iconClassName="bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
              />
            </div>
            
            {/* Test Progress Chart and Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TestProgressChart data={progressChartData} />
              <RecentActivity />
            </div>
            
            {/* Recent Test Cases */}
            <RecentTestCases />
          </div>
        </main>
      </div>
    </div>
  );
}
