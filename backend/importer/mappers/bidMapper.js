const { extractValue } = require('../../utils/excelHelper');

function mapBid(row, headerMap) {
    if (headerMap) {
        const getVal = (...names) => {
            for (const name of names) {
                const idx = headerMap[name.toLowerCase()];
                if (idx) return extractValue(row.getCell(idx));
            }
            return null;
        };
        const memberVal = getVal('member #', 'person #', 'member id', 'person id', 'reviewer #', 'reviewer id', 'reviewer person #', 'member', 'reviewer');
        const submissionVal = getVal('submission #', 'paper #', 'submission id', 'paper id', 'submission', 'paper');
        const bidVal = getVal('bid', 'bidding', 'bid status', 'bids', 'response');

        return {
            externalPersonId: memberVal ?? extractValue(row.getCell(1)),
            externalSubmissionId: submissionVal ?? extractValue(row.getCell(2)),
            bid: bidVal ?? extractValue(row.getCell(3))
        };
    }
    return {
        externalPersonId: extractValue(row.getCell(1)),
        externalSubmissionId: extractValue(row.getCell(2)),
        bid: extractValue(row.getCell(3))
    };
}

module.exports = mapBid;
