import { Issue } from "./issues/types";

export class IssueCache {
  private state: Issue[] = [];

  constructor(initialState?: Issue[]) {
    if (initialState) this.setAll(initialState);
  }

  get(id: string): Issue | undefined {
    return this.state.find((i) => i.id === id);
  }

  add(data: Issue): Issue {
    this.state.push(data);
    return data;
  }

  update(data: Issue): Issue {
    const index = this.state.findIndex((i) => i.id === data.id);
    if (index === -1) throw `issue ${data.id} not found:\n${this}`;
    const prev = this.state[index];
    this.state[index] = data;
    return prev;
  }

  upsert(data: Issue): Issue {
    return this.get(data.id) ? this.update(data) : this.add(data);
  }

  remove(id: string) {
    const index = this.state.findIndex((i) => i.id === id);
    if (index === -1) throw `issue ${id} not found`;
    this.state.splice(index, 1);
  }

  setAll(data: Issue[]): void {
    this.state = data;
  }

  toString(): string {
    return this.state.map((i) => `${i.id}: ${i.title}`).join("\n");
  }
}
