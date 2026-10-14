import { Redis } from "@upstash/redis";

type RealtimeEventType =
  | "order-created"
  | "inventory-updated"
  | "inventory-history-updated"
  | "order-updated"
  | "catalog-updated"
  | "reviews-updated"
  | "customer-updated"
  | "settings-updated"
  | "users-updated"
  | "storefront-products-updated"
  | "storefront-catalog-updated"
  | "storefront-reviews-updated"
  | "storefront-settings-updated"
  | "customer-order-updated"
  | "ping";

type RealtimeEvent = {
  type: RealtimeEventType;
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
  filter: (event: RealtimeEnvelope) => RealtimeEnvelope | null;
};

type RealtimePublisher = {
  publish: (event: RealtimeEvent) => void;
};

declare global {
  var __apcRealtimeClients: RealtimeClient[] | undefined;
  var __apcRealtimePublisher: RealtimePublisher | undefined;
  var __apcRealtimeRedis: Redis | null | undefined;
  var __apcRealtimeRedisDisabledUntil: number | undefined;
  var __apcRealtimePollTimer: ReturnType<typeof setInterval> | undefined;
  var __apcRealtimePollInFlight: boolean | undefined;
}

const realtimeEventsKey = "apc:realtime:admin-events";
const realtimeEventRetention = 100;
const realtimePollIntervalMs = 2000;
const realtimeRedisRetryDelayMs = 60_000;

function hasRealtimeRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

function getRealtimeRedis() {
  if (globalThis.__apcRealtimeRedisDisabledUntil && globalThis.__apcRealtimeRedisDisabledUntil > Date.now()) {
    return null;
  }

  if (typeof globalThis.__apcRealtimeRedis !== "undefined") {
    return globalThis.__apcRealtimeRedis;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  globalThis.__apcRealtimeRedis = url && token ? new Redis({ url, token }) : null;
  return globalThis.__apcRealtimeRedis;
}

function disableRealtimeRedis(error: unknown) {
  const disabledUntil = Date.now() + realtimeRedisRetryDelayMs;
  const wasDisabled = Boolean(
    globalThis.__apcRealtimeRedisDisabledUntil && globalThis.__apcRealtimeRedisDisabledUntil > Date.now(),
  );
  globalThis.__apcRealtimeRedisDisabledUntil = disabledUntil;

  if (!wasDisabled) {
    console.warn("Shared realtime Redis is unavailable; using local delivery temporarily.", error);
  }
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

  const filteredEvent = client.filter(event);
  if (!filteredEvent) return;

  rememberEvent(client, event.eventId);
  try {
    client.write(formatEvent(filteredEvent));
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
    disableRealtimeRedis(error);
  }
}

async function pollSharedEvents() {
  if (globalThis.__apcRealtimePollInFlight) return;
  const redis = getRealtimeRedis();
  if (!redis) return;

  globalThis.__apcRealtimePollInFlight = true;
  try {
    const records = await redis.lrange<string>(realtimeEventsKey, 0, -1);
    const activeClients = [...clients()];
    for (const record of records) {
      try {
        const event = JSON.parse(record) as RealtimeEnvelope;
        const sentAt = Date.parse(event.sentAt);
        if (Number.isFinite(sentAt)) {
          for (const client of activeClients) {
            if (sentAt >= client.connectedAt) sendEvent(client, event);
          }
        }
      } catch {
        // Ignore malformed records so one bad event cannot stop polling.
      }
    }
  } catch (error) {
    disableRealtimeRedis(error);
  } finally {
    globalThis.__apcRealtimePollInFlight = false;
  }
}

function startSharedEventPoller() {
  if (globalThis.__apcRealtimePollTimer || !hasRealtimeRedisConfig()) return;
  void pollSharedEvents();
  globalThis.__apcRealtimePollTimer = setInterval(() => {
    void pollSharedEvents();
  }, realtimePollIntervalMs);
}

function stopSharedEventPollerIfIdle() {
  if (clients().length || !globalThis.__apcRealtimePollTimer) return;
  clearInterval(globalThis.__apcRealtimePollTimer);
  globalThis.__apcRealtimePollTimer = undefined;
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

function addRealtimeClient(
  write: (message: string) => void,
  close: () => void,
  filter: RealtimeClient["filter"],
) {
  const client: RealtimeClient = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    write,
    close,
    connectedAt: Date.now(),
    seenEventIds: new Set(),
    filter,
  };

  clients().push(client);
  startSharedEventPoller();
  return client.id;
}

export function addAdminRealtimeClient(write: (message: string) => void, close: () => void) {
  return addRealtimeClient(write, close, (event) => event);
}

export function addPublicRealtimeClient(write: (message: string) => void, close: () => void) {
  return addRealtimeClient(write, close, (event) => {
    const type =
      event.type === "catalog-updated"
        ? "storefront-catalog-updated"
        : event.type === "reviews-updated"
          ? "storefront-reviews-updated"
          : event.type === "settings-updated"
            ? "storefront-settings-updated"
            : event.type === "inventory-updated" || event.type === "order-created" || event.type === "order-updated"
              ? "storefront-products-updated"
              : null;

    return type ? { type, eventId: event.eventId, sentAt: event.sentAt } : null;
  });
}

export function addCustomerRealtimeClient(userId: string, write: (message: string) => void, close: () => void) {
  return addRealtimeClient(write, close, (event) => {
    if (
      (event.type !== "order-created" && event.type !== "order-updated") ||
      event.payload?.userId !== userId
    ) {
      return null;
    }

    return { type: "customer-order-updated", eventId: event.eventId, sentAt: event.sentAt };
  });
}

export function removeAdminRealtimeClient(clientId: string) {
  const list = clients();
  const index = list.findIndex((client) => client.id === clientId);

  if (index !== -1) {
    const [client] = list.splice(index, 1);
    client.close();
    stopSharedEventPollerIfIdle();
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

export function emitInventoryHistoryUpdatedEvent() {
  broadcastAdminEvent({ type: "inventory-history-updated" });
}

export function emitOrderUpdatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "order-updated",
    payload,
  });
}

export function emitCatalogUpdatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "catalog-updated",
    payload,
  });
}

export function emitPublicReviewsUpdatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "reviews-updated",
    payload,
  });
}

export function emitCustomerUpdatedEvent(payload: Record<string, unknown> = {}) {
  broadcastAdminEvent({
    type: "customer-updated",
    payload,
  });
}

export function emitSettingsUpdatedEvent() {
  broadcastAdminEvent({ type: "settings-updated" });
}

export function emitUsersUpdatedEvent() {
  broadcastAdminEvent({ type: "users-updated" });
}

export function getRealtimePublisherHint() {
  return getRealtimeRedis() ? "upstash-redis" : "memory";
}
