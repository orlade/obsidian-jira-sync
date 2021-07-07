import Jira from './jira';

const baseUrl = process.env.JIRA_BASE_URL;

describe('Jira', () => {
  const jira = new Jira({ baseUrl });

  describe('fetch', () => {
    it("fetches", () => {
      return expect(jira.get("/project/FOOBAR")).resolves.toEqual({
        "errorMessages": ["No project could be found with key 'FOOBAR'."],
        "errors": {},
      });
    })
  })
});
