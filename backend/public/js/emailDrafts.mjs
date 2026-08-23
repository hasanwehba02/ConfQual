const SIGNOFF = (label) => `\n\n— Program Committee Chair${label ? `, ${label}` : ''}`;

export function buildEmailDraft(kind, ctx = {}) {
  const name = ctx.recipientName || 'Reviewer';
  const label = ctx.conferenceLabel || '';

  if (kind === 'coi') {
    const paperRef = ctx.paperId != null
      ? `Paper #${ctx.paperId}${ctx.paperTitle ? ` ("${ctx.paperTitle}")` : ''}`
      : 'the paper in question';
    return {
      to: ctx.recipientEmail || '',
      subject: `Assignment conflict — ${paperRef}`,
      body: `Dear ${name},\n\n`
        + `Our records show that you are currently assigned to review ${paperRef}, `
        + `for which you previously declared a conflict of interest.\n\n`
        + `Could you please let us know so we can reassign the paper and remove you `
        + `from its discussion? If you believe this is an error on our side, just reply `
        + `and we will correct it.${SIGNOFF(label)}`,
    };
  }

  if (kind === 'low_effort') {
    const words = ctx.avgWordCount != null ? `~${ctx.avgWordCount} words` : 'well below expectations';
    return {
      to: ctx.recipientEmail || '',
      subject: `Quick note about your recent reviews`,
      body: `Dear ${name},\n\n`
        + `Thank you for the reviews you have completed. While checking conference quality, `
        + `we noticed that your reviews currently average ${words}, which is shorter than `
        + `the substantive feedback authors rely on.\n\n`
        + `For the remaining papers, could you aim for more detailed comments — even a few `
        + `extra sentences on strengths, weaknesses, and validity makes a real difference `
        + `to the authors and the committee's decision.${SIGNOFF(label)}`,
    };
  }

  if (kind === 'silent_debate') {
    const paperRef = ctx.paperId != null
      ? `Paper #${ctx.paperId}${ctx.paperTitle ? ` ("${ctx.paperTitle}")` : ''}`
      : 'the paper in question';
    const spread = ctx.spread != null
      ? `Your fellow reviewers' scores currently span ${ctx.spread} points.`
      : '';
    return {
      to: ctx.recipientEmail || '',
      subject: `Discussion needed: ${paperRef}`,
      body: `Dear ${name},\n\n`
        + `You reviewed ${paperRef}, which is one of the papers with the widest score gap `
        + `in this conference, yet no discussion has been recorded on its thread so far.${spread ? ` ${spread}` : ''}\n\n`
        + `Could you take a moment to open the comment thread and share your view on the `
        + `diverging assessments? A short note from each reviewer is usually enough for the `
        + `committee to reach a confident decision.${SIGNOFF(label)}`,
    };
  }

  if (kind === 'expertise_mismatch') {
    const paperRef = ctx.paperId != null
      ? `Paper #${ctx.paperId}${ctx.paperTitle ? ` ("${ctx.paperTitle}")` : ''}`
      : 'one of your assigned papers';
    const paperTopics = Array.isArray(ctx.paperTopics) ? ctx.paperTopics.join(', ') : ctx.paperTopics;
    const reviewerTopics = Array.isArray(ctx.reviewerTopics) ? ctx.reviewerTopics.join(', ') : ctx.reviewerTopics;
    const gap = paperTopics && reviewerTopics
      ? `The paper's topics (${paperTopics}) do not overlap with your listed areas of expertise `
        + `(${reviewerTopics}).`
      : paperTopics
        ? `The paper covers topics (${paperTopics}) outside your listed areas of expertise.`
        : '';
    return {
      to: ctx.recipientEmail || '',
      subject: `Assignment review: ${paperRef} — topic alignment check`,
      body: `Dear ${name},\n\n`
        + `During a routine quality check we noticed that you are reviewing ${paperRef}. `
        + `${gap}\n\n`
        + `This may well be intentional, but if you would prefer to hand the paper back, `
        + `just let us know and we will arrange a reassignment — no questions asked.${SIGNOFF(label)}`,
    };
  }

  if (kind === 'missing_metareview') {
    const paperRef = ctx.paperId != null
      ? `Paper #${ctx.paperId}${ctx.paperTitle ? ` ("${ctx.paperTitle}")` : ''}`
      : 'the paper in question';
    const spread = ctx.scoreSpread != null
      ? `Its reviews diverge by ${ctx.scoreSpread} points, so a metareview is especially valuable here.`
      : '';
    return {
      to: ctx.recipientEmail || '',
      subject: `Metareview needed: ${paperRef}`,
      body: `Dear ${name},\n\n`
        + `${paperRef} has completed its individual reviews but does not have a metareview yet. `
        + `${spread}\n\n`
        + `Would you be willing to volunteer to summarise the discussion and draft a recommendation? `
        + `If several of you step forward we will simply pick one — please reply so we know who.${SIGNOFF(label)}`,
    };
  }

  if (kind === 'sentiment_mismatch') {
    const paperRef = ctx.paperId != null
      ? `Paper #${ctx.paperId}${ctx.paperTitle ? ` ("${ctx.paperTitle}")` : ''}`
      : 'the paper in question';
    const score = ctx.totalScore != null ? String(ctx.totalScore) : null;
    const sentiment = ctx.sentimentScore != null ? String(ctx.sentimentScore) : null;
    const detail = score && sentiment
      ? `Your review records a score of ${score}, while its written tone reads as positive `
        + `(sentiment ${sentiment}).`
      : '';
    return {
      to: ctx.recipientEmail || '',
      subject: `Review calibration check: ${paperRef}`,
      body: `Dear ${name},\n\n`
        + `As part of our calibration checks for ${paperRef}, we compare review scores against `
        + `the tone of written comments. ${detail}\n\n`
        + `This divergence is often just a stylistic artefact, but could you double-check your `
        + `scoring for consistency? If the score stands as intended, no action is needed — `
        + `thanks for taking a look.${SIGNOFF(label)}`,
    };
  }

  throw new Error(`Unknown draft kind: ${kind}`);
}
