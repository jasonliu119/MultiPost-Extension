import { Storage } from "@plasmohq/storage";
import { getPlatformInfo, type FileData, type SyncData } from "~sync/common";

const storage = new Storage({ area: "local" });
const alarmName = "postpilot-poll";
const defaultApiUrl = "https://auto-post-jason-weijie.vercel.app";
let polling = false;

type Platform = "x" | "instagram" | "pinterest" | "rednote" | "douyin" | "tiktok" | "youtube" | "youtube_shorts";
interface PostPilotJob { targetId: string; platform: Platform; title: string | null; body: string; mediaUrls: string[]; scheduledAt: string | null; }
export interface PostPilotConfig { apiUrl: string; deviceToken: string; enabled: boolean; }
export type PostPilotPollRun = { id: string; status: "idle" | "completed" | "partial" | "failed"; jobCount: number; publishedCount: number; failedCount: number; message: string; startedAt: string; completedAt: string };
const pollHistoryKey = "postpilotPollHistory";

const platformMap: Record<Platform, { text: string; media: string }> = {
  x: { text: "DYNAMIC_X", media: "DYNAMIC_X" },
  instagram: { text: "DYNAMIC_INSTAGRAM", media: "DYNAMIC_INSTAGRAM" },
  pinterest: { text: "DYNAMIC_PINTEREST", media: "DYNAMIC_PINTEREST" },
  rednote: { text: "DYNAMIC_REDNOTE", media: "VIDEO_REDNOTE" },
  douyin: { text: "DYNAMIC_DOUYIN", media: "VIDEO_DOUYIN" },
  tiktok: { text: "VIDEO_TIKTOK", media: "VIDEO_TIKTOK" },
  youtube: { text: "VIDEO_YOUTUBE", media: "VIDEO_YOUTUBE" },
  youtube_shorts: { text: "VIDEO_YOUTUBE", media: "VIDEO_YOUTUBE" },
};

export async function getPostPilotConfig(): Promise<PostPilotConfig> {
  return {
    apiUrl: ((await storage.get<string>("postpilotApiUrl")) || defaultApiUrl).replace(/\/$/, ""),
    deviceToken: (await storage.get<string>("postpilotDeviceToken")) || "",
    enabled: (await storage.get<boolean>("postpilotPollingEnabled")) || false,
  };
}

export async function savePostPilotConfig(config: PostPilotConfig) {
  await storage.set("postpilotApiUrl", config.apiUrl.replace(/\/$/, ""));
  await storage.set("postpilotDeviceToken", config.deviceToken.trim());
  await storage.set("postpilotPollingEnabled", config.enabled);
  if (config.enabled) await startPostPilotPolling(); else await stopPostPilotPolling();
}

export async function initPostPilotConnector() {
  const config = await getPostPilotConfig();
  if (config.enabled) await startPostPilotPolling();
}

export async function getPostPilotPollHistory() {
  return (await storage.get<PostPilotPollRun[]>(pollHistoryKey)) || [];
}

export async function startPostPilotPolling() {
  await chrome.alarms.create(alarmName, { periodInMinutes: 0.5 });
  await pollPostPilotJobs();
}

export async function stopPostPilotPolling() { await chrome.alarms.clear(alarmName); }

chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === alarmName) void pollPostPilotJobs(); });

async function api(config: PostPilotConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.deviceToken}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `PostPilot API error (${response.status})`);
  return body;
}

export async function pollPostPilotJobs() {
  if (polling) return;
  polling = true;
  const startedAt = new Date().toISOString();
  let config: PostPilotConfig | undefined;
  try {
    config = await getPostPilotConfig();
    if (!config.enabled || !config.deviceToken) return;
    const { jobs } = (await api(config, "/api/connector/jobs")) as { jobs: PostPilotJob[] };
    const results = [];
    for (const job of jobs) results.push(await runJob(config, job));
    const publishedCount = results.filter((result) => result.status === "published").length;
    const failed = results.filter((result) => result.status === "failed");
    const status = !jobs.length ? "idle" : failed.length ? (publishedCount ? "partial" : "failed") : "completed";
    const message = !jobs.length ? "本次没有待发布任务。" : failed.length ? failed.map((result) => result.message).filter(Boolean).join("；") : `已处理 ${publishedCount} 个发布任务。`;
    await recordPoll(config, { status, jobCount: jobs.length, publishedCount, failedCount: failed.length, message, startedAt, completedAt: new Date().toISOString() });
  } catch (error) {
    console.error("PostPilot polling failed:", error);
    if (config) {
      const message = error instanceof Error ? error.message : "Unknown connector error";
      await recordPoll(config, { status: "failed", jobCount: 0, publishedCount: 0, failedCount: 0, message, startedAt, completedAt: new Date().toISOString() });
    }
  } finally { polling = false; }
}

async function recordPoll(config: PostPilotConfig, run: Omit<PostPilotPollRun, "id">) {
  const localRun: PostPilotPollRun = { id: crypto.randomUUID(), ...run };
  const history = await getPostPilotPollHistory();
  await storage.set(pollHistoryKey, [localRun, ...history].slice(0, 30));
  await api(config, "/api/connector/polls", { method: "POST", body: JSON.stringify(run) }).catch((error) => console.error("PostPilot poll report failed:", error));
}

function mediaFile(url: string, index: number): FileData {
  const pathname = new URL(url).pathname;
  const name = pathname.split("/").pop() || `media-${index + 1}`;
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const type = ["mp4", "mov", "webm", "m4v"].includes(extension) ? `video/${extension === "mov" ? "quicktime" : extension}` : `image/${extension === "jpg" ? "jpeg" : extension || "jpeg"}`;
  return { name, url, type };
}
function isVideo(file: FileData) { return file.type?.startsWith("video/") || false; }

function makeSyncData(job: PostPilotJob): SyncData {
  const files = job.mediaUrls.map(mediaFile);
  const hasMedia = files.length > 0;
  const platformName = platformMap[job.platform][hasMedia ? "media" : "text"];
  const images = files.filter((file) => !isVideo(file));
  const videos = files.filter(isVideo);
  if (platformName.startsWith("VIDEO_")) {
    const video = videos[0];
    if (!video) throw new Error(`${job.platform} requires a public video URL for browser publishing`);
    return { platforms: [{ name: platformName }], isAutoPublish: true, data: { title: job.title || job.body.slice(0, 80), content: job.body, description: job.body, video, cover: images[0] } };
  }
  return { platforms: [{ name: platformName }], isAutoPublish: true, data: { title: job.title || "", content: job.body, images, videos } };
}

async function waitForTab(tabId: number) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Timed out loading platform publish page")); }, 45_000);
    const listener = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedId === tabId && info.status === "complete") { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function runJob(config: PostPilotConfig, job: PostPilotJob): Promise<{ status: "published" | "failed"; message?: string }> {
  try {
    await api(config, `/api/connector/jobs/${job.targetId}`, { method: "PATCH", body: JSON.stringify({ status: "publishing" }) });
    const data = makeSyncData(job);
    const platform = await getPlatformInfo(data.platforms[0].name);
    if (!platform) throw new Error(`No MultiPost adapter for ${job.platform}`);
    const tab = await chrome.tabs.create({ url: platform.injectUrl, active: true });
    if (!tab.id) throw new Error("Could not create platform tab");
    await waitForTab(tab.id);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: platform.injectFunction, args: [data] });
    await api(config, `/api/connector/jobs/${job.targetId}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
    return { status: "published" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connector error";
    console.error(`PostPilot job ${job.targetId} failed:`, error);
    await api(config, `/api/connector/jobs/${job.targetId}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error: message }) }).catch(() => undefined);
    return { status: "failed", message: `${job.platform}: ${message}` };
  }
}
