const { analyticsRepository } = require("./common");

// 6. Academic Quality Profile (CORE / GII-GRIN-SCIE)
async function getAcademicQualityProfile(prefetched = null, conferenceId = null) {
    const cid = conferenceId;
    const health = prefetched?.health || await analyticsRepository.getConferenceHealth(cid);
    const acceptance = await analyticsRepository.getAcceptanceRate(cid);
    const diversity = prefetched?.diversity || await analyticsRepository.getGeographicDiversity(cid);
    const competence = await analyticsRepository.getThematicCompetence(cid);

    const totalPapers = parseInt(health?.total_papers) || 0;
    const acceptedPapers = parseInt(acceptance?.accepted_papers) || 0;
    const acceptanceRate = totalPapers > 0 ? ((acceptedPapers / totalPapers) * 100).toFixed(1) : 0;

    let rank = "Unranked / Regional";
    if (acceptanceRate > 0 && acceptanceRate <= 20) {
        rank = "A* / Top-Tier Elite";
    } else if (acceptanceRate > 20 && acceptanceRate <= 28) {
        rank = "A / Leading International";
    } else if (acceptanceRate > 28 && acceptanceRate <= 38) {
        rank = "B / Good International";
    } else if (acceptanceRate > 38) {
        rank = "C / Regional";
    }

    const totalReviews = parseInt(health?.total_reviews) || 0;
    const avgReviewsPerPaper = totalPapers > 0 ? (totalReviews / totalPapers).toFixed(1) : 0;

    let domesticCountry = "Unknown";
    let domesticCount = 0;
    let internationalCount = 0;
    const totalCountries = diversity ? diversity.length : 0;

    if (diversity && diversity.length > 0) {
        domesticCountry = diversity[0].country;
        domesticCount = parseInt(diversity[0].member_count) || 0;
        for (let i = 1; i < diversity.length; i++) {
            internationalCount += parseInt(diversity[i].member_count) || 0;
        }
    }

    const totalPC = domesticCount + internationalCount;
    const internationalPercentage = totalPC > 0 ? ((internationalCount / totalPC) * 100).toFixed(1) : 0;

    const gapTopics = competence ? competence.filter(c => parseInt(c.available_experts) === 0 && parseInt(c.submitted_papers) > 0) : [];

    let statement = `Conference demonstrates ${rank} selectivity characteristics with an acceptance rate of ${acceptanceRate}%. `;
    statement += `Peer review rigor is established with an average of ${avgReviewsPerPaper} reviews per submission. `;
    if (totalPC > 0) {
        statement += `The Program Committee includes members from ${totalCountries} countries (${internationalPercentage}% international diversity). `;
    }
    if (gapTopics.length > 0) {
        statement += `Identified ${gapTopics.length} topic areas with submissions but no matched PC expertise.`;
    }

    return {
        selectivity: {
            acceptanceRate,
            rank,
            acceptedPapers,
            totalPapers
        },
        rigor: {
            avgReviewsPerPaper,
            totalReviews
        },
        internationalization: {
            domesticCountry,
            domesticCount,
            internationalCount,
            totalCountries,
            internationalPercentage
        },
        thematicCompetence: competence || [],
        gapTopics,
        compatibilityStatement: statement
    };
}

module.exports = { getAcademicQualityProfile };
