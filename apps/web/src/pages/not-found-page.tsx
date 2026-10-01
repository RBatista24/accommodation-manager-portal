import { Link } from 'react-router';
import { Button } from '@/components/atoms/button';
import { EmptyState } from '@/components/molecules/empty-state';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="This page does not exist."
      action={
        <Button asChild>
          <Link to="/">Go to the dashboard</Link>
        </Button>
      }
    />
  );
}
