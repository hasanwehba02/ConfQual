function extractValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) {
        return null;
    }
    
    // If the cell contains a formula object, return its evaluated result
    if (typeof cell.value === 'object' && 'result' in cell.value) {
        return cell.value.result;
    }
    
    return cell.value;
}

module.exports = {
    extractValue
};
