import {afterEach,expect,test,vi} from 'vitest';
import {boundedFetch} from '../src/app/core/helpers/bounded-fetch';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
test('returns the response and clears its timer',async()=>{
 vi.useFakeTimers();const response=new Response('[]');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 expect(await boundedFetch('https://example.com')).toBe(response);expect(vi.getTimerCount()).toBe(0);
});
test('aborts a stalled request without retrying',async()=>{
 vi.useFakeTimers();const fetchMock=vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason))));
 vi.stubGlobal('fetch',fetchMock);const pending=expect(boundedFetch('https://example.com')).rejects.toMatchObject({name:'TimeoutError'});
 await vi.advanceTimersByTimeAsync(20000);await pending;expect(fetchMock).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
test('preserves caller cancellation',async()=>{
 const controller=new AbortController();vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))));
 const pending=expect(boundedFetch('https://example.com',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});controller.abort();await pending;
});
