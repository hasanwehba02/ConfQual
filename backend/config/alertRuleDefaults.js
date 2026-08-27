module.exports = {
    'paper.high_spread_min': { default: 2, label: 'High spread threshold', domain: 'papers' },
    'paper.unanimous_reject_avg': { default: -1.5, label: 'Unanimous reject avg', domain: 'papers' },
    'paper.unanimous_accept_avg': { default: 1.5, label: 'Unanimous accept avg', domain: 'papers' },
    'paper.borderline_low': { default: -0.5, label: 'Borderline low bound', domain: 'papers' },
    'paper.borderline_high': { default: 0.5, label: 'Borderline high bound', domain: 'papers' },
    'reviewer.high_calibration_abs': { default: 1.5, label: 'High calibration |deviation|', domain: 'reviewers' },
};
