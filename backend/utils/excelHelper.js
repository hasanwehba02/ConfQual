function extractValue(cell) {
    if (!cell) return null;
    if (cell.text !== undefined && cell.text !== null) {
        return cell.text;
    }
    if (typeof cell.value === 'object' && cell.value !== null) {
        if (cell.value.result !== undefined) return cell.value.result;
        if (cell.value.text !== undefined) return cell.value.text;
    }
    return cell.value;
}

function normalizeSheetName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .trim()
        .replace(/[\s_\-]+/g, '');
}

function findWorksheet(workbook, candidateNames = []) {
    if (!workbook || !workbook.worksheets || workbook.worksheets.length === 0) return null;

    const normalizedCandidates = candidateNames.map(c => normalizeSheetName(c));
    const singularCandidates = normalizedCandidates.map(c => c.endsWith('s') ? c.slice(0, -1) : c);

    // 1. Exact normalized match (e.g. 'paper bidding' -> 'paperbidding' === 'paperbidding')
    for (const sheet of workbook.worksheets) {
        const norm = normalizeSheetName(sheet.name);
        const normSingular = norm.endsWith('s') ? norm.slice(0, -1) : norm;

        if (normalizedCandidates.includes(norm) || singularCandidates.includes(normSingular)) {
            return sheet;
        }
    }

    // 2. Direct getWorksheet lookup
    for (const name of candidateNames) {
        const sheet = workbook.getWorksheet(name);
        if (sheet) return sheet;
    }

    return null;
}

module.exports = {
    extractValue,
    findWorksheet
};
