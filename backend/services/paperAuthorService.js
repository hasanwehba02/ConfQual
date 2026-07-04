const paperAuthorRepository = require("../repositories/paperAuthorRepository");

async function createPaperAuthor(paperId, authorId, authorOrder, isCorresponding) {
    return await paperAuthorRepository.createPaperAuthor(
        paperId,
        authorId,
        authorOrder,
        isCorresponding
    );
}

module.exports = {
    createPaperAuthor
};