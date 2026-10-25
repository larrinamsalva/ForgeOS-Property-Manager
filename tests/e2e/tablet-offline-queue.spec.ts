import { test, expect } from '@playwright/test';

// Uses the real tablet vault module in a local browser and fixture website.
// No authenticated live meter API calls or production records.
test('offline meter queue survives reload, remains encrypted, and restores on unlock',async({page})=>{
  await page.goto('/tablet/');
  const initial=await page.evaluate(async()=>{
    const vault=await import('/tablet/vault.mjs');
    const userId=crypto.randomUUID(),organizationId=crypto.randomUUID();
    const session=await vault.createVault(userId,organizationId,'Fictional-passphrase-123');
    const operation={
      state:'queued',siteLabel:'Space 88',meterLabel:'Electric',
      payload:{id:crypto.randomUUID(),route_item_id:crypto.randomUUID(),
        assignment_id:crypto.randomUUID(),value:'125.125000'},
    };
    await vault.saveOperation(session,operation,true);
    const raw=(await vault.rawRecords()).find(r=>r.kind==='operation'&&r.scope===session.meta.scope);
    return {scope:session.meta.scope,operationId:operation.payload.id,
      plaintextNotStored:!JSON.stringify(raw).includes('125.125000')};
  });
  expect(initial.plaintextNotStored).toBe(true);
  await page.reload();
  const restored=await page.evaluate(async(scope)=>{
    const vault=await import('/tablet/vault.mjs');
    const meta=(await vault.listVaults()).find(v=>v.scope===scope);
    if(!meta)throw Error('Vault missing after reload');
    const session=await vault.unlockVault(meta,'Fictional-passphrase-123');
    const contents=await vault.readVault(session);
    return {operations:contents.operations,
      pending:(await vault.rawRecords()).filter(r=>r.scope===scope&&r.pending).length};
  },initial.scope);
  expect(restored.operations).toHaveLength(1);
  expect(restored.operations[0].payload.id).toBe(initial.operationId);
  expect(restored.operations[0].payload.value).toBe('125.125000');
  expect(restored.pending).toBe(1);
});

test('pending offline operation blocks deleting the local vault',async({page})=>{
  await page.goto('/tablet/');
  const result=await page.evaluate(async()=>{
    const vault=await import('/tablet/vault.mjs');
    const session=await vault.createVault(crypto.randomUUID(),crypto.randomUUID(),'Recovery-passphrase-123');
    await vault.saveOperation(session,{
      state:'queued',payload:{id:crypto.randomUUID(),route_item_id:crypto.randomUUID()}, 
    },true);
    try{await vault.forgetVault(session);return 'unexpected success';}
    catch(e){return e instanceof Error?e.message:String(e);}
  });
  expect(result).toContain('Sync or explicitly reconcile');
});
