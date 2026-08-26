// Shared mutable application state.
export const state = {
    allPapers: [],
    allReviewers: [],
    activePaperFilter: null,
    activeReviewerFilter: null,
    activeConferenceId: null, // null = most-recent
    loadedConferences: [],
    isCurrentAnonymized: false,
};
