export function getScoreBadgeClass(score) {
    if (!score && score !== 0) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (score >= 2) return 'bg-green-50 text-green-700 border-green-200';
    if (score <= -2) return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-yellow-50 text-yellow-700 border-yellow-200';
}

export function getScoreBadgeColor(score) {
    if (!score && score !== 0) return 'gray';
    if (score >= 2) return 'green';
    if (score <= -2) return 'red';
    return 'yellow';
}

export function getBiasBadgeClass(biasLabel) {
    switch (biasLabel) {
        case 'calibrated':
            return 'bg-neutral';
        case 'lenient':
        case 'strict':
            return 'bg-warning-light';
        case 'extreme':
            return 'bg-danger-light';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

export function getBiasBadgeColor(biasLabel) {
    switch (biasLabel) {
        case 'calibrated':
            return 'neutral';
        case 'lenient':
        case 'strict':
            return 'warning';
        case 'extreme':
            return 'danger';
        default:
            return 'gray';
    }
}
