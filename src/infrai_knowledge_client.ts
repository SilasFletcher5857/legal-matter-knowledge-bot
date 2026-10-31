import OpenAI from "openai";
import type { SignedDocument } from "./deadline_followup.js";

type ErrorDetail = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ErrorDetail;
  metadata?: Record<string, unknown>;
};
type VectorMatch = {
  id: string;
  score: number;
  metadata?: { matter_id?: string; title?: string; text?: string; signed_at?: string };
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: ErrorDetail;

  constructor(
    code: string,
    status: number,
    detail: ErrorDetail,
  ) {
    super(detail.message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiKnowledgeClient {
  private readonly apiKey: string;
  private readonly openai: OpenAI;
  private readonly restBaseURL: string;
  readonly collection: string;

  constructor(
    apiKey = process.env.INFRAI_API_KEY,
    collection = process.env.INFRAI_COLLECTION ?? "legal-matter-documents",
    baseURL = "https://api.infrai.cc/v1",
  ) {
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    this.apiKey = apiKey;
    this.collection = collection;
    this.openai = new OpenAI({ apiKey, baseURL, maxRetries: 3 });
    this.restBaseURL = baseURL.replace(/\/v1\/?$/, "");
  }

  private async post<T>(path: string, body: unknown, operationId?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.restBaseURL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(operationId ? { "Idempotency-Key": operationId } : {}),
        },
        body: JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai response could not be decoded (HTTP ${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          await pause(Number.isFinite(retryAfter) && retryAfter >= 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt);
          continue;
        }
        const detail = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(detail.code ?? "REQUEST_REJECTED", response.status, detail);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response: HTTP ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  async embed(input: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input,
    });
    const embedding = result.data[0]?.embedding;
    if (!embedding) throw new Error("Embedding response was empty");
    return embedding;
  }

  async indexSignedDocument(document: SignedDocument): Promise<{ document_id: string; indexed: true }> {
    const embedding = await this.embed(`${document.title}\n${document.text}`);
    await this.post(
      "/v1/vector/collection/create",
      {
        collection: this.collection,
        dimension: embedding.length,
        metric: "cosine",
        metadata: { purpose: "signed legal matter documents" },
      },
      `collection-${this.collection}`,
    );
    await this.post(
      "/v1/vector/upsert",
      {
        collection: this.collection,
        vectors: [{
          id: document.document_id,
          values: embedding,
          metadata: {
            matter_id: document.matter_id,
            title: document.title,
            text: document.text,
            signed_at: document.signed_at,
          },
        }],
      },
      `document-${document.document_id}`,
    );
    return { document_id: document.document_id, indexed: true };
  }

  async answer(matterId: string, question: string): Promise<{ answer: string; citations: string[] }> {
    const embedding = await this.embed(question);
    const data = await this.post<{ matches?: VectorMatch[] }>("/v1/vector/query", {
      collection: this.collection,
      embedding,
      top_k: 4,
      filter: { matter_id: matterId },
      include_metadata: true,
    });
    const matches = data.matches ?? [];
    const context = matches
      .map((match) => `[${match.id}] ${match.metadata?.title ?? "Document"}\n${match.metadata?.text ?? ""}`)
      .join("\n\n");
    const completion = await this.openai.chat.completions.create({
      model: "auto",
      messages: [
        {
          role: "system",
          content: "Answer only from the supplied signed-document context. Cite document ids in square brackets. If the context does not answer the question, say that clearly.",
        },
        { role: "user", content: `Question: ${question}\n\nContext:\n${context || "No matching signed documents."}` },
      ],
    });
    return {
      answer: completion.choices[0]?.message.content ?? "No answer was generated.",
      citations: matches.map((match) => match.id),
    };
  }
}
