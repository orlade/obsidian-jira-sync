import fetch from 'electron-fetch'
import { Project, SearchResults } from 'fetch-jira';

interface Args {
    baseUrl: string;
    apiUrl?: string;
    maxResults?: number;
    parentFieldIds?: string[];
}

export default class Jira {
    baseUrl: string;
    apiUrl: string;
    maxResults: number;
    parentFieldIds?: string[];

    constructor({ baseUrl, apiUrl, maxResults, parentFieldIds }: Args) {
        this.baseUrl = baseUrl;
        this.apiUrl = apiUrl || baseUrl + "/rest/api/latest";
        this.maxResults = maxResults || 999;
        this.parentFieldIds = parentFieldIds;
    }

    async get(path: string): Promise<any> {
        const url = this.buildUrl(path);

        console.debug('fetching', url)
        const res = await fetch(url, { useElectronNet: false });
        return await res.json();
    }

    async post(path: string, body: any): Promise<any> {
        const url = this.buildUrl(path);

        console.debug('posting', url)
        const res = await fetch(url, { method: "POST", body, useElectronNet: false });
        return await res.json();
    }

    async fetchProject(id: string): Promise<Project> {
        return this.get(`/project/${id}`);
    }

    async fetchIssue(id: string): Promise<SmallIssue> {
        return this.toSmall(await this.get(`/issue/${id}`));
    }

    async fetchIssuesInEpic(id: string): Promise<SmallIssue[]> {
        const res = await this.query(`issueFunction in issuesInEpics("key=${id}")`);
        return res.issues.map(this.toSmall);
    }

    /** Fetches an issue by ID. */
    async fetchJiraIssue(id: string): Promise<SmallIssue> {
        const results = await this.query(`key="${id}"`);
        return this.toSmall(results.issues[0]);
    }

    /** Returns a relation of a Jira portfolio (all descendants of root). */
    async fetchJiraPortfolio(rootId: string): Promise<SmallIssue[]> {
        const jql = `key = ${rootId} OR issueFunction in portfolioChildrenOf("key=${rootId}") OR issueFunction in issuesInEpics("key=${rootId}")`;
        const res = await this.query(jql);
        return res.issues.map(this.toSmall);
    }

    async query(jql: string): Promise<SearchResults> {
        const fields = [
            'summary',
            'assignee',
            'creator',
            'reporter',
            'comment',
            'created',
            'updated',
            'issuetype',
            'parent',
            'priority',
            'progress',
            'project',
            'status',
            'status',
            'timeestimate',
            'timeoriginalestimate',
            'timespent',
        ];
        this.parentFieldIds && fields.push(...this.parentFieldIds);

        const path = `/search?jql=${jql}&fields=${fields.join(',')}&maxResults=${this.maxResults}`;
        return await this.get(path)
    }

    async create(issue: SmallIssue): Promise<any> {
        throw new Error("TODO");
        return this.post("/issue", issue);
    }

    async createChild(parent: SmallIssue): Promise<any> {
        return this.post("/issue", {
            fields: {
                summary: "child",
                description: `Child of ${parent.key}`,
                project: { key: parent.project.key },
                issuetype: { name: parent.type },
            },
        });
    }

    async updateProgress(issueId: IssueKeyOrId, progress: number): Promise<any> {
        throw new Error("TODO");
        return this.post("/issue", {});
    }

    async updateStatus(issueId: IssueKeyOrId, status: string): Promise<any> {
        throw new Error("TODO");
        return this.post("/issue", {});
    }

    async updateAssignee(issueId: IssueKeyOrId, assignee: string): Promise<any> {
        throw new Error("TODO");
        return this.post("/issue", {});
    }

    async createComment(issueId: IssueKeyOrId, comment: string): Promise<any> {
        return this.post(`/issue/${issueId}/comment`, comment)
    }

    buildUrl(path): string {
        return (this.baseUrl + path)
            .replace(/ /g, '%20')
            .replace(/,/g, '%2C');
    }

    toSmall(i: any): SmallIssue {
        const f = i.fields;
        const p = f?.project as Project;
        const out = {
            id: i.id,
            key: i.key,
            summary: f.summary,
            parent: f.parent?.key,
            assignee: {
                id: f.assignee?.name,
                name: f.assignee?.displayName,
            },
            creator: f.creator.name,
            reporter: f.reporter.name,
            comments: f.comment?.comments?.map((c: any) => ({
                author: {
                    id: c.name,
                    name: c.displayName,
                },
                body: c.body,
                created: c.created,
            })),
            created: f.created,
            updated: f.updated,
            type: f.issuetype.name,
            priority: f.priority.name,
            progress: f.progress.progress || 0,
            project: {
                id: p.id,
                key: p.key,
                name: p.name,
            },
            status: f.status.name,
            statusCategory: f.status.statusCategory.name,
            estimate: {
                time: f.timeestimate,
                original: f.timeoriginalestimate,
                spent: f.timespent,
            },
            url: `${this.baseUrl}/browse/${i.key}`,
        }

        if (!out.parent) {
            this.parentFieldIds.some(id => {
                if (f[id]) {
                    out.parent = f[id]
                    return true
                }
            })
        }
        return out;
    };
}

type IssueKeyOrId = string;

export interface SmallIssue {
    id: IssueKeyOrId;
    key: IssueKeyOrId;
    summary: string;
    parent: IssueKeyOrId;
    assignee: {
        id: string;
        name: string;
    };
    creator: string;
    reporter: string;
    comments: {
        author: {
            id: string;
            name: string;
        }
        body: string;
        created: string;
    }[];
    created: string;
    updated: string;
    type: string;
    priority: string;
    progress: string;
    project: {
        id: string;
        key: string;
        name: string;
    };
    status: string;
    statusCategory: string;
    estimate: {
        time: string;
        original: string;
        spent: string;
    };
    url: string;
}
