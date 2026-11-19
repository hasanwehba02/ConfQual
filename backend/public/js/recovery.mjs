export function recoveryRedirect(origin) {
    return new URL('/reset-password.html', origin).href;
}

export function recoveryTokens(hash) {
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (params.get('type') !== 'recovery' || !access_token || !refresh_token || params.has('error')) {
        return null;
    }
    return { access_token, refresh_token };
}

export function recoveryFactor(factors) {
    const verified = factors.filter(factor => factor.status === 'verified');
    if (!verified.length) return { state: 'password' };
    const totp = verified.find(factor => factor.factor_type === 'totp' && factor.id);
    return totp ? { state: 'totp', factorId: totp.id } : { state: 'unsupported' };
}
