window.openProjectorView = async function(externalId) {
    try {
        const res = await fetch(`/api/analytics/papers/${externalId}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const paper = await res.json();

        document.getElementById('projector-title').textContent = `#${externalId}: ${paper.title}`;

        const scoresContainer = document.getElementById('projector-scores');
        const disagreementsContainer = document.getElementById('projector-disagreements');

        scoresContainer.innerHTML = '';
        disagreementsContainer.innerHTML = '';

        if (paper.reviews && paper.reviews.length > 0) {
            // Map backend fields to frontend expectations
            paper.reviews.forEach(r => {
                r.reviewer_name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Reviewer ${r.id}`;
                r.text = r.review_text || 'No review text provided.';
            });

            // Sort reviews by score (highest to lowest)
            paper.reviews.sort((a, b) => b.total_score - a.total_score);

            paper.reviews.forEach(r => {
                const scoreColor = r.total_score >= 1 ? '#10b981' : (r.total_score <= -1 ? '#ef4444' : '#64748b');
                scoresContainer.innerHTML += `
                    <div style="background: #1e293b; border-left: 4px solid ${scoreColor}; padding: 15px 25px; border-radius: 8px; text-align: center; flex: 1; min-width: 150px;">
                        <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 5px; text-transform: uppercase;">${r.reviewer_name}</div>
                        <div style="font-size: 2.5rem; font-weight: bold; color: white;">${r.total_score > 0 ? '+'+r.total_score : r.total_score}</div>
                    </div>
                `;
            });

            const highest = paper.reviews[0];
            const lowest = paper.reviews[paper.reviews.length - 1];

            if (highest.total_score - lowest.total_score > 1) {
                disagreementsContainer.innerHTML = `
                    <div style="background: #1e293b; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981;">
                        <h4 style="color: #10b981; margin-top: 0;">Highest Score: ${highest.total_score > 0 ? '+'+highest.total_score : highest.total_score} (${highest.reviewer_name})</h4>
                        <p style="color: #e2e8f0; line-height: 1.6; font-size: 1.1rem; margin-bottom: 0;">"${highest.text}"</p>
                    </div>
                    <div style="background: #1e293b; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444;">
                        <h4 style="color: #ef4444; margin-top: 0;">Lowest Score: ${lowest.total_score > 0 ? '+'+lowest.total_score : lowest.total_score} (${lowest.reviewer_name})</h4>
                        <p style="color: #e2e8f0; line-height: 1.6; font-size: 1.1rem; margin-bottom: 0;">"${lowest.text}"</p>
                    </div>
                `;
            } else {
                disagreementsContainer.innerHTML = `
                    <div style="background: #1e293b; padding: 20px; border-radius: 8px; text-align: center; color: #94a3b8;">
                        Reviewers generally agree on this paper. (Spread is low)
                    </div>
                `;
            }
        } else {
            scoresContainer.innerHTML = '<div style="color: #94a3b8;">No reviews available.</div>';
        }

        document.getElementById('projector-modal').classList.remove('hidden');
        document.getElementById('projector-modal').style.display = 'flex';
    } catch(err) {
        console.error(err);
        alert("Error loading projector view.");
    }
};

export function wireProjectorModalClose() {
    document.querySelector('#projector-modal button')?.addEventListener('click', () => {
        document.getElementById('projector-modal').classList.add('hidden');
    });
}
