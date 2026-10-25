import { describe, expect, it } from 'vitest';
import { captureSchema, meterCommandSchema, meterError, latestReview } from '../../src/lib/meter-domain';

const org='10000000-0000-4000-8000-000000000001';
const property='10000000-0000-4000-8000-000000000002';
const reading='10000000-0000-4000-8000-000000000003';
const scope={organization_id:org,property_id:property};
const capture={
  ...scope,id:reading,route_item_id:org,assignment_id:org,
  captured_at:'2026-10-25T12:00:00Z',device_id:org,
  previous_reading_id:null,previous_review_id:null,
  value:'125.125000',kind:'actual',flag:'none',notes:'Fictional Space 88',
  photo:null,
};

describe('tablet meter sync and supervisor review boundaries',()=>{
  it('accepts an offline-queued precise capture using a stable operation UUID',()=>{
    const queued=captureSchema.parse(capture);
    const restored=captureSchema.parse(JSON.parse(JSON.stringify(queued)));
    expect(restored.id).toBe(reading);
    expect(restored.value).toBe('125.125000');
    expect(restored.device_id).toBe(org);
    expect(restored).toEqual(queued);
  });
  it('rejects malformed replay payloads rather than silently accepting altered values',()=>{
    expect(captureSchema.safeParse({...capture,value:'125.1250000'}).success).toBe(false);
    expect(captureSchema.safeParse({...capture,id:'different'}).success).toBe(false);
    expect(captureSchema.safeParse({...capture,created_by:org}).success).toBe(false);
    expect(meterError('P0001','operation_conflict').status).toBe(409);
    expect(meterError('P0001','capture_conflict').status).toBe(409);
  });
  it('requires explicit exception flags for missing or reset captures',()=>{
    expect(captureSchema.safeParse({...capture,value:null,flag:'missing',
      notes:'Meter face could not be read'}).success).toBe(true);
    expect(captureSchema.safeParse({...capture,flag:'reset',
      notes:'Register reset observed'}).success).toBe(true);
    expect(captureSchema.safeParse({...capture,flag:'unknown'}).success).toBe(false);
  });
  it('validates supervisor review input and identifies the latest review',()=>{
    const payload={...scope,reading_id:reading,previous_review_id:null,
      decision:'accepted',corrected_value:'125.25',reason:'Photo confirmed'};
    expect(meterCommandSchema.safeParse({command:'review',payload}).success).toBe(true);
    expect(meterCommandSchema.safeParse({command:'review',payload:{...payload,reason:'x'}}).success).toBe(false);
    const reviews=[
      {id:org,reading_id:reading,decision:'rejected' as const,
        corrected_value:null,reason:'Unclear image',created_at:'2026-10-25T12:30:00Z',created_by:org},
      {id:property,reading_id:reading,decision:'accepted' as const,
        corrected_value:'125.25',reason:'Verified',created_at:'2026-10-25T13:00:00Z',created_by:org},
    ];
    expect(latestReview(reading,reviews)?.corrected_value).toBe('125.25');
  });
});
