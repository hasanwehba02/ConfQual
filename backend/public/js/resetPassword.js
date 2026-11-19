import { getSupabase } from './auth.js';
import { recoveryFactor, recoveryTokens } from './recovery.mjs';

const description = document.getElementById('recovery-description');
const message = document.getElementById('recovery-message');
const form = document.getElementById('recovery-form');
const mfaForm = document.getElementById('recovery-mfa-form');
const lostFactor = document.getElementById('recovery-lost-factor');
const signoutRetry = document.getElementById('recovery-signout-retry');
const tokens = recoveryTokens(window.location.hash);
window.history.replaceState(null, '', window.location.pathname);
let factorId;

async function initialize() {
    if (!tokens) {
        description.textContent = 'This reset link is invalid or has expired. Request a new link.';
        return;
    }
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.setSession(tokens);
    if (error || !data.session) throw error || new Error('Reset session unavailable');
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const factor = recoveryFactor(factors.data.all);
    if (factor.state !== 'password') {
        lostFactor.hidden = false;
        if (factor.state === 'unsupported') {
            description.textContent = 'This account needs an MFA method that this page cannot verify.';
            return;
        }
        factorId = factor.factorId;
        description.textContent = 'Enter the code from your authenticator before changing your password.';
        mfaForm.hidden = false;
        mfaForm.elements.code.focus();
    } else {
        showPasswordForm();
    }
}

function showPasswordForm() {
    description.textContent = 'Enter a new password of at least 12 characters.';
    mfaForm.hidden = true;
    form.hidden = false;
    form.elements.password.focus();
}

mfaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const code = mfaForm.elements.code.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
        message.textContent = 'Enter the six-digit code.';
        return;
    }
    const submit = mfaForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const supabase = await getSupabase();
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
        if (verified.error) throw verified.error;
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error || assurance.data.currentLevel !== 'aal2') throw new Error('MFA verification failed');
        showPasswordForm();
    } catch {
        message.textContent = 'Authenticator verification failed. Try again.';
        mfaForm.elements.code.value = '';
        mfaForm.elements.code.focus();
    } finally {
        submit.disabled = false;
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const password = form.elements.password.value;
    if (password !== form.elements.confirm.value) {
        message.textContent = 'Passwords do not match.';
        return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
    } catch {
        message.textContent = 'The password could not be updated. Please try again.';
        submit.disabled = false;
        return;
    }
    form.reset();
    form.hidden = true;
    await closeRecoverySession();
});

async function closeRecoverySession() {
    signoutRetry.disabled = true;
    try {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) throw error;
        description.textContent = 'Password updated. Sign in with your new password.';
        message.textContent = '';
        signoutRetry.hidden = true;
    } catch {
        description.textContent = 'Password updated, but this browser session could not be closed.';
        message.textContent = 'Try signing out again before leaving this device.';
        signoutRetry.hidden = false;
    } finally {
        signoutRetry.disabled = false;
    }
}

signoutRetry.addEventListener('click', closeRecoverySession);

initialize().catch(() => {
    description.textContent = 'This reset link is invalid or has expired. Request a new link.';
});
