import { GraphQLError } from "graphql/error";
import * as schema from "../schema/generated/resolvers-types";

interface Edge<Node> {
  cursor: string;
  node: Node | null;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

class ArrayCursorConnection<Node> {
  private readonly isForward: boolean;
  private readonly size: number;
  private readonly cursor: string | null;

  constructor(
    private readonly items: Node[],
    private readonly limit: number,
    private readonly first: number | null,
    private readonly after: string | null,
    private readonly last: number | null,
    private readonly before: string | null
  ) {
    this.isForward = this.initIsForward();
    this.size = this.initSize();
    this.cursor = this.initCursor();
  }

  private initIsForward(): boolean {
    if (this.first === null && this.last === null) {
      throw new GraphQLError(
        'Invalid argument. Either the "first" or "last" parameter is required.',
        {
          extensions: {
            code: schema.ErrorCode.BadRequest,
          },
        }
      );
    }
    if (this.first !== null && this.last !== null) {
      throw new GraphQLError(
        'Invalid argument. The "first" and "last" parameter cannot be used together.',
        {
          extensions: {
            code: schema.ErrorCode.BadRequest,
          },
        }
      );
    }

    return this.first !== null;
  }

  private initSize(): number {
    const size = this.isForward ? this.first : this.last;
    if (size === null) {
      throw new Error(
        "initSize or initIsForward function error. size is null."
      );
    }

    if (size < 1) {
      throw new GraphQLError(
        `Invalid argument. The "${
          this.isForward ? "first" : "last"
        }" parameter must be greater than 0.`,
        {
          extensions: {
            code: schema.ErrorCode.BadRequest,
          },
        }
      );
    }

    if (size > this.limit) {
      return this.limit;
    }

    return size;
  }

  private initCursor(): string | null {
    const cursor = this.isForward ? this.after : this.before;

    if (this.isForward && this.before !== null) {
      throw new GraphQLError(
        'The "before" parameter cannot be used with the "first" parameter.',
        {
          extensions: {
            code: schema.ErrorCode.BadRequest,
          },
        }
      );
    }
    if (!this.isForward && this.after !== null) {
      throw new GraphQLError(
        'The "after" parameter cannot be used with the "last" parameter.',
        {
          extensions: {
            code: schema.ErrorCode.BadRequest,
          },
        }
      );
    }

    return cursor;
  }

  private sliceIndexInfo(): [number, number] {
    const decodedCursor = this.decodeCursor(this.cursor);
    const cursorIndex =
      decodedCursor !== null
        ? decodedCursor
        : this.isForward
        ? -1
        : this.items.length;

    if (this.isForward) {
      return [cursorIndex + 1, cursorIndex + this.size];
    } else {
      return [cursorIndex - this.size, cursorIndex - 1];
    }
  }

  private encodeCursor(index: number): string {
    return Buffer.from(JSON.stringify({ index }), "utf-8").toString("base64");
  }

  private decodeCursor(cursor: string | null): number | null {
    if (cursor === null) {
      return null;
    }
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
      .index as number;
  }

  edges(): Array<Edge<Node>> {
    let [startIndex, endIndex] = this.sliceIndexInfo();
    startIndex = Math.max(startIndex, 0);
    endIndex = Math.min(endIndex, this.items.length - 1);

    if (endIndex < startIndex) {
      return [];
    }

    const edges = [];
    for (let i = startIndex; i <= endIndex; i++) {
      edges.push({
        cursor: this.encodeCursor(i),
        node: this.items[i],
      });
    }

    return edges;
  }

  pageInfo(): PageInfo {
    const [startIndex, endIndex] = this.sliceIndexInfo();

    return {
      hasPreviousPage: startIndex > 0,
      hasNextPage: endIndex < this.items.length - 1,
      startCursor: this.encodeCursor(startIndex),
      endCursor: this.encodeCursor(endIndex),
    };
  }
}

export { ArrayCursorConnection };
