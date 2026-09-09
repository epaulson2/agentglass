export type SseFrame = { event: string; id?: string; data?: string; comment?: string };

export const MAX_SSE_BUFFER = 16 * 1_048_576;
export const MAX_SSE_FRAME = 12 * 1_048_576;

export function parseSseFrames(input: string): { frames: SseFrame[]; remainder: string } {
  if (input.length > MAX_SSE_BUFFER) throw new Error("QCR SSE buffer exceeded its limit");
  const normalized = input.replace(/\r\n/g, "\n");
  const chunks = normalized.split("\n\n");
  const remainder = chunks.pop() ?? "";
  const frames = chunks.map((chunk) => {
    if (chunk.length > MAX_SSE_FRAME) throw new Error("QCR SSE frame exceeded its limit");
    const frame: SseFrame = { event: "message" };
    const data: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith(":")) frame.comment = line.slice(1).trim();
      else if (line.startsWith("event:")) frame.event = line.slice(6).trim();
      else if (line.startsWith("id:")) frame.id = line.slice(3).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) frame.data = data.join("\n");
    return frame;
  });
  return { frames, remainder };
}
