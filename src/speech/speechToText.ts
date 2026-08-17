import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import "dotenv/config";

const DEFAULT_MODEL = "models/ggml-base.en.bin";
const DEFAULT_RECORDING_SECONDS = 8;

export class SpeechToTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechToTextError";
  }
}

function recordingDurationMs(): number {
  const configuredSeconds = Number(process.env.SPEECH_RECORDING_SECONDS ?? DEFAULT_RECORDING_SECONDS);
  const seconds = Number.isFinite(configuredSeconds) && configuredSeconds > 0 ? configuredSeconds : DEFAULT_RECORDING_SECONDS;
  return Math.round(seconds * 1_000);
}

async function recordAudio(audioPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const recorder = spawn("arecord", ["--quiet", "--format=S16_LE", "--rate=16000", "--channels=1", "--file-type=wav", audioPath], {
      stdio: "ignore",
    });
    let stoppedByTimer = false;
    const timer = setTimeout(() => {
      stoppedByTimer = true;
      recorder.kill("SIGINT");
    }, recordingDurationMs());

    recorder.once("error", (error) => {
      clearTimeout(timer);
      reject(new SpeechToTextError(`Unable to start microphone recording: ${error.message}`));
    });
    recorder.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || stoppedByTimer) {
        resolve();
      } else {
        reject(new SpeechToTextError("Microphone recording failed. Check that ALSA/arecord can access your microphone."));
      }
    });
  });
}

async function transcribe(audioPath: string, outputStem: string): Promise<string> {
  const whisperPath = process.env.WHISPER_PATH || "whisper-cli";
  const whisperModel = process.env.WHISPER_MODEL || DEFAULT_MODEL;
  const transcriptPath = `${outputStem}.txt`;

  await new Promise<void>((resolve, reject) => {
    const whisper = spawn(whisperPath, [
      "--model", whisperModel,
      "--file", audioPath,
      "--output-txt",
      "--output-file", outputStem,
      "--no-prints",
    ], { stdio: "inherit" });

    whisper.once("error", (error) => {
      reject(new SpeechToTextError(`Unable to start Whisper at '${whisperPath}': ${error.message}`));
    });
    whisper.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new SpeechToTextError("Whisper could not transcribe the recording. Check WHISPER_PATH and WHISPER_MODEL."));
    });
  });

  try {
    return (await readFile(transcriptPath, "utf8")).trim();
  } catch {
    throw new SpeechToTextError("Whisper completed without creating a transcript file.");
  }
}

/** Records a short local microphone clip and transcribes it with whisper.cpp. */
export async function speechToText(): Promise<string> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "localdevos-speech-"));
  const audioPath = path.join(temporaryDirectory, "recording.wav");
  const outputStem = path.join(temporaryDirectory, "transcription");

  try {
    console.log("🎙️ Listening...");
    await recordAudio(audioPath);
    console.log("📝 Transcribing...");
    const transcription = await transcribe(audioPath, outputStem);
    console.log("✓ Transcription complete");
    return transcription;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
