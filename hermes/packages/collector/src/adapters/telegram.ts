import TelegramBot from "node-telegram-bot-api";
import { randomUUID } from "node:crypto";
import {
  type ChannelAdapter,
  type AdapterHealth,
  type Envelope,
  type PublishFn,
  makeEnvelope,
} from "@hermes/shared";

/**
 * Telegram ChannelAdapter (human, bidirectional).
 * Inbound message → envelope (actor:nik, kind:message|command) → bus.
 * Egress envelope → sendMessage back to the originating chat.
 *
 * The chat id is carried on the envelope's `raw.chat_id` (audit payload) and
 * mirrored as a `chat:<id>` tag, so `deliver` knows where to reply without
 * inventing a field outside the envelope contract (RULE 2).
 */
export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private bot: TelegramBot | null = null;
  private status: AdapterHealth["status"] = "down";
  private detail = "not started";
  private lastActivity: string | undefined;

  constructor(
    private readonly opts: { botToken?: string; allowedChatIds: number[] },
  ) {}

  async start(publish: PublishFn): Promise<void> {
    if (!this.opts.botToken) {
      this.status = "down";
      this.detail = "TELEGRAM_BOT_TOKEN not set";
      console.warn("[telegram] no bot token — adapter idle");
      return;
    }
    this.bot = new TelegramBot(this.opts.botToken, { polling: true });
    this.status = "ok";
    this.detail = "polling";

    this.bot.on("message", (msg) => {
      const chatId = msg.chat.id;
      if (
        this.opts.allowedChatIds.length > 0 &&
        !this.opts.allowedChatIds.includes(chatId)
      ) {
        console.warn(`[telegram] ignoring message from disallowed chat ${chatId}`);
        return;
      }
      const text = msg.text ?? "";
      const isCommand = text.trimStart().startsWith("/");
      const envelope = makeEnvelope({
        id: randomUUID(),
        ts: new Date((msg.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        source: "telegram",
        kind: isCommand ? "command" : "message",
        actor: "nik",
        channel: "telegram",
        severity: "info",
        body: text || "<non-text message>",
        tags: [`chat:${chatId}`],
        raw: {
          chat_id: chatId,
          message_id: msg.message_id,
          from: msg.from?.username ?? msg.from?.id,
          date: msg.date,
          text,
        },
      });
      this.lastActivity = envelope.ts;
      publish(envelope);
    });

    this.bot.on("polling_error", (err) => {
      this.status = "degraded";
      this.detail = `polling_error: ${err.message}`;
      console.error("[telegram] polling error:", err.message);
    });

    console.log("[telegram] polling started");
  }

  async deliver(e: Envelope): Promise<void> {
    if (!this.bot) return;
    const chatId = this.resolveChatId(e);
    if (chatId == null) {
      console.warn(`[telegram] cannot deliver ${e.id}: no chat id on envelope`);
      return;
    }
    await this.bot.sendMessage(chatId, e.body);
    this.lastActivity = new Date().toISOString();
  }

  private resolveChatId(e: Envelope): number | null {
    const raw = e.raw as { chat_id?: unknown } | null | undefined;
    if (raw && typeof raw.chat_id === "number") return raw.chat_id;
    const tag = e.tags.find((t) => t.startsWith("chat:"));
    if (tag) {
      const n = Number(tag.slice("chat:".length));
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  health(): AdapterHealth {
    return { name: this.name, status: this.status, detail: this.detail, lastActivity: this.lastActivity };
  }

  async stop(): Promise<void> {
    if (this.bot) await this.bot.stopPolling();
  }
}
