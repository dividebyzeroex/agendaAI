import {expect,it} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.(ts|js)$/.test(e.name)?[e.name]:[]);
it('stays within the 12-function Hobby limit and keeps the health URL',()=>{expect(files('api').length).toBeLessThanOrEqual(12);expect(JSON.parse(readFileSync('vercel.json','utf8')).rewrites).toContainEqual({source:'/api/ping',destination:'/api/commercial?action=ping'});});
