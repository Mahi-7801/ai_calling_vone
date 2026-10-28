import { useParams } from 'react-router-dom';
import { EmployeeWorkspace } from '@/components/employees/employee-workspace';
import { useEmployee } from '@/hooks/queries';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';

export function EmployeeEditPage() {
  const { id } = useParams();
  const employeeId = id ? (isNaN(Number(id)) ? id : Number(id)) : null;
  const { data, isLoading, isError, refetch } = useEmployee(employeeId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data?.employee) {
    return (
      <ErrorState
        title="Employee not found"
        message="This employee may have been removed or you may not have permission to view it."
        onRetry={() => refetch()}
      />
    );
  }

  return <EmployeeWorkspace employee={data.employee} onUpdate={() => refetch()} />;
}