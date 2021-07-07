import Jira, { IssueAndChildren } from './jira';

import { range } from 'lodash';

jest.mock('./fetch');

const customFields = ['customfield_22783', 'customfield_14182'];

describe('Jira', () => {
  const jira = new Jira({
    baseUrl: "https://test.jira.domain",
    parentFieldIds: customFields,
  });

  describe('fetch', () => {
    it("fetches", () => {
      const key = "EPIC-001";
      const parentField = "customfield_14182";

      return expect(jira.fetchIssueAndChildren(key)).resolves.toMatchObject({
        issue: {key},
        children: range(9).map(_ => ({ parent: key })),
      });
    })
  })
});
