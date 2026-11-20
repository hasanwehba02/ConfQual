import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryRedirect, recoveryTokens, recoveryFactor } from '../public/js/recovery.mjs';

test('recovery redirect uses only the current origin and fixed reset path', () => {
    assert.equal(recoveryRedirect('https://confqual.example'), 'https://confqual.example/reset-password.html');
    assert.equal(recoveryRedirect('http://127.0.0.1:3000'), 'http://127.0.0.1:3000/reset-password.html');
});

test('reset form accepts only complete recovery fragments', () => {
    assert.deepEqual(recoveryTokens('#access_token=a&refresh_token=b&type=recovery'), {
        access_token: 'a', refresh_token: 'b'
    });
    for (const hash of [
        '', '#error=access_denied&type=recovery', '#access_token=a&refresh_token=b&type=invite',
        '#access_token=a&type=recovery', '#refresh_token=b&type=recovery',
        '#access_token=a&refresh_token=b&type=recovery&error=expired'
    ]) {
        assert.equal(recoveryTokens(hash), null, hash);
    }
});

test('password recovery challenges verified TOTP and blocks unsupported MFA', () => {
    assert.deepEqual(recoveryFactor([]), { state: 'password' });
    assert.deepEqual(recoveryFactor([{ id: 'pending', status: 'unverified', factor_type: 'totp' }]), { state: 'password' });
    assert.deepEqual(recoveryFactor([{ id: 'factor', status: 'verified', factor_type: 'totp' }]), {
        state: 'totp', factorId: 'factor'
    });
    assert.deepEqual(recoveryFactor([{ id: 'phone', status: 'verified', factor_type: 'phone' }]), {
        state: 'unsupported'
    });
    assert.deepEqual(recoveryFactor([{ status: 'verified', factor_type: 'totp' }]), {
        state: 'unsupported'
    });
});
