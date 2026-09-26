import { type Token, tokenForType } from "./tipJar";

const GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

export async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data as T;
}

export type EventRecord<T> = { timestamp: string; digest: string; json: T };

/** The most recent events of one type (`<package>::tip_jar::<name>`). */
export async function fetchEvents<T>(packageId: string, name: string, last = 50): Promise<EventRecord<T>[]> {
  const data = await gql<{
    events: { nodes: { timestamp: string; transaction: { digest: string }; contents: { json: T } }[] };
  }>(
    `query($type: String!, $last: Int!) {
      events(filter: { type: $type }, last: $last) {
        nodes { timestamp transaction { digest } contents { json } }
      }
    }`,
    { type: `${packageId}::tip_jar::${name}`, last },
  );
  return data.events.nodes.map((n) => ({ timestamp: n.timestamp, digest: n.transaction.digest, json: n.contents.json }));
}

export type DirectDeposit = { timestamp: string; digest: string; from: string; amount: bigint; token: Token };

/**
 * Plain wallet sends never run our contract, so they emit no event. The chain
 * still records them: find transactions that touched the jar's address and
 * keep the ones that *added* SUI or USDC to it.
 */
export async function fetchDirectDeposits(jarId: string): Promise<DirectDeposit[]> {
  const data = await gql<{
    transactions: {
      nodes: {
        digest: string;
        sender: { address: string } | null;
        effects: {
          timestamp: string;
          balanceChanges: { nodes: { owner: { address: string } | null; amount: string; coinType: { repr: string } }[] };
        };
      }[];
    };
  }>(
    `query($address: SuiAddress!) {
      transactions(filter: { affectedAddress: $address }, last: 30) {
        nodes {
          digest
          sender { address }
          effects { timestamp balanceChanges { nodes { owner { address } amount coinType { repr } } } }
        }
      }
    }`,
    { address: jarId },
  );
  return data.transactions.nodes.flatMap((tx) =>
    tx.effects.balanceChanges.nodes.flatMap((b) => {
      const token = tokenForType(b.coinType.repr);
      return b.owner?.address === jarId && BigInt(b.amount) > 0n && token
        ? [{ timestamp: tx.effects.timestamp, digest: tx.digest, from: tx.sender?.address ?? "unknown", amount: BigInt(b.amount), token }]
        : [];
    }),
  );
}
