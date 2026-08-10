function normalizeDecision(decision) {
    if (!decision || typeof decision !== 'string') return 'no decision';
    
    const lower = decision.toLowerCase();
    
    if (lower.includes('withdrawn')) {
        return 'withdrawn';
    } else if (lower.includes('desk reject')) {
        return 'desk reject';
    } else if (lower.includes('reject but accept to forum')) {
        return 'reject';
    } else if (lower.includes('reject')) {
        return 'reject';
    } else if (lower.includes('accept')) {
        return 'accept';
    }
    
    return 'no decision';
}

module.exports = {
    normalizeDecision
};
