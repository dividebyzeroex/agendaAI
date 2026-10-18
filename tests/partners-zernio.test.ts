import { describe, expect, it } from 'vitest';
import { scopedAccounts, validSchedule } from '../server/zernio.js';

describe('Zernio tenant isolation', () => {
 const own = '66a1f0c2a4b9d3e8f1a2b3c4';
 const foreign = '66a1f0c2a4b9d3e8f1a2b3c5';
 const accounts = [
  { _id: 'one', profileId: own, isActive: true },
  { _id: 'two', profileId: foreign, isActive: true },
  { _id: 'three', profileId: { _id: own }, isActive: true },
  { _id: 'four', profile: { _id: foreign }, isActive: true },
  { _id: 'five', isActive: true },
 ];
 it('never exposes accounts from other or unscoped profiles', () => {
  expect(scopedAccounts(accounts,own).map(a => a._id)).toEqual(['one','three']);
 });
 it('rejects unknown shapes', () => {
  expect(scopedAccounts(undefined,own)).toEqual([]);
  expect(scopedAccounts({},own)).toEqual([]);
 });
});
describe('Zernio post scheduling', () => {
 const now=Date.parse('2026-10-18T15:00:00Z');
 it('requires future dates between 2 minutes and 90 days', () => {
  expect(validSchedule('2026-10-18T15:01:00Z',now)).toBe(false);
  expect(validSchedule('2026-10-19T15:00:00Z',now)).toBe(true);
  expect(validSchedule('2027-01-18T15:00:00Z',now)).toBe(false);
  expect(validSchedule('invalid',now)).toBe(false);
 });
});
