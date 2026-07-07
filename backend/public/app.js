document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('upload-btn');
    const uploadDrawer = document.getElementById('upload-drawer');
    const closeUploadDrawer = document.getElementById('close-upload-drawer');
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('excelFile');
    const dropZone = document.getElementById('drop-zone');
    const loadingState = document.getElementById('loading-state');
    const submitBtn = document.getElementById('submit-upload');
    
    const dashboardContent = document.getElementById('dashboard-content');
    const triageSidebar = document.getElementById('triage-sidebar');
    const emptyState = document.getElementById('empty-state');
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const detailDrawer = document.getElementById('detail-drawer');
    const closeDetailDrawer = document.getElementById('close-detail-drawer');

    let reviewerChartInstance = null;
    let debatesChartInstance = null;
    
    let allPapers = [];
    let allReviewers = [];
    let activePaperFilter = null;
    let activeReviewerFilter = null;
    
    // --- Global Filter Functions ---
    window.applyFilterAndNavigate = function(targetTabId, filterKey, idsJson, customTitle) {
        const ids = JSON.parse(idsJson).map(id => parseInt(id, 10));
        
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.add('hidden'));
        
        const targetBtn = document.querySelector(`[data-target='${targetTabId}']`);
        if (targetBtn) targetBtn.classList.add('active');
        const targetDiv = document.getElementById(targetTabId);
        if (targetDiv) targetDiv.classList.remove('hidden');

        if (filterKey === 'paper') {
            activePaperFilter = ids;
            renderPapersTable(allPapers);
            const banner = document.getElementById('paper-filter-banner');
            if (banner) {
                banner.classList.remove('hidden');
                document.getElementById('paper-filter-count').textContent = ids.length;
            }
            if (customTitle) {
                const titleEl = document.querySelector('#tab-papers h2');
                if (titleEl) titleEl.textContent = customTitle;
            }
        } else if (filterKey === 'reviewer') {
            activeReviewerFilter = ids;
            renderReviewersTable(allReviewers);
            const banner = document.getElementById('reviewer-filter-banner');
            if (banner) {
                banner.classList.remove('hidden');
                document.getElementById('reviewer-filter-count').textContent = ids.length;
            }
            if (customTitle) {
                const titleEl = document.querySelector('#tab-reviewers h2');
                if (titleEl) titleEl.textContent = customTitle;
            }
        }
    };
    
    window.clearFilters = function(type) {
        if (type === 'paper') {
            activePaperFilter = null;
            renderPapersTable(allPapers);
            const banner = document.getElementById('paper-filter-banner');
            if (banner) banner.classList.add('hidden');
            const titleEl = document.querySelector('#tab-papers h2');
            if (titleEl) titleEl.textContent = 'Paper Explorer';
        } else if (type === 'reviewer') {
            activeReviewerFilter = null;
            renderReviewersTable(allReviewers);
            const banner = document.getElementById('reviewer-filter-banner');
            if (banner) banner.classList.add('hidden');
            const titleEl = document.querySelector('#tab-reviewers h2');
            if (titleEl) titleEl.textContent = 'Reviewer Explorer';
        }
    };

    window.exportTableToCSV = function(tbodyId, filename) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        let csvContent = "\uFEFF"; // BOM
        const table = tbody.closest('table');
        if (table) {
            const headers = Array.from(table.querySelectorAll('th')).map(th => `"${(th.textContent || '').trim().replace(/"/g, '""')}"`);
            csvContent += headers.join(",") + "\r\n";
        }

        rows.forEach(row => {
            const cols = Array.from(row.querySelectorAll('td')).map(td => {
                let text = (td.textContent || '').trim().replace(/"/g, '""');
                text = text.replace(/\r?\n|\r/g, " ");
                return `"${text}"`;
            });
            csvContent += cols.join(",") + "\r\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Drawers ---
    window.openPaperModal = async function(externalId) {
        detailDrawer.classList.add('open');
        detailDrawer.classList.remove('closed');
        
        const drawerTitle = document.getElementById('detail-drawer-title');
        const drawerBody = document.getElementById('detail-drawer-body');
        
        drawerTitle.textContent = `PAPER #${externalId}`;
        drawerBody.innerHTML = '<div class="spinner"></div>';

        try {
            const res = await fetch(`/api/analytics/papers/${externalId}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const paper = await res.json();
            
            let mismatchCount = 0;
            if (paper.reviews && paper.reviews.length > 0) {
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
                    const pArr = pTopics.split(', ').map(t => t.trim().toLowerCase());
                    const rArr = rTopics.split(', ').map(t => t.trim().toLowerCase());
                    if (pArr.some(pt => rArr.includes(pt))) return false;
                    
                    const pWords = extractWords(pTopics);
                    const rWords = extractWords(rTopics);
                    return !pWords.some(pw => rWords.includes(pw));
                };

                paper.reviews.forEach(r => {
                    r.isMismatch = checkMismatch(paper.topics, r.topics);
                    if (r.isMismatch) mismatchCount++;
                });

                paper.reviews.sort((a, b) => {
                    if (a.isMismatch && !b.isMismatch) return -1;
                    if (!a.isMismatch && b.isMismatch) return 1;
                    return 0;
                });
            }

            const mismatchBadgeHtml = mismatchCount > 0 
                ? `<span style="background: #e63946; color: white; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${mismatchCount} MISMATCHED REVIEW(S)</span>` 
                : '';

            let html = `
                <h3 style="font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: space-between;">
                    <span>${paper.title}</span>
                    ${mismatchBadgeHtml}
                </h3>
                <p style="font-family: 'Roboto Mono', monospace; font-size: 0.85rem; margin-bottom: 1.5rem; color: var(--text-muted);">
                    <strong>PAPER TOPICS:</strong> ${paper.topics || 'None'}
                </p>
                
                <h3>REVIEWS (${paper.reviews ? paper.reviews.length : 0})</h3>
                <div class="detail-list">
            `;
            
            if (paper.reviews && paper.reviews.length > 0) {
                // Same fuzzy logic as backend
                const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'based', 'system', 'systems', 'science', 'engineering']);
                const extractWords = (str) => {
                    if (!str) return [];
                    return str.toLowerCase()
                              .replace(/[^a-z0-9]/g, ' ')
                              .split(/\s+/)
                              .filter(w => w.length > 2 && !stopWords.has(w));
                };

                const checkMismatch = (pTopics, rTopics) => {
                    if (!pTopics || !rTopics) return false; // If either has no topics, it's not flagged as mismatch by backend
                    
                    // Exact topic check
                    const pArr = pTopics.split(', ').map(t => t.trim().toLowerCase());
                    const rArr = rTopics.split(', ').map(t => t.trim().toLowerCase());
                    if (pArr.some(pt => rArr.includes(pt))) return false;
                    
                    // Fuzzy check
                    const pWords = extractWords(pTopics);
                    const rWords = extractWords(rTopics);
                    const hasOverlap = pWords.some(pw => rWords.includes(pw));
                    return !hasOverlap;
                };

                // Add isMismatch flag to each review
                paper.reviews.forEach(r => {
                    r.isMismatch = checkMismatch(paper.topics, r.topics);
                });

                // Sort reviews so mismatches appear first
                paper.reviews.sort((a, b) => {
                    if (a.isMismatch && !b.isMismatch) return -1;
                    if (!a.isMismatch && b.isMismatch) return 1;
                    return 0;
                });

                paper.reviews.forEach(r => {
                    const mismatchBadge = r.isMismatch 
                        ? `<span style="background: #e63946; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px;">MISMATCH</span>` 
                        : '';
                        
                    html += `
                        <div class="detail-item" style="${r.isMismatch ? 'border-left: 3px solid #e63946;' : ''}">
                            <div class="detail-item-header">
                                <span>${r.first_name || ''} ${r.last_name || r.id} ${mismatchBadge}</span>
                                <span>SCORE: ${r.total_score}</span>
                            </div>
                            <div class="detail-text" style="font-family: 'Roboto Mono', monospace; font-size: 0.75rem; margin-bottom: 0.5rem;">
                                <strong>REVIEWER EXPERTISE:</strong> ${r.topics || 'None'}
                            </div>
                            <div class="detail-text">${r.review_text || 'No review text'}</div>
                        </div>
                    `;
                });
            } else {
                html += '<p class="text-muted">No reviews found.</p>';
            }
            
            html += `</div><h3>COMMENTS (${paper.comments ? paper.comments.length : 0})</h3><div class="detail-list">`;
            
            if (paper.comments && paper.comments.length > 0) {
                paper.comments.forEach(c => {
                    html += `
                        <div class="detail-item">
                            <div class="detail-item-header">${c.first_name} ${c.last_name}</div>
                            <div class="detail-text">${c.comment_text}</div>
                        </div>
                    `;
                });
            } else {
                html += '<p class="text-muted">No comments found.</p>';
            }
            
            html += '</div>';
            drawerBody.innerHTML = html;
        } catch (error) {
            drawerBody.innerHTML = '<p class="text-danger">Failed to load paper details.</p>';
        }
    };

    window.openReviewerModal = async function(reviewerId, name) {
        detailDrawer.classList.add('open');
        detailDrawer.classList.remove('closed');
        
        const drawerTitle = document.getElementById('detail-drawer-title');
        const drawerBody = document.getElementById('detail-drawer-body');
        
        drawerTitle.textContent = `REVIEWER: ${name}`;
        drawerBody.innerHTML = '<div class="spinner"></div>';

        try {
            const res = await fetch(`/api/analytics/reviewers/${reviewerId}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const rev = await res.json();
            
            let html = `
                <p style="font-family: 'Roboto Mono', monospace; font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>ROLE:</strong> ${rev.role}</p>
                <p style="font-family: 'Roboto Mono', monospace; font-size: 0.85rem; margin-bottom: 1.5rem;"><strong>EMAIL:</strong> ${rev.email || 'N/A'}</p>
                
                <h3>PAPER ASSIGNMENTS (${rev.assignments ? rev.assignments.length : 0})</h3>
                <div class="detail-list">
            `;
            
            if (rev.assignments && rev.assignments.length > 0) {
                rev.assignments.forEach(a => {
                    let commentsHtml = '';
                    if (a.comments && a.comments.length > 0) {
                        let validComments = a.comments.filter(c => c !== null && c.trim() !== '');
                        if (validComments.length > 0) {
                            commentsHtml = `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-light);">`;
                            validComments.forEach(c => {
                                commentsHtml += `<div class="detail-text" style="font-size: 0.8rem; font-style: italic; color: var(--text-muted); margin-bottom: 0.25rem;">💬 "${c}"</div>`;
                            });
                            commentsHtml += `</div>`;
                        } else if (a.comments.includes(null)) {
                            commentsHtml = `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-light);">`;
                            commentsHtml += `<div class="detail-text" style="font-size: 0.8rem; font-style: italic; color: var(--text-muted); margin-bottom: 0.25rem;">💬 <em>[Comment text redacted in dataset]</em></div>`;
                            commentsHtml += `</div>`;
                        }
                    }

                    html += `
                        <div class="detail-item">
                            <div class="detail-item-header">
                                <span>#${a.external_submission_id}</span>
                                <span>GIVEN SCORE: ${a.given_score ?? 'PENDING'}</span>
                            </div>
                            <div class="detail-text" style="margin-bottom: 0.5rem;">${a.title}</div>
                            <div class="detail-text" style="font-family: 'Roboto Mono', monospace; font-size: 0.75rem;">
                                <strong>BID STATUS:</strong> ${a.bid_status ?? 'NO BID'}
                            </div>
                            ${commentsHtml}
                        </div>
                    `;
                });
            } else {
                html += '<p class="text-muted">No assignments found.</p>';
            }
            
            html += `</div>`;

            html += `<h3>SUBMITTED BIDS (${rev.bids ? rev.bids.length : 0})</h3>`;
            html += `<div class="detail-list" style="margin-top: 1rem;">`;
            
            if (rev.bids && rev.bids.length > 0) {
                // Highlight 'yes' or 'maybe' bids differently from 'no' or 'conflict'
                rev.bids.sort((a, b) => {
                    const order = { 'yes': 1, 'maybe': 2, 'no': 3, 'conflict': 4 };
                    return (order[a.bid.toLowerCase()] || 5) - (order[b.bid.toLowerCase()] || 5);
                });

                rev.bids.forEach(b => {
                    let bidColor = 'var(--text-muted)';
                    if (b.bid.toLowerCase() === 'yes') bidColor = '#4caf50';
                    if (b.bid.toLowerCase() === 'maybe') bidColor = '#ff9800';
                    if (b.bid.toLowerCase() === 'no') bidColor = '#e63946';

                    html += `
                        <div class="detail-item" style="padding: 0.75rem;">
                            <div class="detail-item-header" style="margin-bottom: 0.25rem;">
                                <span>#${b.external_submission_id}</span>
                                <span style="color: ${bidColor}; font-weight: bold; text-transform: uppercase;">${b.bid}</span>
                            </div>
                            <div class="detail-text" style="font-size: 0.8rem;">${b.title}</div>
                        </div>
                    `;
                });
            } else {
                html += '<p class="text-muted" style="margin-bottom: 2rem;">No bids recorded for this reviewer.</p>';
            }
            html += '</div>';
            drawerBody.innerHTML = html;
        } catch (error) {
            drawerBody.innerHTML = '<p class="text-danger">Failed to load reviewer details.</p>';
        }
    };

    closeDetailDrawer.addEventListener('click', () => {
        detailDrawer.classList.remove('open');
        detailDrawer.classList.add('closed');
    });

    // --- Initialization ---
    async function checkExistingData() {
        try {
            const res = await fetch('/api/analytics/conference-health');
            const health = await res.json();
            if (health && parseInt(health.total_papers) > 0) {
                emptyState.classList.add('hidden');
                dashboardContent.classList.remove('hidden');
                triageSidebar.classList.remove('hidden');
                await loadDashboardData();
            }
        } catch (e) {
            console.log("No existing data found or server offline");
        }
    }
    
    checkExistingData();

    // --- UI Interactions ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
            
            if (targetId === 'tab-papers') {
                clearFilters('paper');
            } else if (targetId === 'tab-reviewers') {
                clearFilters('reviewer');
            }
        });
    });

    uploadBtn.addEventListener('click', () => {
        uploadDrawer.classList.add('open');
        uploadDrawer.classList.remove('closed');
    });

    closeUploadDrawer.addEventListener('click', () => {
        uploadDrawer.classList.remove('open');
        uploadDrawer.classList.add('closed');
    });

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to clear all conference data? This cannot be undone.")) {
                try {
                    const res = await fetch('/api/analytics/reset', { method: 'POST' });
                    if (res.ok) {
                        window.location.reload();
                    } else {
                        alert("Failed to reset data.");
                    }
                } catch (e) {
                    alert("Error resetting data.");
                }
            }
        });
    }

    // Global Drag and Drop Auto-import
    let dragCounter = 0;
    const globalDragOverlay = document.getElementById('global-drag-overlay');

    document.body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (globalDragOverlay) globalDragOverlay.classList.remove('hidden');
    });

    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (globalDragOverlay) globalDragOverlay.classList.add('hidden');
        }
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (globalDragOverlay) globalDragOverlay.classList.add('hidden');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            updateDropZoneText();
            // Auto trigger submit if not already loading
            if (loadingState.classList.contains('hidden')) {
                uploadForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        }
    });

    fileInput.addEventListener('change', updateDropZoneText);

    function updateDropZoneText() {
        if (fileInput.files.length > 0) {
            const fileName = fileInput.files[0].name;
            dropZone.querySelector('p').textContent = `SELECTED: ${fileName}`;
        }
    }

    // Upload Submission
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (fileInput.files.length === 0) return;

        const formData = new FormData();
        formData.append('excelFile', fileInput.files[0]);

        submitBtn.classList.add('hidden');
        dropZone.classList.add('hidden');
        loadingState.classList.remove('hidden');
        const globalLoadingOverlay = document.getElementById('global-loading-overlay');
        if (globalLoadingOverlay) globalLoadingOverlay.classList.remove('hidden');

        try {
            const response = await fetch('/api/analytics/process-conference', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');
            
            uploadDrawer.classList.remove('open');
            uploadDrawer.classList.add('closed');
            emptyState.classList.add('hidden');
            dashboardContent.classList.remove('hidden');
            triageSidebar.classList.remove('hidden');
            
            await loadDashboardData();

        } catch (error) {
            alert("An error occurred during processing. Please try again.");
            console.error(error);
        } finally {
            submitBtn.classList.remove('hidden');
            dropZone.classList.remove('hidden');
            loadingState.classList.add('hidden');
            const globalLoadingOverlay = document.getElementById('global-loading-overlay');
            if (globalLoadingOverlay) globalLoadingOverlay.classList.add('hidden');
            uploadForm.reset();
            dropZone.querySelector('p').textContent = 'DRAG & DROP .XLSX HERE';
        }
    });

    // --- Dashboard Data Loading ---
    async function loadDashboardData() {
        try {
            const [alertsRes, papersRes, reviewersRes, analyticsRes, qualityRes] = await Promise.all([
                fetch('/api/analytics/alerts'),
                fetch('/api/analytics/papers'),
                fetch('/api/analytics/reviewers'),
                fetch('/api/analytics/system-analytics'),
                fetch('/api/analytics/quality-profile')
            ]);

            const alerts = await alertsRes.json();
            allPapers = await papersRes.json();
            allReviewers = await reviewersRes.json();
            const analytics = await analyticsRes.json();
            const qualityProfile = await qualityRes.json();

            renderAlerts(alerts);
            renderPapersTable(allPapers);
            renderReviewersTable(allReviewers);
            renderAnalytics(analytics);
            renderQualityProfile(qualityProfile);

        } catch (error) {
            console.error("Error loading dashboard data:", error);
        }
    }

    // --- Render Functions ---

    function renderQualityProfile(profile) {
        document.getElementById('compatibility-statement').textContent = profile.compatibilityStatement;
        document.getElementById('stat-acceptance-rate').textContent = `${profile.selectivity.acceptanceRate}%`;
        document.getElementById('stat-selectivity-rank').textContent = profile.selectivity.rank;
        document.getElementById('stat-avg-reviews').textContent = profile.rigor.avgReviewsPerPaper;
        document.getElementById('stat-international-pc').textContent = `${profile.internationalization.internationalPercentage}%`;

        const thematicBody = document.getElementById('thematic-competence-body');
        thematicBody.innerHTML = '';
        profile.thematicCompetence.forEach(topic => {
            const tr = document.createElement('tr');
            const isGap = profile.gapTopics.some(g => g.topic_name === topic.topic_name);
            const expertHtml = isGap 
                ? `<span class="text-danger" title="Expertise Gap"><strong>${topic.available_experts} <i class="ph-fill ph-warning"></i></strong></span>`
                : `<span>${topic.available_experts}</span>`;

            tr.innerHTML = `
                <td style="font-family: 'Roboto Mono', monospace;">${topic.topic_name}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${topic.submitted_papers}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${expertHtml}</td>
            `;
            thematicBody.appendChild(tr);
        });

        document.getElementById('international-percentage').textContent = `${profile.internationalization.internationalPercentage}%`;
        
        let geoBreakdown = `TOTAL PC: ${profile.internationalization.domesticCount + profile.internationalization.internationalCount} | COUNTRIES: ${profile.internationalization.totalCountries}<br>`;
        if (profile.internationalization.domesticCountry !== 'Unknown') {
            geoBreakdown += `DOMESTIC (${profile.internationalization.domesticCountry}): ${profile.internationalization.domesticCount} | INTL: ${profile.internationalization.internationalCount}`;
        }
        document.getElementById('geographic-breakdown').innerHTML = geoBreakdown;
    }

    function renderAlerts(alerts) {
        const container = document.getElementById('alerts-list');
        container.innerHTML = '';
        
        if (alerts.length === 0) {
            container.innerHTML = '<div class="empty-alerts text-muted">No actions required.</div>';
            return;
        }

        alerts.forEach(alert => {
            const card = document.createElement('div');
            card.className = `alert-card ${alert.type}`;
            const idsJson = alert.affectedIds ? JSON.stringify(alert.affectedIds).replace(/"/g, '&quot;') : "[]";
            const safeTitle = alert.title ? alert.title.replace(/'/g, "\\'") : '';
            card.innerHTML = `
                <div class="alert-content">
                    <h3 style="font-family: 'Roboto Mono', monospace;">${alert.title}</h3>
                    <p>${alert.message}</p>
                </div>
                <button class="btn btn-outline btn-sm w-full" onclick="applyFilterAndNavigate('${alert.target}', '${alert.filterKey}', '${idsJson}', '${safeTitle}')">${alert.action}</button>
            `;
            container.appendChild(card);
        });
    }

    function renderPapersTable(papers) {
        const tbody = document.getElementById('papers-table-body');
        tbody.innerHTML = '';
        
        const dataToRender = activePaperFilter ? papers.filter(p => activePaperFilter.includes(parseInt(p.external_submission_id, 10))) : papers;
        
        // Find max variance to scale sparkline
        let maxVariance = 0;
        dataToRender.forEach(p => {
            const val = parseFloat(p.score_variance || 0);
            if (val > maxVariance) maxVariance = val;
        });

        dataToRender.forEach(p => {
            const varVal = parseFloat(p.score_variance || 0);
            const varWidth = maxVariance > 0 ? (varVal / maxVariance) * 100 : 0;
            const sparkClass = varVal > 2.0 ? 'danger' : (varVal > 1.0 ? 'warning' : '');

            const tr = document.createElement('tr');
            tr.onclick = () => openPaperModal(p.external_submission_id);
            tr.innerHTML = `
                <td style="font-family: 'Roboto Mono', monospace;">${p.external_submission_id}</td>
                <td>${p.title}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${p.total_reviews}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${p.average_score || '-'}</td>
                <td>
                    <div class="sparkline-container">
                        <span style="font-family: 'Roboto Mono', monospace; width: 40px;">${p.score_variance || '0.00'}</span>
                        <div style="flex: 1; background: #eee;">
                            <div class="sparkline-bar ${sparkClass}" style="width: ${varWidth}%"></div>
                        </div>
                    </div>
                </td>
                <td style="font-family: 'Roboto Mono', monospace;">${p.total_comments || '0'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderReviewersTable(reviewers) {
        const tbody = document.getElementById('reviewers-table-body');
        tbody.innerHTML = '';
        
        const dataToRender = activeReviewerFilter ? reviewers.filter(r => activeReviewerFilter.includes(parseInt(r.id, 10))) : reviewers;

        // Find max abs calibration for scaling
        let maxCal = 0;
        dataToRender.forEach(r => {
            const cal = Math.abs(parseFloat(r.calibration_index || 0));
            if (cal > maxCal) maxCal = cal;
        });

        dataToRender.forEach(r => {
            const calVal = parseFloat(r.calibration_index || 0);
            const calAbs = Math.abs(calVal);
            const calWidth = maxCal > 0 ? (calAbs / maxCal) * 100 : 0;
            
            let calClass = '';
            let textDisplay = calVal > 0 ? `+${calVal.toFixed(2)}` : calVal.toFixed(2);
            
            if (calVal <= -1.0) {
                calClass = 'danger';
            } else if (calVal >= 1.0) {
                calClass = 'warning';
            }

            const bm = parseFloat(r.bidding_match_percentage);
            const bmHtml = bm < 50 ? `<strong class="text-danger">${bm}%</strong>` : `${bm}%`;

            const tr = document.createElement('tr');
            tr.onclick = () => openReviewerModal(r.id, `${r.first_name} ${r.last_name}`);
            tr.innerHTML = `
                <td style="font-weight: bold;">${r.first_name} ${r.last_name}</td>
                <td><span class="badge bg-neutral">${r.role}</span></td>
                <td style="font-family: 'Roboto Mono', monospace;">${r.total_reviews_completed}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${r.avg_word_count || '0'}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${r.avg_score_given || '-'}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${bmHtml}</td>
                <td>
                    <div class="sparkline-container">
                        <span style="font-family: 'Roboto Mono', monospace; width: 45px; display: inline-block;">${textDisplay}</span>
                        <div style="flex: 1; background: #eee;">
                            <div class="sparkline-bar ${calClass}" style="width: ${calWidth}%"></div>
                        </div>
                    </div>
                </td>
                <td style="font-family: 'Roboto Mono', monospace;">${r.total_comments || '0'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderAnalytics(analytics) {
        document.getElementById('stat-papers').textContent = analytics.health.total_papers;
        document.getElementById('stat-reviewers').textContent = analytics.health.total_reviewers;
        document.getElementById('stat-reviews').textContent = analytics.health.total_reviews;
        document.getElementById('stat-mismatches').textContent = analytics.mismatches.totalMismatches;

        if (analytics.scorecard) {
            const scorecardContainer = document.getElementById('quality-scorecard');
            scorecardContainer.innerHTML = '';
            
            const dimensions = [
                { key: 'coverage', label: 'Review Coverage' },
                { key: 'integrity', label: 'Conflict Integrity' },
                { key: 'satisfaction', label: 'Bidding Satisfaction' },
                { key: 'discussion', label: 'Discussion Health' }
            ];

            dimensions.forEach(dim => {
                const data = analytics.scorecard[dim.key];
                let cssClass = 'danger';
                if (data.score === 100) cssClass = 'perfect';
                else if (data.score >= 80) cssClass = 'good';
                else if (data.score >= 60) cssClass = 'warning';

                let listHtml = '';
                if (data.deductions.length > 0) {
                    listHtml = '<ul style="list-style-type: none; padding-left: 0;">';
                    data.deductions.forEach(d => {
                        if (typeof d === 'string') {
                            listHtml += `<li>${d}</li>`;
                        } else {
                            const idsJson = JSON.stringify(d.affectedIds).replace(/"/g, '&quot;');
                            const safeTitle = d.customTitle ? d.customTitle.replace(/'/g, "\\'") : '';
                            listHtml += `<li style="margin-bottom: 0.5rem;"><a href="#" class="deduction-link" style="color: inherit; text-decoration: underline;" onclick="applyFilterAndNavigate('${d.target}', '${d.filterKey}', '${idsJson}', '${safeTitle}'); return false;">${d.text}</a></li>`;
                        }
                    });
                    listHtml += '</ul>';
                }

                const cardHtml = `
                    <div class="scorecard-card ${cssClass}">
                        <div class="scorecard-header">
                            <span class="scorecard-title">${dim.label}</span>
                            <span class="scorecard-score ${cssClass}">${data.score}</span>
                        </div>
                        <div class="scorecard-deductions">
                            ${listHtml}
                        </div>
                    </div>
                `;
                scorecardContainer.innerHTML += cardHtml;
            });
        }

        if (reviewerChartInstance) reviewerChartInstance.destroy();
        if (debatesChartInstance) debatesChartInstance.destroy();

        // Monochromatic Chart configurations (Tufte-inspired)
        Chart.defaults.font.family = "'Roboto Mono', monospace";
        Chart.defaults.color = '#000000';

        const ctxPie = document.getElementById('reviewerChart').getContext('2d');
        const mainReviewers = parseInt(analytics.health.total_reviewers) - parseInt(analytics.health.total_sub_reviewers);
        
        reviewerChartInstance = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Primary PC', 'Sub-reviewers'],
                datasets: [{
                    data: [mainReviewers, parseInt(analytics.health.total_sub_reviewers)],
                    backgroundColor: ['#000000', '#cccccc'],
                    borderWidth: 1,
                    borderColor: '#ffffff',
                    hoverOffset: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                },
                cutout: '0%',
                layout: { padding: 10 },
                elements: { arc: { roundedCornersFor: 0 } }
            }
        });

        const ctxBar = document.getElementById('debatesChart').getContext('2d');
        const topDebates = analytics.debates.slice(0, 7);
        
        debatesChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: topDebates.map(d => `#${d.external_submission_id}`),
                datasets: [{
                    label: 'VARIANCE',
                    data: topDebates.map(d => parseFloat(d.score_variance)),
                    backgroundColor: '#000000', // Solid black
                    borderColor: '#000000',
                    borderWidth: 0,
                    borderRadius: 0, // No rounded corners
                    barPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        grid: { display: false, drawBorder: true, borderColor: '#000' } // Tufte-style axes
                    },
                    x: {
                        grid: { display: false, drawBorder: true, borderColor: '#000' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
});
