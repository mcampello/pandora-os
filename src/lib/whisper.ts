// Audio transcription via OpenAI Whisper.
// Requires OPENAI_API_KEY. Returns null if key is absent (audio stored without transcript).
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    console.error("Whisper error:", res.status, await res.text());
    return null;
  }

  const data = await res.json() as { text?: string };
  return data.text ?? null;
}
