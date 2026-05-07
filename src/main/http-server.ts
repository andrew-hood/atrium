import Fastify, { type FastifyInstance } from 'fastify';
import { shouldIgnoreHookPayload } from '../shared/session-filters';
import { HOOK_PORT, type HookEventPayload, type SessionChange } from '../shared/types';
import { SessionMachine } from './session-machine';

export class HookHttpServer {
  private readonly fastify: FastifyInstance;

  constructor(private readonly machine: SessionMachine) {
    this.fastify = Fastify({ logger: false });
    this.registerRoutes();
  }

  async start(port = HOOK_PORT): Promise<void> {
    await this.fastify.listen({ host: '127.0.0.1', port });
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }

  private registerRoutes(): void {
    this.fastify.get('/health', async () => ({ ok: true }));
    this.fastify.post('/hook', async (request, reply) => {
      const payload = normalizeHookPayload(request.body);
      if (!payload) {
        return reply.code(400).send({ ok: false, error: 'Missing sessionId or event' });
      }

      if (shouldIgnoreHookPayload(payload)) {
        return reply.code(202).send({ ok: true, sessionId: payload.sessionId, ignored: true });
      }

      const change: SessionChange = this.machine.handleEvent(payload);
      return reply.code(202).send({ ok: true, sessionId: change.session.sessionId, isNew: change.isNew });
    });
  }
}

function normalizeHookPayload(body: unknown): HookEventPayload | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;
  const event = stringValue(record.event) ?? stringValue(record.hook_event_name);
  const sessionId = stringValue(record.sessionId) ?? stringValue(record.session_id);
  if (!event || !sessionId) {
    return null;
  }

  const payload: HookEventPayload = {
    event,
    sessionId,
    cwd: stringValue(record.cwd) ?? process.cwd(),
    toolInput: record.toolInput ?? record.tool_input,
    raw: record,
  };

  const pid = numberValue(record.pid);
  const sessionName =
    stringValue(record.sessionName) ??
    stringValue(record.session_name) ??
    stringValue(record.aiTitle) ??
    stringValue(record.title);
  const transcriptPath = stringValue(record.transcriptPath) ?? stringValue(record.transcript_path);
  const tty = nullableStringValue(record.tty);
  const tool = stringValue(record.tool) ?? stringValue(record.tool_name);
  const toolUseId = stringValue(record.toolUseId) ?? stringValue(record.tool_use_id);
  const prompt = stringValue(record.prompt) ?? stringValue(record.user_prompt);
  const response =
    stringValue(record.response) ??
    stringValue(record.assistantResponse) ??
    stringValue(record.assistant_response);
  const status = stringValue(record.status);
  const timestamp = numberValue(record.timestamp);
  const provider = stringValue(record.provider);
  const model = stringValue(record.model);

  if (pid !== undefined) payload.pid = pid;
  if (provider !== undefined) payload.provider = provider;
  if (sessionName !== undefined) payload.sessionName = sessionName;
  if (transcriptPath !== undefined) payload.transcriptPath = transcriptPath;
  if (tty !== undefined) payload.tty = tty;
  if (tool !== undefined) payload.tool = tool;
  if (toolUseId !== undefined) payload.toolUseId = toolUseId;
  if (prompt !== undefined) payload.prompt = prompt;
  if (response !== undefined) payload.response = response;
  if (status !== undefined) payload.status = status;
  if (timestamp !== undefined) payload.timestamp = timestamp;
  if (model !== undefined) payload.model = model;

  return payload;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return stringValue(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
