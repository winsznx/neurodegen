import { realtimeService } from '@/lib/services/realtimeService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEEPALIVE_INTERVAL_MS = 15_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const writeChunk = (chunk: Uint8Array) => {
        if (closed) return Promise.resolve();
        try {
          controller.enqueue(chunk);
          return Promise.resolve();
        } catch {
          close();
          return Promise.resolve();
        }
      };

      const writer: WritableStreamDefaultWriter<Uint8Array> = {
        write: writeChunk,
        close: async () => close(),
        abort: async () => close(),
        releaseLock: () => undefined,
        closed: Promise.resolve(undefined),
        desiredSize: null,
        ready: Promise.resolve(undefined),
      };

      const cleanup = realtimeService.addClient(writer);

      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`)
      );

      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          close();
        }
      }, KEEPALIVE_INTERVAL_MS);

      request.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
