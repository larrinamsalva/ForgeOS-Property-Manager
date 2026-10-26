import { describe, expect, it } from 'vitest';
import { shouldRetryMeterSync } from '../../public/tablet/reconnect.mjs';

const base={online:true,unlocked:true,busy:false,dirty:false,
  operations:[{state:'queued'}]};
describe('tablet reconnect retry guard',()=>{
  it('retries queued readings when the original user has an unlocked, idle online tablet',()=>{
    expect(shouldRetryMeterSync(base)).toBe(true);
    expect(shouldRetryMeterSync({...base,operations:[{state:'photo_pending'}]})).toBe(true);
  });
  it('never starts a sync while offline, locked, busy or editing',()=>{
    for(const key of ['online','unlocked'] as const)
      expect(shouldRetryMeterSync({...base,[key]:false})).toBe(false);
    for(const key of ['busy','dirty'] as const)
      expect(shouldRetryMeterSync({...base,[key]:true})).toBe(false);
  });
  it('skips completed queues and supervisor-owned conflicts',()=>{
    expect(shouldRetryMeterSync({...base,operations:[]})).toBe(false);
    expect(shouldRetryMeterSync({...base,operations:[{state:'synced'},{state:'resolved'}]})).toBe(false);
    expect(shouldRetryMeterSync({...base,operations:[{state:'conflict',conflictId:'case-1'}]})).toBe(false);
    expect(shouldRetryMeterSync({...base,operations:[{state:'conflict',conflictId:'case-1'},{state:'queued'}]})).toBe(true);
  });
});
