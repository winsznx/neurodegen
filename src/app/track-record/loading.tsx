import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Shell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            track record
          </div>
          <Skeleton className="h-10 w-100 max-w-full" />
          <Skeleton className="h-4 w-140 max-w-full" />
          <Card>
            <CardBody>
              <div className="grid gap-4 md:grid-cols-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-88 max-w-full" />
          </CardBody>
        </Card>

        <div className="grid gap-4 md:grid-cols-5">
          <Skeleton className="h-26" />
          <Skeleton className="h-26" />
          <Skeleton className="h-26" />
          <Skeleton className="h-26" />
          <Skeleton className="h-26" />
        </div>
      </div>
    </Shell>
  );
}
