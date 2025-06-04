import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

class MessageBus {
  constructor(agentName) {
    this.agentName = agentName;
    this.pubClient = createClient({ url: REDIS_URL });
    this.subClient = createClient({ url: REDIS_URL });
    this.handlers = {};
    this.connected = false;
    this.connecting = false;
  }

  async connect() {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.connected = true;
    this.connecting = false;
    this.pubClient.on("error", (err) =>
      console.error(`[MessageBus][Publish] Error:`, err)
    );
    this.subClient.on("error", (err) =>
      console.error(`[MessageBus][Subscribe] Error:`, err)
    );
  }

  async publish(channel, type, data, options = {}) {
    await this.connect();
    const message = {
      type,
      data,
      sender: this.agentName,
      timestamp: Date.now(),
      ...options,
    };
    console.log(`[MessageBus][${this.agentName}] → [${channel}]:`, message);
    await this.pubClient.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel, handler) {
    await this.connect();
    if (!this.handlers[channel]) this.handlers[channel] = [];
    this.handlers[channel].push(handler);

    // Only subscribe once per channel
    if (this.handlers[channel].length === 1) {
      await this.subClient.subscribe(channel, (msg) => {
        let parsed;
        try {
          parsed = JSON.parse(msg);
        } catch {
          parsed = msg;
        }
        console.log(`[MessageBus][${this.agentName}] ← [${channel}]:`, parsed);
        for (const h of this.handlers[channel]) {
          h(parsed, channel);
        }
      });
    }
  }

  async unsubscribe(channel, handler) {
    if (!this.handlers[channel]) return;
    this.handlers[channel] = this.handlers[channel].filter(
      (h) => h !== handler
    );
    if (this.handlers[channel].length === 0) {
      await this.subClient.unsubscribe(channel);
      delete this.handlers[channel];
    }
  }

  // Broadcast to all agents
  async broadcast(type, data, options = {}) {
    return this.publish("agent.broadcast", type, data, options);
  }

  // Send a direct message to another agent
  async sendToAgent(targetAgent, type, data, options = {}) {
    return this.publish(`agent.${targetAgent}`, type, data, options);
  }
}

export default MessageBus;
