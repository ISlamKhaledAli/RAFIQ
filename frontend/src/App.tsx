import React, { useState, useEffect } from 'react';
import { invoke } from './bridge/ipc';
import { 
  Laptop, 
  Database, 
  Printer, 
  Barcode, 
  Cpu, 
  Play, 
  RefreshCw,
  Clock,
  ShieldCheck,
  Layers
} from 'lucide-react';

interface SystemInfo {
  appName: string;
  version: string;
  osVersion: string;
  isWebView2: boolean;
  dbStatus: string;
}

export default function App() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedHistory, setScannedHistory] = useState<string[]>([]);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  const addLog = (msg: string) => {
    setLogMessages((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ${msg}`, ...prev.slice(0, 19)]);
  };

  useEffect(() => {
    let isMounted = true;
    const loadInfo = async () => {
      try {
        const info = await invoke<SystemInfo>('system:getInfo');
        if (isMounted) {
          setSysInfo(info);
          addLog(`تم الاتصال بنجاح بالنواة: ${info.appName} (${info.osVersion})`);
        }
      } catch (err: any) {
        if (isMounted) {
          addLog(`خطأ في جلب بيانات النظام: ${err.message}`);
        }
      }
    };
    void loadInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  const testIpcLatency = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      await invoke('system:ping', { timestamp: Date.now() });
      const latency = Math.round(performance.now() - start);
      setPingLatency(latency);
      addLog(`اختبار سرعة الجسر (IPC): تم الرد في ${latency} مللي ثانية`);
    } catch (err: any) {
      addLog(`فشل اختبار الجسر: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testSqliteTransaction = async () => {
    setLoading(true);
    try {
      const res = await invoke('db:testTransaction', { count: 10 });
      addLog(`قاعدة البيانات (SQLite): ${res.message || 'تمت المعاملة بنجاح'}`);
    } catch (err: any) {
      addLog(`خطأ في المعاملة: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testPrinter = async () => {
    setLoading(true);
    try {
      const res = await invoke('printer:test', { width: 80 });
      addLog(`طابعة الإيصالات: ${res.message || 'تم إرسال أمر الطباعة'}`);
    } catch (err: any) {
      addLog(`خطأ في الطابعة: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      setScannedHistory((prev) => [barcodeInput.trim(), ...prev.slice(0, 7)]);
      addLog(`تمت قراءة باركود: ${barcodeInput.trim()}`);
      setBarcodeInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <img 
            src="/logo.png" 
            alt="شعار رفيق" 
            className="w-10 h-10 object-contain drop-shadow-[0_2px_8px_rgba(0,168,107,0.25)] hover:scale-105 transition-transform duration-200" 
          />
          <div>
            <h1 className="text-lg font-bold text-white m-0 leading-tight">
              نظام رفيق لنقاط البيع — لوحة التحقق التقني (Milestone 0)
            </h1>
            <p className="text-xs text-slate-400 m-0">
              بيئة تشغيل خفيفة متوافقة مع Windows 7 و Windows 10/11
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700">
            <span className={`w-2.5 h-2.5 rounded-full ${sysInfo?.isWebView2 ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
            <span>{sysInfo?.isWebView2 ? 'WebView2 Native' : 'Browser Dev Mode'}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Target: Chromium 109</span>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Left Column: Test Suites (8 Cols) */}
        <div className="col-span-8 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Status Banners */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Laptop className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">نظام التشغيل</div>
                <div className="text-sm font-bold text-slate-200">{sysInfo?.osVersion || 'جاري الفحص...'}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">قاعدة البيانات</div>
                <div className="text-sm font-bold text-slate-200">SQLite 3 (WAL Mode)</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">زمن استجابة الجسر (IPC)</div>
                <div className="text-sm font-bold text-slate-200">
                  {pingLatency !== null ? `${pingLatency} ms` : 'لم يتم القياس'}
                </div>
              </div>
            </div>
          </div>

          {/* Test Cards Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Card 1: IPC Bridge */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    1. جسر الرسائل الآمن (IPC Bridge)
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300">تاسك 154-2</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  التحقق من تدفق الرسائل ذهاباً وإياباً بين واجهة React ومضيف C# بمهلة حماية وتوليد معرف طلب فريد.
                </p>
              </div>
              <button
                onClick={testIpcLatency}
                disabled={loading}
                className="mt-3.5 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-xs font-semibold transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                قياس زمن الاستجابة (Ping)
              </button>
            </div>

            {/* Card 2: SQLite WAL & Power Cut */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    2. أمان SQLite وانقطاع الكهرباء
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300">تاسك 154-3</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  تفعيل وضع سجل الكتابة (WAL) وحفظ 10 أصناف داخل معاملة ذرية واحدة مع أمان تام من التلف.
                </p>
              </div>
              <button
                onClick={testSqliteTransaction}
                disabled={loading}
                className="mt-3.5 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-semibold transition"
              >
                <Play className="w-3.5 h-3.5" />
                تنفيذ معاملة بيع ذرية تجريبية
              </button>
            </div>

            {/* Card 3: Thermal Printer ESC/POS */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Printer className="w-4 h-4 text-amber-400" />
                    3. طابعة الفواتير واللغة العربية
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300">تاسك 154-4</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  اختبار طباعة إيصال عربي عبر Win32 Spooler بخط عربي مشبّك بدون تقطيع على ورق 80مم/58مم.
                </p>
              </div>
              <button
                onClick={testPrinter}
                disabled={loading}
                className="mt-3.5 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-xs font-semibold transition"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة إيصال تجريبي
              </button>
            </div>

            {/* Card 4: Barcode Scanner Input */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-sky-400" />
                    4. قارئ الباركود (أي لغة كيبورد)
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-sky-900/40 text-sky-300">تاسك 154-6</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  اضرب أي باركود بالقارئ الآن — سيتم التقاط الأرقام بشكل سليم حتى لو لغة الجهاز عربي.
                </p>
              </div>
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="امسح الباركود هنا بالقارئ..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Console / Execution Log (4 Cols) */}
        <div className="col-span-4 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              سجل أحداث النواة المباشر (Audit Log)
            </span>
            <button
              onClick={() => setLogMessages([])}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              مسح
            </button>
          </div>

          <div className="flex-1 p-3 font-mono text-xs overflow-y-auto flex flex-col gap-1.5 text-slate-300">
            {logMessages.length === 0 ? (
              <div className="text-center text-slate-600 mt-20 text-xs">
                لا توجد أحداث مسجلة بعد... اضغط على أي زر تجربة.
              </div>
            ) : (
              logMessages.map((log, idx) => (
                <div key={idx} className="p-2 rounded bg-slate-950/60 border border-slate-800/80 leading-relaxed text-[11px]">
                  {log}
                </div>
              ))
            )}
          </div>

          {/* Scanned Barcode Mini History */}
          {scannedHistory.length > 0 && (
            <div className="p-3 bg-slate-950/80 border-t border-slate-800">
              <div className="text-[11px] font-bold text-sky-400 mb-1.5">آخر باركودات قُرئت:</div>
              <div className="flex flex-wrap gap-1">
                {scannedHistory.map((bc, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 text-[10px] font-mono">
                    {bc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
