import { Redis } from "@upstash/redis";

type RealtimeEvent = {
  type: "order-created" | "inventory-updated" | "order-updated" | "ping";
  payload?: Record<string, unknown>;
  sentAt?: string;
};

type RealtimeEnvelope = RealtimeEvent & {
  eventId: string;
  sentAt: string;
};

type RealtimeClient = {
  id: string;
  write: (message: string) => void;
  close: () => void;
  connectedAt: number;
  seenEventIds: Set<string>;
  pollTimer?: ReturnType<typeof setInterval>;
};

type RealtimePublisher = {
  publish: (event: RealtimeEvent) => void;
};

declare global {
  var __apcRealtimeClients: RealtimeClient[] | undefined;
  var __apcRealtimePublisher: RealtimePublisher | undefined;
  var __apcRealtimeRedis: Redis | null | undefined;
}

const realtimeEventsKey = "apc:realtime:admin-events";
const realtimeEventRetention = 100;
const realtimePollIntervalMs = 2000;

function getRealtimeRedis() {
  if (typeof globalThis.__apcRealtimeRedis !== "undefined") {
    return globalThis.__apcRealtimeRedis;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  globalThis.__apcRealtimeRedis = url && token ? new Redis({ url, token }) : null;
  return globalThis.__apcRealtimeRedis;
}

const clients = (): RealtimeClient[] => {
  if (!globalThis.__apcRealtimeClients) {
    globalThis.__apcRealtimeClients = [];
  }

  return globalThis.__apcRealtimeClients;
};

function formatEvent(event: RealtimeEnvelope) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function createEnvelope(event: RealtimeEvent): RealtimeEnvelope {
  return {
    ...event,
    eventId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sentAt: new Date().toISOString(),
  };
}

function rememberEvent(client: RealtimeClient, eventId: string) {
  client.seenEventIds.add(eventId);
  if (client.seenEventIds.size > realtimeEventRetention) {
    const oldestEventId = client.seenEventIds.values().next().value;
    if (oldestEventId) client.seenEventIds.delete(oldestEventId);
  }
}

function sendEvent(client: RealtimeClient, event: RealtimeEnvelope) {
  if (client.seenEventIds.has(event.eventId)) return;

  rememberEvent(client, event.eventId);
  try {
    client.write(formatEvent(event));
  } catch {
    removeAdminRealtimeClient(client.id);
  }
}

async function persistEvent(event: RealtimeEnvelope) {
  const redis = getRealtimeRedis();
  if (!redis) return;

  try {
    await redis.rpush(realtimeEventsKey, JSON.stringify(event));
    await redis.ltrim(realtimeEventsKey, -realtimeEventRetention, -1);
  } catch (error) {
    console.error("Failed to persist realtime admin event", error);
  }
}

async function pollSharedEvents(client: RealtimeClient) {
  const redis = getRealtimeRedis();
  if (!redis) return;

  try {
    const records = await redis.lrange<string>(realtimeEventsKey, 0, -1);
    for (const record of records) {
      try {
        const event = JSON.parse(record) as RealtimeEnvelope;
        if (Date.parse(event.sentAt) >= client.connectedAt) {
          sendEvent(client, event);
        }
      } catch {
        // Ignore malformed records so one bad event cannot stop polling.
      }
    }
  } catch (error) {
    console.error("Failed to poll shared realtime admin events", error);
  }
}

const memoryPublisher: RealtimePublisher = {
  publish(event) {
    const payload = createEnvelope(event);
    const activeClients = clients();
    for (const client of [...activeClients]) {
      sendEvent(client, payload);
    }

    void persistEvent(payload);
  },
};

export function configureRealtimePublisher(publisher: RealtimePublisher | null) {
  if (!publisher) {
    globalThis.__apcRealtimePublisher = memoryPublisher;
    return;
  }

  globalThis.__apcRealtimePublisher = publisher;
}

export function getRealtimePublisher() {
  if (!globalThis.__apcRealtimePublisher) {
    globalThis.__apcRealtimePublisher = memoryPublisher;
  }

  return globalThis.__apcRealtimePublisher;
}

export function addAdminRealtimeClient(write: (message: string) => void, close: () => void) {
  const client: RealtimeClient = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    write,
    close,
    connectedAt: Date.now(),
    seenEventIds: new Set(),
  };

  clients().push(client);
  if (getRealtimeRedis()) {
    void pollSharedEvents(client);
    client.pollTimer = setInterval(() => {
      void pollSharedEvents(client);
    }, realtimePollIntervalMs);
  }
  return client.id;
}

export function removeAdminRealtimeClient(clientId: string) {
  const list = clients();
  const index = list.findIndex((client) => client.id === clientId);

  if (index !== -1) {
    const [client] = list.splice(index, 1);
    if (client.pollTimer) clearInterval(client.pollTimer);
    client.close();
  }
}

export function broadcastAdminEvent(event: RealtimeEvent) {
  getRealtimePublisher().publish(event);
}

export function emitOrderCreatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "order-created",
    payload,
  });
}

export function emitInventoryUpdatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "inventory-updated",
    payload,
  });
}

export function emitOrderUpdatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "order-updated",
    payload,
  });
}

export function getRealtimePublisherHint() {
  return getRealtimeRedis() ? "upstash-redis" : "memory";
}
