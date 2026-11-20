import { getSession, getSupabase, getWorkspaceAccount, needsMfa, signOut } from './auth.js';

const description = document.getElementById('mfa-description');
const message = document.getElementById('mfa-message');
const enrollSection = document.getElementById('mfa-enroll');
const setupSection = document.getElementById('mfa-setup');
const form = document.getElementById('mfa-form');
const enrollButton = document.getElementById('mfa-enroll-btn');
let supabase;
let factorId;

document.getElementById('mfa-signout').addEventListener('click', async () => {
    message.textContent = '';
    try {
        await signOut();
    } catch {
        message.textContent = 'Sign out failed. Try again.';
    }
});

async function initialize() {
    const session = await getSession();
    if (!session) return window.location.replace('/login.html');
    const account = await getWorkspaceAccount(session);
    if (!account.trustedSetupApproved && !account.mfaSetupAuthorized) {
        description.textContent = 'Workspace access is waiting for an operator to verify your identity through a separate channel and authorize authenticator setup.';
        return;
    }
    if (account.trustedSetupApproved && !needsMfa(account)) return window.location.replace('/');
    if (!needsMfa(account) && account.mfaSetupAuthorized) {
        description.textContent = 'Your authenticator is verified. Workspace access is waiting for operator approval.';
        return;
    }

    supabase = await getSupabase();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const verified = account.trustedSetupApproved
        ? data.totp?.find(factor => factor.id === account.approvedTotpFactorId)
        : data.totp?.[0];
    if (verified) {
        factorId = verified.id;
        description.textContent = 'Enter the code from your authenticator app.';
        form.hidden = false;
    } else {
        if (account.trustedSetupApproved) {
            description.textContent = 'The operator-approved authenticator is unavailable. Contact the operator to begin account recovery.';
            return;
        }
        if (!account.mfaSetupAuthorized) {
            description.textContent = 'No verified authenticator is available. Contact the operator to begin account recovery.';
            return;
        }
        description.textContent = 'An authenticator app is required for this workspace role.';
        enrollSection.hidden = false;
    }
}

enrollButton.addEventListener('click', async () => {
    enrollButton.disabled = true;
    message.textContent = '';
    try {
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) throw factors.error;
        for (const factor of factors.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
            if (error) throw error;
        }
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (error) throw error;
        if (!data.totp?.qr_code?.startsWith('data:image/svg+xml')) {
            throw new Error('Authenticator setup code unavailable');
        }
        factorId = data.id;
        document.getElementById('mfa-qr').src = data.totp.qr_code;
        document.getElementById('mfa-secret').textContent = data.totp.secret;
        enrollSection.hidden = true;
        setupSection.hidden = false;
        form.hidden = false;
        description.textContent = 'Finish setting up your authenticator.';
        form.elements.code.focus();
    } catch (error) {
        message.textContent = error.message || 'Authenticator setup failed';
        enrollButton.disabled = false;
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const code = form.elements.code.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
        message.textContent = 'Enter the six-digit code.';
        return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
        if (verified.error) throw verified.error;
        const session = await getSession();
        const account = await getWorkspaceAccount(session);
        if (needsMfa(account)) throw new Error('Verification did not update this session. Try again.');
        if (!account.trustedSetupApproved) {
            description.textContent = 'Your authenticator is verified. Workspace access is waiting for operator approval.';
            form.hidden = true;
            setupSection.hidden = true;
            return;
        }
        window.location.replace('/');
    } catch (error) {
        message.textContent = error.message || 'Verification failed';
        form.elements.code.value = '';
        form.elements.code.focus();
    } finally {
        submit.disabled = false;
    }
});

initialize().catch((error) => {
    description.textContent = 'Authenticator setup is unavailable.';
    message.textContent = error.message || 'Please try again later.';
});
