import { describe, it, expect } from 'vitest';
import { captureSchema, meterCommandSchema, meterError } from '../../src/lib/meter-domain';
const scope = {
  organization_id: '10000000-0000-4000-8000-000000000001',
  property_id: '10000000-0000-4000-8000-000000000002',
};
const capture = {
  ...scope,
  id: scope.organization_id,
  route_item_id: scope.organization_id,
  assignment_id: scope.organization_id,
  captured_at: '2026-10-21T12:00:00Z',
  device_id: scope.organization_id,
  previous_reading_id: null,
  previous_review_id: null,
  value: '123456789012.123456',
  kind: 'actual',
  flag: 'none',
  notes: '',
  photo: null,
};
describe('meter input boundary', () => {
  it('preserves six decimal places as text and rejects rounded/scientific/negative inputs', () => {
    expect(captureSchema.parse(capture).value).toBe('123456789012.123456');
    for (const value of [123, '1e4', '-1', '1.1234567', '12,300', 'NaN'])
      expect(captureSchema.safeParse({ ...capture, value }).success).toBe(false);
    expect(captureSchema.safeParse({ ...capture, created_by: scope.organization_id }).success).toBe(false);
  });
  it('bounds photos and rejects executable formats and forged hashes', () => {
    for (const photo of [
      { mime: 'image/svg+xml', byte_size: 10, sha256: 'a'.repeat(64) },
      { mime: 'image/jpeg', byte_size: 5242881, sha256: 'a'.repeat(64) },
      { mime: 'image/png', byte_size: 10, sha256: 'wrong' },
    ])
      expect(captureSchema.safeParse({ ...capture, photo }).success).toBe(false);
  });
  it('requires valid scoped actions and useful review reasons', () => {
    expect(
      meterCommandSchema.safeParse({
        command: 'review',
        payload: {
          ...scope,
          reading_id: scope.organization_id,
          previous_review_id: null,
          decision: 'accepted',
          corrected_value: '0',
          reason: 'Verified meter',
        },
      }).success
    ).toBe(true);
    expect(
      meterCommandSchema.safeParse({
        command: 'resolve_conflict',
        payload: {
          ...scope,
          conflict_id: scope.organization_id,
          decision: 'discarded',
          reading_id: null,
          reason: 'x',
        },
      }).success
    ).toBe(false);
    expect(meterError('42501', 'not public').status).toBe(403);
    expect(meterError('P0001', 'baseline_conflict').status).toBe(409);
    expect(meterError('unknown', 'database credential detail').error).not.toContain('credential');
  });
});
