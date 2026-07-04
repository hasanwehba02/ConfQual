const topicRepository = require("../repositories/topicRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createPcTopic(topicDto) {
    if (!topicDto.topicName) return null;
    
    const pcm = await programCommitteeService.findByExternalPersonId(topicDto.externalPersonId);
    if (!pcm) return null;

    const topicId = await topicRepository.ensureTopicExists(topicDto.topicName);
    return await topicRepository.createPcTopic(pcm.id, topicId);
}

async function createPaperTopic(topicDto) {
    if (!topicDto.topicName) return null;

    const paper = await paperService.findByExternalSubmissionId(topicDto.externalSubmissionId);
    if (!paper) return null;

    const topicId = await topicRepository.ensureTopicExists(topicDto.topicName);
    return await topicRepository.createPaperTopic(paper.id, topicId);
}

module.exports = {
    createPcTopic,
    createPaperTopic
};
