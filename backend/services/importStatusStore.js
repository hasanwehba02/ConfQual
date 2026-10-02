class ImportStatusStore {
    constructor() {
        this.items = new Map();
        this.sequence = 0;
    }

    start(workspaceId) {
        const id = String(++this.sequence);
        this.items.set(id, { workspaceId, status: 'running', startedAt: Date.now() });
        return id;
    }

    finish(id, workspaceId) {
        if (!this.owns(id, workspaceId)) return false;
        this.items.set(id, { workspaceId, status: 'done', finishedAt: Date.now() });
        return true;
    }

    fail(id, workspaceId, error) {
        if (!this.owns(id, workspaceId)) return false;
        this.items.set(id, {
            workspaceId,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            finishedAt: Date.now()
        });
        return true;
    }

    get(id, workspaceId) {
        const item = this.items.get(id);
        if (!item || item.workspaceId !== workspaceId) return null;
        const publicStatus = { ...item };
        delete publicStatus.workspaceId;
        return publicStatus;
    }

    owns(id, workspaceId) {
        return this.items.get(id)?.workspaceId === workspaceId;
    }
}

module.exports = { ImportStatusStore };
