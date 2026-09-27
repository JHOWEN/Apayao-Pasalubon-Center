type RealtimeEvent = {
  type: "order-created" | "inventory-updated" | "order-updated" | "ping";
  payload?: Record<string, unknown>;
  sentAt?: string;
};

type RealtimeClient = {
  id: string;
  write: (message: string) => void;
  close: () => void;
};

type RealtimePublisher = {
  publish: (event: RealtimeEvent) => void;
};

declare global {
  var __apcRealtimeClients: RealtimeClient[] | undefined;
  var __apcRealtimePublisher: RealtimePublisher | undefined;
}

const clients = (): RealtimeClient[] => {
  if (!globalThis.__apcRealtimeClients) {
    globalThis.__apcRealtimeClients = [];
  }

  return globalThis.__apcRealtimeClients;
};

const memoryPublisher: RealtimePublisher = {
  publish(event) {
    const payload = {
      ...event,
      sentAt: new Date().toISOString(),
    };

    const message = `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;

    const activeClients = clients();
    for (const client of [...activeClients]) {
      try {
        client.write(message);
      } catch {
        removeAdminRealtimeClient(client.id);
      }
    }
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
  };

  clients().push(client);
  return client.id;
}

export function removeAdminRealtimeClient(clientId: string) {
  const list = clients();
  const index = list.findIndex((client) => client.id === clientId);

  if (index !== -1) {
    const [client] = list.splice(index, 1);
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
  return process.env.REDIS_URL ? "redis" : "memory";
}
