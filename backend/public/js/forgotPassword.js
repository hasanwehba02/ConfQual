import { getSupabase } from './auth.js';
import { recoveryRedirect } from './recovery.mjs';

const form = document.getElementById('recovery-request-form');
const message = document.getElementById('recovery-request-message');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message.textContent = '';
    try {
        const supabase = await getSupabase();
        const redirectTo = recoveryRedirect(window.location.origin);
        const { error } = await supabase.auth.resetPasswordForEmail(form.elements.email.value.trim(), { redirectTo });
        if (error) throw error;
        form.hidden = true;
        message.textContent = 'If this account exists, a password reset link has been sent.';
    } catch {
        message.textContent = 'The reset request could not be sent. Please try again later.';
        submit.disabled = false;
    }
});
