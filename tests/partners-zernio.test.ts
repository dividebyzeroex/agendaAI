import { describe, expect, it } from 'vitest';
import { scopedAccounts, validSchedule, validMediaItems, mediaRequired } from '../server/zernio.js';

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
 it('requires future instants with a 30-second safety margin and 90-day cap', () => {
  expect(validSchedule('2026-10-18T15:01:00Z',now)).toBe(true);
  expect(validSchedule('2026-10-19T15:00:00Z',now)).toBe(true);
  expect(validSchedule('2027-01-18T15:00:00Z',now)).toBe(false);
  expect(validSchedule('invalid',now)).toBe(false);
 });
});

describe('Same-day scheduling and media guardrails', () => {
  const brazilNoon = Date.parse('2026-10-18T15:00:00Z');
  it('accepts later today with ISO UTC or timezone offset without another conversion', () => {
    expect(validSchedule('2026-10-18T16:00:00Z',brazilNoon)).toBe(true);
    expect(validSchedule('2026-10-18T13:00:00-03:00',brazilNoon)).toBe(true);
    expect(validSchedule('2026-10-18T13:00:00',brazilNoon)).toBe(false);
    expect(validSchedule('2026-10-18T11:59:00-03:00',brazilNoon)).toBe(false);
    expect(validSchedule('2026-10-18T15:00:15Z',brazilNoon)).toBe(false);
  });
  it('accepts a trusted uploaded image and rejects unrelated or insecure URLs', () => {
    expect(validMediaItems([{url:'https://media.zernio.com/temp/a1_photo.jpg',type:'image'}])).toBe(true);
    expect(validMediaItems([{url:'https://media.zernio.com/temp/clip.mp4',type:'video'}])).toBe(true);
    expect(validMediaItems([{url:'https://example.com/any.jpg',type:'image'}])).toBe(false);
    expect(validMediaItems([{url:'http://media.zernio.com/temp/photo.jpg',type:'image'}])).toBe(false);
    expect(validMediaItems([{url:'https://media.zernio.com.evil.example/temp/photo.jpg',type:'image'}])).toBe(false);
    expect(validMediaItems(Array(11).fill({url:'https://media.zernio.com/temp/photo.jpg',type:'image'}))).toBe(false);
  });
  it('never allows Instagram text-only posts to reach the posting API', () => {
    const instagram=[{platform:'instagram'}];
    const linkedin=[{platform:'linkedin'}];
    expect(mediaRequired(instagram,[])).toBe(true);
    expect(mediaRequired(instagram,[{type:'image'}])).toBe(false);
    expect(mediaRequired(linkedin,[])).toBe(false);
  });
});
