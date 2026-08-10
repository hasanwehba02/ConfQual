const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'based', 'system', 'systems', 'science', 'engineering']);

const extractWords = (str) => {
    if (!str) return [];
    return str.toLowerCase()
              .replace(/[^a-z0-9]/g, ' ')
              .split(/\s+/)
              .filter(w => w.length > 2 && !stopWords.has(w));
};

const checkMismatch = (pTopics, rTopics) => {
    if (!pTopics || !rTopics) return false;
    
    // First check if they have an exact topic match
    const pArr = pTopics.split(', ').map(t => t.trim().toLowerCase());
    const rArr = rTopics.split(', ').map(t => t.trim().toLowerCase());
    if (pArr.some(pt => rArr.includes(pt))) return false;
    
    // If no exact match, check for fuzzy word overlap
    const pWords = extractWords(pTopics);
    const rWords = extractWords(rTopics);
    
    const hasOverlap = pWords.some(pw => rWords.includes(pw));
    
    // If there is ANY overlapping significant word, we accept it as related
    return !hasOverlap;
};

module.exports = {
    checkMismatch,
    extractWords
};
