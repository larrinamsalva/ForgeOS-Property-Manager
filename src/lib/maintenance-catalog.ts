export const maintenanceCategories = [
  'General repairs', 'Plumbing', 'Tree trimming', 'Sprinklers & irrigation',
  'Bathrooms & restrooms', 'Laundry room equipment', 'Trash cans & dumpster',
  'Grounds & landscaping', 'Electrical & lighting', 'HVAC', 'Sewer & septic',
  'Water leaks', 'Painting & drywall', 'Roofing & gutters',
  'Roads & parking', 'Fencing & gates', 'Pest control',
  'Cleaning & sanitation', 'Safety & inspections', 'Pool & spa',
  'Appliance repair', 'Other maintenance',
] as const;

export const maintenanceAreas = [
  { value: 'site', label: 'RV site / apartment / cabin' },
  { value: 'bathrooms', label: 'Public bathrooms / showers' },
  { value: 'laundry', label: 'Laundry room' },
  { value: 'trash', label: 'Trash cans / dumpster / collection area' },
  { value: 'sprinklers', label: 'Sprinklers / irrigation zones' },
  { value: 'trees', label: 'Trees / landscaping / grounds' },
  { value: 'roads', label: 'Roads / driveways / parking' },
  { value: 'office', label: 'Office / reception' },
  { value: 'clubhouse', label: 'Clubhouse / common room' },
  { value: 'pool', label: 'Pool / spa' },
  { value: 'utilities', label: 'Utility hookups / meters / pump house' },
  { value: 'sewer', label: 'Sewer / septic / drains' },
  { value: 'fence', label: 'Fence / gates / entrance' },
  { value: 'storage', label: 'Storage / maintenance shop' },
  { value: 'other', label: 'Other property common area' },
] as const;

export function maintenanceAreaLabel(area: string): string {
  return maintenanceAreas.find((item) => item.value === area)?.label ?? 'Other property common area';
}
export function formatMaintenanceDescription(area: string, detail: string, text: string) {
  const cleanedDetail = detail.trim().replace(/[\r\n]+/g, ' ').slice(0, 120);
  const cleanedText = text.trim();
  const label = maintenanceAreaLabel(area);
  return `Service area: ${label}${cleanedDetail ? ' · ' + cleanedDetail : ''}\n\n${cleanedText}`;
}
export function getSavedMaintenanceDescription(description: string) {
  const match = /^Service area: ([^\n]+)\n\n([\s\S]*)$/.exec(description);
  if (!match) return { area: 'other', detail: '', description };
  const area = maintenanceAreas.find((entry) => match[1] === entry.label ||
    match[1].startsWith(entry.label + ' · '));
  return {
    area: area?.value ?? 'other',
    detail: area ? match[1].slice(area.label.length).replace(/^ · /, '') : match[1],
    description: match[2],
  };
}
