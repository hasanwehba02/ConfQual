import { getSupabase, getWorkspaceAccount, needsMfa } from './auth.js';

const form = document.getElementById('login-form');
const message = document.getElementById('login-message');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;

    try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.auth.signInWithPassword({
            email: form.elements.email.value,
            password: form.elements.password.value
        });

        if (error) throw error;
        const account = await getWorkspaceAccount(data.session);
        window.location.replace(needsMfa(account) ? '/mfa.html' : '/');
    } catch (error) {
        message.textContent = error.message || 'Sign in failed';
    } finally {
        submit.disabled = false;
    }
});

getSupabase()
    .then((supabase) => supabase.auth.getSession())
    .then(async ({ data, error }) => {
        if (error) throw error;
        if (!data.session) return;
        const account = await getWorkspaceAccount(data.session);
        window.location.replace(needsMfa(account) ? '/mfa.html' : '/');
    })
    .catch((error) => {
        message.textContent = error.message;
    });
