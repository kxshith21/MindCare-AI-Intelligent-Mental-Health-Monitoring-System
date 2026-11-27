"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { CrisisResources } from "@/components/crisis-resources";
import { Disclaimer } from "@/components/disclaimer";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import type {
  ConversationSummary,
  CrisisResource,
  MessageResponse,
} from "@/lib/types";

export default function PatientChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [resources, setResources] = useState<CrisisResource[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    // Defer the first state update so the effect body stays side-effect free.
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const result = await api.listConversations();
      setConversations(result.conversations);
      const latest = result.conversations[0];
      if (latest) {
        setActiveId(latest.id);
        const thread = await api.listMessages(latest.id);
        setMessages(thread.messages);
      } else {
        setActiveId(null);
        setMessages([]);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not load your conversations."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadConversations(), 0);
    return () => clearTimeout(timer);
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function openConversation(id: string) {
    setActiveId(id);
    setResources(null);
    setError(null);
    setLoading(true);
    try {
      const thread = await api.listMessages(id);
      setMessages(thread.messages);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not load this conversation."),
      );
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setActiveId(null);
    setMessages([]);
    setDraft("");
    setResources(null);
    setError(null);
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;

    setBusy(true);
    setError(null);
    setResources(null);
    try {
      // One attempt only: a retry would store duplicate messages and flags.
      const reply = await api.sendMessage({
        ...(activeId ? { conversation_id: activeId } : {}),
        content,
      });
      const stamp = new Date().toISOString();
      setMessages((current) => [
        ...current,
        {
          id: `local-user-${Date.now()}`,
          sender: "user",
          content,
          created_at: stamp,
        },
        {
          id: `local-assistant-${Date.now()}`,
          sender: "assistant",
          content: reply.reply,
          created_at: stamp,
        },
      ]);
      setDraft("");
      setActiveId(reply.conversation_id);
      setResources(
        reply.show_crisis_resources ? reply.crisis_resources : null,
      );
      setConversations((current) =>
        current.some((item) => item.id === reply.conversation_id)
          ? current
          : [{ id: reply.conversation_id, created_at: stamp }, ...current],
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not send your message."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Reflect in chat</h1>
        <p className="text-sm text-muted-foreground">
          A supportive space to write what is on your mind. One short message at
          a time is enough.
        </p>
      </div>
      <Disclaimer />

      {resources ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium" role="status">
            Thank you for sharing. Support is available right now — you do not
            have to handle this alone.
          </p>
          <CrisisResources resources={resources} />
        </div>
      ) : null}

      {error ? (
        <ErrorState error={error} retry={() => void loadConversations()} />
      ) : loading ? (
        <LoadingState label="Loading your conversations…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" onClick={startNew}>
              New reflection
            </Button>
            <p className="text-xs font-medium text-muted-foreground">Recent</p>
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No conversations yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => void openConversation(conversation.id)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                        activeId === conversation.id
                          ? "bg-muted font-medium"
                          : "text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {new Date(conversation.created_at).toLocaleDateString()}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="flex min-h-[420px] flex-col rounded-xl border border-border bg-card">
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {messages.length === 0 ? (
                <EmptyState
                  title="Start wherever you are"
                  description="Write a sentence about how things feel today. There is no right way to begin."
                />
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      message.sender === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-muted text-foreground"
                    }`}
                  >
                    {message.content}
                  </article>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="flex flex-col gap-2 border-t p-3">
              <label htmlFor="chat-message" className="sr-only">
                Your message
              </label>
              <textarea
                id="chat-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="How are things feeling right now?"
                className="resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {draft.length}/2000
                </span>
                <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
                  {busy ? "Sending…" : "Send"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
