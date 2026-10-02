import { getSupabase } from './auth.js';

const form = document.getElementById('login-form');
const message = document.getElementById('login-message');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;

    try {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signInWithPassword({
            email: form.elements.email.value,
            password: form.elements.password.value
        });

        if (error) throw error;
        window.location.replace('/');
    } catch (error) {
        message.textContent = error.message || 'Sign in failed';
    } finally {
        submit.disabled = false;
    }
});

getSupabase()
    .then((supabase) => supabase.auth.getSession())
    .then(({ data }) => {
        if (data.session) window.location.replace('/');
    })
    .catch((error) => {
        message.textContent = error.message;
    });
