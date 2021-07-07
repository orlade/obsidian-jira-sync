import { RequestInit, Response } from 'electron-fetch'

const epic = require('./data/epic.json');

const fields = `fields=summary%2Cdescription%2Cassignee%2Ccreator%2Creporter%2Ccomment%2Ccreated%2Cupdated%2Cissuetype%2Cparent%2Cpriority%2Cprogress%2Cproject%2Cstatus%2Cstatus%2Ctimeestimate%2Ctimeoriginalestimate%2Ctimespent%2Ccustomfield_22783%2Ccustomfield_14182`;
const args = `${fields}&maxResults=999`;

const queryPath = (root: string) =>
    `/search?jql=key=${root}%20OR%20issueFunction%20in%20portfolioChildrenOf("key=${root}")%20OR%20issueFunction%20in%20issuesInEpics("key=${root}")&${args}`

const paths = {
    [queryPath("EPIC-001")]: JSON.stringify(epic)
};


export default function fetch(url: string, options?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
        const path = url.substr(url.indexOf('/rest/api/latest') + '/rest/api/latest'.length);
        process.nextTick(() => paths[path]
            ? resolve(new Response(paths[path], {status: 200, statusText: "ok"}))
            : reject(new Response('issue not found', {status: 500, statusText: "nope"}))
        );
    });
}
