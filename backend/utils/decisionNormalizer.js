function normalizeDecision(rawDecision) {
    if (!rawDecision) return 'No Decision';
    
    const lower = String(rawDecision).toLowerCase();
    
    if (lower.includes('desk reject')) {
        return 'Desk Reject';
    }
    
    // Check for "reject but accept to forum"
    if (lower.includes('reject but accept')) {
        return 'Reject'; // or whatever the default rule is
    }
    
    if (lower.includes('accept')) {
        return 'Accept';
    }
    
    if (lower.includes('reject')) {
        return 'Reject';
    }
    
    if (lower.includes('withdrawn')) {
        return 'Withdrawn';
    }
    
    return 'No Decision';
}

module.exports = {
    normalizeDecision
};
