const nativeFetch = window.fetch.bind(window);
let clientPromise;

export async function getSupabase() {
    if (!clientPromise) {
        clientPromise = nativeFetch('/api/auth/config')
            .then(async (response) => {
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error || 'Authentication is not configured');
                }

                const config = await response.json();
                return window.supabase.createClient(config.url, config.publishableKey);
            });
    }

    return clientPromise;
}

export async function getSession() {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
}

export async function requireSession() {
    const session = await getSession();
    if (!session) {
        window.location.replace('/login.html');
        return null;
    }
    return session;
}

export async function signOut() {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    window.location.replace('/login.html');
}

export function installAuthenticatedFetch() {
    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.startsWith('/api/') || url === '/api/auth/config') {
            return nativeFetch(input, init);
        }

        const session = await getSession();
        const headers = new window.Headers(
            init.headers || (input instanceof window.Request ? input.headers : undefined)
        );
        if (session?.access_token) {
            headers.set('Authorization', `Bearer ${session.access_token}`);
        }

        const response = await nativeFetch(input, { ...init, headers });
        if (response.status === 401 && window.location.pathname !== '/login.html') {
            window.location.replace('/login.html');
        }
        return response;
    };
}
