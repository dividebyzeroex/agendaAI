import {describe,expect,it} from 'vitest';
import {passwordRequirements,isValidSignupPassword,signupErrorMessage,classifySignupError} from '../src/app/core/signup-guardrails';

describe('Signup checks before company onboarding',()=>{
  it('rejects the 8-character-only policy that previously caused the screenshot error',()=>{
    expect(isValidSignupPassword('abcdefgh')).toBe(false);
    expect(isValidSignupPassword('ABCDEFGH')).toBe(false);
    expect(isValidSignupPassword('Abcdefgh')).toBe(false);
    expect(isValidSignupPassword('Abcdefg1')).toBe(true);
    expect(isValidSignupPassword('')).toBe(false);
    expect(passwordRequirements('Abcdefg1').every(x=>x.valid)).toBe(true);
  });
  it('translates Supabase weak-password errors rather than exposing English server messages',()=>{
    const err={code:'weak_password',status:422,message:'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.'};
    expect(classifySignupError(err)).toBe('password');
    expect(signupErrorMessage(err)).toContain('letra minúscula, maiúscula e número');
    expect(signupErrorMessage(err)).not.toMatch(/Password|0123456789/);
  });
  it('offers human-readable options on duplicate accounts, throttling, outage and unknown backend failures',()=>{
    expect(signupErrorMessage({code:'user_already_exists',message:'User already registered'})).toContain('já possui uma conta');
    expect(signupErrorMessage({status:429,message:'Too many requests'})).toContain('Aguarde');
    expect(signupErrorMessage(new Error('Failed to fetch'))).toContain('internet');
    expect(signupErrorMessage({code:'internal_unknown',message:'SQL_OWNERSHIP_ERROR: stack trace #123'})).not.toContain('SQL_OWNERSHIP_ERROR');
  });
});
