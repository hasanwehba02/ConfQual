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
