export async function fetchDashboardData() {
    const res = await fetch('/api/analytics/dashboard');
    if (!res.ok) throw new Error('Failed to fetch dashboard data');
    return res.json();
}

export async function fetchSettings() {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
}

export async function saveSettings(settings) {
    const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('Failed to save settings');
    return res.json();
}

export async function logError(errorData) {
    return fetch('/api/analytics/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
    });
}

export async function importData(formData) {
    const res = await fetch('/api/analytics/import', {
        method: 'POST',
        body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Import failed');
    return result;
}

export async function fetchPapers(limit = 10000, offset = 0) {
    const res = await fetch(`/api/analytics/papers?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch papers');
    return res.json();
}

export async function fetchReviewers(limit = 10000, offset = 0) {
    const res = await fetch(`/api/analytics/reviewers?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch reviewers');
    return res.json();
}

export async function fetchSubmissions(limit = 10000, offset = 0) {
    const res = await fetch(`/api/analytics/submissions?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch submissions');
    return res.json();
}
