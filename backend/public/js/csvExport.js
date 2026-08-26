window.exportTableToCSV = function(tbodyId, filename) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));

    let csvContent = "\uFEFF"; // BOM
    const table = tbody.closest('table');
    if (table) {
        const headers = Array.from(table.querySelectorAll('th')).map(th => `"${(th.textContent || '').trim().replace(/"/g, '""')}"`);
        csvContent += headers.join(",") + "\r\n";
    }

    rows.forEach(row => {
        const cols = Array.from(row.querySelectorAll('td')).map(td => {
            let text = (td.textContent || '').trim().replace(/"/g, '""');
            text = text.replace(/\r?\n|\r/g, " ");
            return `"${text}"`;
        });
        csvContent += cols.join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.exportAnalyticsSummary = function() {
    let csvContent = "\uFEFF";
    csvContent += "--- SYSTEM ANALYTICS SUMMARY ---\r\n";
    csvContent += "Metric,Value\r\n";

    const tryGet = (id) => { const el = document.getElementById(id); return el ? el.innerText.replace(/\n/g, ' ') : '0'; };

    csvContent += `"Total Papers","${tryGet('stat-papers')}"\r\n`;
    csvContent += `"Total Reviewers","${tryGet('stat-reviewers')}"\r\n`;
    csvContent += `"Completed Reviews","${tryGet('stat-reviews')}"\r\n`;
    csvContent += `"Expertise Mismatches","${tryGet('stat-mismatches')}"\r\n\r\n`;

    csvContent += "--- AWARDS & HIGHLIGHTS NOMINEES ---\r\n";
    csvContent += "TOP REVIEWERS\r\n";

    const revRows = document.querySelectorAll('#top-reviewers-body tr');
    revRows.forEach(row => {
        const cols = Array.from(row.querySelectorAll('td')).map(td => `"${(td.textContent || '').trim().replace(/"/g, '""')}"`);
        csvContent += cols.join(",") + "\r\n";
    });

    csvContent += "\r\nBEST PAPERS\r\n";
    const papRows = document.querySelectorAll('#top-papers-body tr');
    papRows.forEach(row => {
        const cols = Array.from(row.querySelectorAll('td')).map(td => `"${(td.textContent || '').trim().replace(/"/g, '""')}"`);
        csvContent += cols.join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "system_analytics_summary.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
