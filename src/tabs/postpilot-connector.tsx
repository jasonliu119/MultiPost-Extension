import "~style.css";
import { useEffect, useState } from "react";

type Config = { apiUrl: string; deviceToken: string; enabled: boolean };
type PollRun = { id: string; status: "idle" | "completed" | "partial" | "failed"; jobCount: number; publishedCount: number; failedCount: number; message: string; completedAt: string };

const defaultConfig: Config = { apiUrl: "https://jev.dog", deviceToken: "", enabled: false };
const statusLabels: Record<PollRun["status"], string> = { idle: "无待发任务", completed: "已完成", partial: "部分失败", failed: "轮询失败" };

export default function PostPilotConnector() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [message, setMessage] = useState("");
  const [polls, setPolls] = useState<PollRun[]>([]);

  function loadPolls() {
    chrome.runtime.sendMessage({ action: "POSTPILOT_CONNECTOR_GET_POLL_HISTORY" }, (value: PollRun[]) => setPolls(Array.isArray(value) ? value : []));
  }

  useEffect(() => {
    chrome.runtime.sendMessage({ action: "POSTPILOT_CONNECTOR_GET_CONFIG" }, (value: Config) => setConfig(value || defaultConfig));
    loadPolls();
    const timer = window.setInterval(loadPolls, 3_000);
    return () => window.clearInterval(timer);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("保存中…");
    chrome.runtime.sendMessage({ action: "POSTPILOT_CONNECTOR_SAVE_CONFIG", data: config }, (result) => {
      setMessage(result?.error ? `失败：${result.error}` : config.enabled ? "已开启轮询：每 30 秒检查一次待发任务。" : "已保存，轮询已关闭。");
    });
  }

  function pollNow() {
    setMessage("正在检查待发布任务…");
    chrome.runtime.sendMessage({ action: "POSTPILOT_CONNECTOR_POLL_NOW" }, (value: PollRun[] | { error: string }) => {
      if (value && !Array.isArray(value) && "error" in value) setMessage(`失败：${value.error}`);
      else { setMessage("本次轮询已完成。"); setPolls(Array.isArray(value) ? value : []); }
    });
  }

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-xl space-y-5"><form onSubmit={save} className="rounded-xl bg-white p-7 shadow"><p className="text-xs font-medium tracking-widest text-lime-700">POSTPILOT CONNECTOR</p><h1 className="mt-2 text-2xl font-bold">连接你的 PostPilot 工作区</h1><p className="mt-2 text-sm text-slate-500">设备令牌仅保存在此浏览器中，用来领取并回报发布任务。</p><label className="mt-6 block text-sm font-semibold">PostPilot 网站地址<input className="mt-2 w-full rounded border p-2" type="url" required value={config.apiUrl} onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })} /></label><label className="mt-4 block text-sm font-semibold">Connector 设备令牌<input className="mt-2 w-full rounded border p-2 font-mono text-xs" type="password" required value={config.deviceToken} onChange={(e) => setConfig({ ...config, deviceToken: e.target.value })} placeholder="mpc_live_…" /></label><label className="mt-5 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />开启后台轮询</label><div className="mt-6 flex gap-3"><button className="rounded bg-lime-300 px-4 py-2 font-bold text-slate-900" type="submit">保存并应用</button><button className="rounded border border-slate-300 px-4 py-2 font-semibold" type="button" onClick={pollNow} disabled={!config.enabled || !config.deviceToken}>立即检查</button></div>{message && <p className="mt-4 text-sm text-slate-600">{message}</p>}<p className="mt-7 text-xs leading-5 text-slate-500">先登录 PostPilot 网站，在“开发者 → PostPilot Connector”创建浏览器设备令牌。浏览器必须保持登录相应社媒账号；关闭轮询可随时暂停自动处理。</p></form><section className="rounded-xl bg-white p-7 shadow"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium tracking-widest text-lime-700">ACTIVITY</p><h2 className="mt-1 text-lg font-bold">最近轮询</h2></div><span className="text-xs text-slate-500">自动刷新</span></div><div className="mt-4 space-y-3">{polls.length ? polls.map((poll) => <article className="rounded border border-slate-200 p-3 text-sm" key={poll.id}><div className="flex items-center justify-between gap-3"><strong>{statusLabels[poll.status]}</strong><time className="text-xs text-slate-500">{new Date(poll.completedAt).toLocaleString("zh-CN")}</time></div><p className="mt-1 text-slate-600">领取 {poll.jobCount} 项 · 成功 {poll.publishedCount} 项 · 失败 {poll.failedCount} 项</p>{poll.message && <p className={poll.status === "failed" || poll.status === "partial" ? "mt-1 text-xs text-red-700" : "mt-1 text-xs text-slate-500"}>{poll.message}</p>}</article>) : <p className="text-sm text-slate-500">暂时没有轮询记录。</p>}</div></section></div></main>;
}
