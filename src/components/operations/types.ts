import type { Snapshot } from '@/lib/domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';
export interface OpsEditor {
  type: string;
  id?: string;
  relatedId?: string;
  value?: string;
  requestId: string;
}
export interface OpsUI {
  data: OperationsSnapshot;
  snapshot: Snapshot;
  propertyId: string;
  today: string;
  office: boolean;
  manage: boolean;
  active: boolean;
  open: (type: string, id?: string, relatedId?: string, value?: string) => void;
}
