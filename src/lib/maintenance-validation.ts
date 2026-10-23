import { z } from 'zod';
import { maintenanceAreas, maintenanceCategories } from './maintenance-catalog';

const workArea = z.enum(maintenanceAreas.map((area) => area.value) as [
  (typeof maintenanceAreas)[number]['value'],
  ...(typeof maintenanceAreas)[number]['value'][],
]);
export const maintenanceSelfTaskSchema = z.object({
  command: z.literal('maintenance_self_task'),
  payload: z.object({
    organization_id: z.uuid(),
    property_id: z.uuid(),
    request_id: z.uuid(),
    reason: z.string().trim().min(3).max(2000),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(3).max(4000),
    category: z.enum(maintenanceCategories),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    work_area: workArea,
    site_id: z.uuid().nullable(),
    requested_on: z.iso.date(),
    due_on: z.iso.date().nullable(),
    parts_required: z.string().max(2000),
  }).strict(),
}).strict();
