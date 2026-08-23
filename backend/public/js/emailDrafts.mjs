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

  throw new Error(`Unknown draft kind: ${kind}`);
}
