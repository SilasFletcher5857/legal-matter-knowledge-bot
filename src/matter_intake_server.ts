import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import {
  chooseFollowUp,
  matterIntakeSchema,
  signedDocumentSchema,
} from "./deadline_followup.js";
import { InfraiError, InfraiKnowledgeClient } from "./infrai_knowledge_client.js";

const client = new InfraiKnowledgeClient();

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && request.url === "/documents/signed") {
    const document = signedDocumentSchema.parse(await readJson(request));
    send(response, 201, await client.indexSignedDocument(document));
    return;
  }
  if (request.method === "POST" && request.url === "/matters/intake") {
    const intake = matterIntakeSchema.parse(await readJson(request));
    const result = await client.answer(intake.matter_id, intake.question);
    send(response, 200, {
      matter_id: intake.matter_id,
      client_name: intake.client_name,
      follow_up: chooseFollowUp(intake.deadline_at, new Date()),
      deadline_at: intake.deadline_at,
      ...result,
    });
    return;
  }
  send(response, 404, { error: "Route not found" });
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, detail: error.detail });
      return;
    }
    console.error(error);
    send(response, 500, { error: "Request could not be completed" });
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Legal matter bot listening on http://localhost:${port}`));
