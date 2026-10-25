// Avoid syncing while a user edits, while another operation is running,
// or when all outstanding records require supervisor conflict resolution.
export function shouldRetryMeterSync({online,unlocked,busy,dirty,operations}) {
  return !!online && !!unlocked && !busy && !dirty &&
    operations.some(op => !['synced','resolved'].includes(op.state) &&
      !(op.state === 'conflict' && op.conflictId));
}
