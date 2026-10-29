export interface TrelloMemberSummary {
  id: string;
  fullName: string;
  username: string;
}

export interface TrelloListSummary {
  id: string;
  name: string;
  closed: boolean;
}

export interface TrelloCardSummary {
  id: string;
  name: string;
  desc: string;
  due?: string | null;
  dueComplete: boolean;
  idList: string;
  idMembers: string[];
  url: string;
}

export interface TrelloBoardData {
  boardId: string;
  lists: TrelloListSummary[];
  members: TrelloMemberSummary[];
  cards: TrelloCardSummary[];
}

export interface TrelloReadOptions {
  boardId?: string;
  fetcher?: (url: string) => Promise<any>;
}

export class TrelloAdapter {
  /**
   * Strictly read-only method to retrieve Trello board lists, members, and cards
   * Contains zero write methods.
   */
  static async readBoard(options: TrelloReadOptions = {}): Promise<TrelloBoardData> {
    const boardId = options.boardId || process.env.TRELLO_DEFAULT_BOARD_ID;
    const apiKey = process.env.TRELLO_API_KEY;
    const apiToken = process.env.TRELLO_API_TOKEN;
    const fetcher = options.fetcher || this.defaultFetcher;

    if (!boardId) {
      throw new Error("Missing Trello board ID");
    }

    if ((!apiKey || !apiToken) && !options.fetcher) {
      return {
        boardId,
        lists: [],
        members: [],
        cards: [],
      };
    }

    const authQuery = `key=${apiKey}&token=${apiToken}`;

    const [listsRes, membersRes, cardsRes] = await Promise.all([
      fetcher(`https://api.trello.com/1/boards/${boardId}/lists?${authQuery}`),
      fetcher(`https://api.trello.com/1/boards/${boardId}/members?${authQuery}`),
      fetcher(`https://api.trello.com/1/boards/${boardId}/cards?${authQuery}`),
    ]);

    const lists: TrelloListSummary[] = Array.isArray(listsRes)
      ? listsRes.map((l: any) => ({
          id: l.id,
          name: l.name,
          closed: Boolean(l.closed),
        }))
      : [];

    const members: TrelloMemberSummary[] = Array.isArray(membersRes)
      ? membersRes.map((m: any) => ({
          id: m.id,
          fullName: m.fullName || m.username,
          username: m.username,
        }))
      : [];

    const cards: TrelloCardSummary[] = Array.isArray(cardsRes)
      ? cardsRes.map((c: any) => ({
          id: c.id,
          name: c.name,
          desc: c.desc || "",
          due: c.due,
          dueComplete: Boolean(c.dueComplete),
          idList: c.idList,
          idMembers: Array.isArray(c.idMembers) ? c.idMembers : [],
          url: c.url || c.shortUrl || "",
        }))
      : [];

    return {
      boardId,
      lists,
      members,
      cards,
    };
  }

  private static async defaultFetcher(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Trello API request failed with HTTP ${res.status}`);
    }
    return res.json();
  }
}
