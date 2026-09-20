import "~style.css";
import { useEffect, useState } from "react";

type Config = { apiUrl: string; deviceToken: string; enabled: boolean };
const defaultConfig: Config = { apiUrl: "https://auto-post-jason-weijie.vercel.app", deviceToken: "", enabled: false };

export default function PostPilotConnector() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [message, setMessage] = useState("");
  useEffect(() => { chrome.runtime.sendMessage({ action: "POSTPILOT_CONNECTOR_GET_CONFIG" }, (value: Config) => setConfig(value || defaultConfig)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage("保存中…");
    chrome.runtime.sendMessage({ action: "POSTPILOT_CONNECTOR_SAVE_CONFIG", data: config }, (result) => setMessage(result?.error ? `失败：${result.error}` : config.enabled ? "已开启轮询：每 30 秒检查一次待发任务。" : "已保存，轮询已关闭。"));
  }
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><form onSubmit={save} className="mx-auto max-w-xl rounded-xl bg-white p-7 shadow"><p className="text-xs font-medium tracking-widest text-lime-700">POSTPILOT CONNECTOR</p><h1 className="mt-2 text-2xl font-bold">连接你的 PostPilot 工作区</h1><p className="mt-2 text-sm text-slate-500">设备令牌仅保存在此浏览器中，用来领取并回报发布任务。</p><label className="mt-6 block text-sm font-semibold">PostPilot 网站地址<input className="mt-2 w-full rounded border p-2" type="url" required value={config.apiUrl} onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })} /></label><label className="mt-4 block text-sm font-semibold">Connector 设备令牌<input className="mt-2 w-full rounded border p-2 font-mono text-xs" type="password" required value={config.deviceToken} onChange={(e) => setConfig({ ...config, deviceToken: e.target.value })} placeholder="mpc_live_…" /></label><label className="mt-5 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />开启后台轮询</label><button className="mt-6 rounded bg-lime-300 px-4 py-2 font-bold text-slate-900" type="submit">保存并应用</button>{message && <p className="mt-4 text-sm text-slate-600">{message}</p>}<p className="mt-7 text-xs leading-5 text-slate-500">先登录 PostPilot 网站，在“开发者 → PostPilot Connector”创建浏览器设备令牌。浏览器必须保持登录相应社媒账号；关闭轮询可随时暂停自动处理。</p></form></main>;
