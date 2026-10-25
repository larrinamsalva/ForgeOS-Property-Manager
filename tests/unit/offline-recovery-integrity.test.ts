import { describe, expect, it } from 'vitest';
import { validateRecoveryBundle, importVault } from '../../public/tablet/vault.mjs';

const scope='test-org:test-user';
const encrypted={data:'ciphertext',iv:'initialization-vector'};
const op={id:scope+':reading-1',scope,kind:'operation',stopKey:scope+':stop-1',
  pending:true,cipher:encrypted};
const bundle={format:'ForgeOS encrypted meter recovery',version:1,
  vault:{scope},records:[op]};

describe('offline encrypted meter recovery integrity',()=>{
  it('accepts a structurally valid pending recovery queue',()=>{
    expect(validateRecoveryBundle(bundle)).toBe(true);
  });
  it('rejects cross-account records and duplicate operation IDs before writing storage',()=>{
    expect(()=>validateRecoveryBundle({...bundle,records:[{...op,scope:'another:user'}]})).toThrow();
    expect(()=>validateRecoveryBundle({...bundle,records:[op,op]})).toThrow();
  });
  it('rejects two queued operations for the same route stop',()=>{
    expect(()=>validateRecoveryBundle({...bundle,records:[op,
      {...op,id:scope+':reading-2'}]})).toThrow();
  });
  it('rejects missing encryption, unsupported kind and malformed recovery format',()=>{
    expect(()=>validateRecoveryBundle({...bundle,version:2})).toThrow();
    expect(()=>validateRecoveryBundle({...bundle,records:[{...op,cipher:null}]})).toThrow();
    expect(()=>validateRecoveryBundle({...bundle,records:[{...op,kind:'unknown'}]})).toThrow();
  });
  it('rejects invalid imports before attempting browser storage',async()=>{
    await expect(importVault({...bundle,records:[op,op]})).rejects.toThrow('Recovery file is invalid.');
  });
});
