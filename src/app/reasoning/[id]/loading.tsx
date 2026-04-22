import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Shell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <Skeleton className="h-4 w-32" />

        <div className="space-y-3">
          <Skeleton className="h-4 w-56" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-10 w-72 max-w-full" />
              <Skeleton className="h-4 w-52" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </div>

        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardBody>
        </Card>
      </div>
    </Shell>
  );
}
