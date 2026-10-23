import { describe, expect, it } from 'vitest';
import { parseSpokenRegister } from '../../public/tablet/voice-register.mjs';

describe('strict speech-only meter input', () => {
  it('accepts grouped and spoken integer readings and spoken decimals', () => {
    expect(parseSpokenRegister('electric meter 12,450', 'electric', 6)).toEqual({ok:true,value:'12450'});
    expect(parseSpokenRegister('twelve thousand four hundred fifty', 'electric', 6))
      .toEqual({ok:true,value:'12450'});
    expect(parseSpokenRegister('water reading one two three point four five', 'water', 6))
      .toEqual({ok:true,value:'123.45'});
    expect(parseSpokenRegister('gas register zero', 'gas', 6)).toEqual({ok:true,value:'0'});
    expect(parseSpokenRegister('water 000125.050', 'water', 6))
      .toEqual({ok:true,value:'000125.050'});
  });
  it('rejects mismatched utilities and ambiguous extra numbers', () => {
    for (const input of ['gas meter 1250', 'electric water 1250', 'site 88 reading 1250',
      'twelve forty five','one hundred point twenty','12,34','123.45.6']) {
      expect(parseSpokenRegister(input, 'electric', 6).ok).toBe(false);
    }
  });
  it('honors register digit and fraction limits without guessing', () => {
    expect(parseSpokenRegister('1,000,000', 'electric', 6).ok).toBe(false);
    expect(parseSpokenRegister('10.1234567', 'electric', 6).ok).toBe(false);
    expect(parseSpokenRegister('10.123456', 'electric', 6)).toEqual({ok:true,value:'10.123456'});
    expect(parseSpokenRegister('', 'electric', 6).ok).toBe(false);
  });
});
