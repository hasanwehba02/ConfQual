const authorRepository = require("../repositories/authorRepository");

async function createAuthor(author) {
    return await authorRepository.createAuthor(author);
}

async function findByExternalPersonId(externalPersonId) {
    return await authorRepository.findByExternalPersonId(externalPersonId);
}

module.exports = {
    createAuthor,
    findByExternalPersonId
};