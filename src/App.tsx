import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2, Send, Copy, Check, Mic, Square, Scissors, AlertCircle, Upload, Zap, Key, Trash2, UserMinus, Briefcase, Users, Home, ChevronRight, Clock, X, Settings } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
};

const MEETING_PROMPT = `
# Role
你是一位專業、具備高度邏輯且敏銳的高階專案秘書。你的任務是將冗長、可能缺乏組織的會議逐字稿或錄音摘要，精準提煉為結構化、高可讀性的專業會議紀錄。

# Objective
從提供的會議內容中，萃取出核心決議、討論脈絡、待辦事項以及潛在風險，並嚴格按照指定的格式與語氣輸出。

# Guidelines
1. 資訊萃取：忽略會議中的閒聊、冗詞贅字與無關緊要的細節。專注於「誰在什麼時間點前需要完成什麼事」以及「達成了什麼共識」。
2. 語氣與風格：保持客觀、專業、精煉的商務語氣。
3. 結構一致性：絕對遵守下方定義的輸出模板。
4. 洞察力：在「秘書觀察與建議」區塊，點出跨部門協作的潛在風險或管理層面的價值建議。

# Output Format
請使用 Markdown 結構與表格格式輸出會議紀錄，包含：
- 會議基本資訊
- 一、會議重點摘要
- 二、會議主題與背景
- 三、各項議題討論與決議
- 四、會議重點條列
- 五、待辦事項追蹤清單
- 六、秘書觀察與建議
- ---
- ## 【會議逐字稿全紀錄】
  (請在此區塊根據提供的所有分段內容，整理出完整的對話逐字稿，標註說話者)
`;

const INTERVIEW_TRAITS = [
  {
    category: '1.知識 2.對知識態度與意圖',
    items: [
      { id: 'k1', pos: '【主動學習與自主解決能力】遇到問題時，會先主動查詢資料或知識庫尋找答案，而非立即依賴他人，具備基本自我解決問題的能力。', neg: '【被動學習與高度依賴他人】遇到問題傾向直接詢問他人，缺乏主動查詢與自我解決問題的習慣。' },
      { id: 'k2', pos: '【學習動機強且願意接受挑戰】願意接受新的工作或任務，對學習新知與跨職能內容具開放態度，並將其視為提升能力的機會。', neg: '【抗拒學習與跨職務內容】對於非本職或新的工作內容產生抗拒，學習意願低或缺乏投入。' },
      { id: 'k3', pos: '【知識轉化與應用能力】能將所學知識實際應用於工作情境中，提升處理效率或服務品質，而非僅停留在理解層面。', neg: '【無法將知識轉化為行動】即使接受訓練或學習，仍無法有效應用於實際工作，需反覆指導或容易重複錯誤。' },
    ]
  },
  {
    category: '價值核心職能',
    items: [
      { id: 'v1', pos: '【理解客戶需求】能說出並理解顧客真正需要的，會嘗試滿足客戶需求。', neg: '【聚焦不合理要求】不能理解客戶為什麼會這樣要求，聚焦在客戶的要求有多麼不合理。' },
      { id: 'v2', pos: '【問題承接與解決傾向】面對問題會主動承接並持續追蹤處理進度，直到問題解決，而非僅完成當下回應或轉交他人。', neg: '【缺乏問題承接意識】傾向只完成當下回應，未持續追蹤問題結果，或將問題轉交後即不再關注。' },
      { id: 'v3', pos: '【願意協調資源解決問題】尋求內部資源支持協助客戶解決。', neg: '【缺乏時間管理】今天沒完成的工作明天再處理' },
      { id: 'v4', pos: '【注重任務輕重緩急】會將問題區分輕重緩急，緊急的工作會想辦法在期限內完成', neg: '【缺乏團隊合作精神】不尋求主管或同事的協助把事情完成，抱怨事情太多做不完' },
    ]
  },
  {
    category: '報償',
    items: [
      { id: 'r1', pos: '【穩定與長期發展導向】重視工作穩定性與長期發展，傾向在同一組織中累積經驗與能力，而非頻繁轉換工作。', neg: '【短期導向與穩定性不足】對工作缺乏長期投入意願，傾向短期嘗試或頻繁轉換環境。' },
      { id: 'r2', pos: '【成長導向與自我提升動機】具備持續學習與自我提升的動機，會主動尋求學習機會，並願意接受不同任務以提升能力。', neg: '【缺乏成長動機】對學習與能力提升缺乏投入，無明確自我發展方向，或僅以外在條件作為離職理由。' },
      { id: 'r3', pos: '【能力與價值交換觀念】認為薪資與回報應與個人能力與貢獻相對應，重視透過提升能力來創造更高價值。', neg: '【錯誤的報酬認知（年資導向）】認為薪資應隨年資自然提升，而非與個人能力或貢獻連結。' },
      { id: 'r4', pos: '【學習轉化與價值創造能力】能將所學應用於實際工作中，提升效率、優化流程或改善服務品質，而非僅停留在學習本身。', neg: '【無法將學習轉化為價值】即使參與學習或訓練，仍無法有效應用於工作中，對實際產出無明顯幫助。' },
    ]
  },
  {
    category: '自我概念',
    items: [
      { id: 's1', pos: '【面對錯誤的承擔與修正能力】面對錯誤時，能坦誠承認並主動檢視原因，重點放在「如何改善」，並能實際調整行為避免再次發生。', neg: '【推託責任與逃避改善】面對錯誤時傾向解釋原因或歸因外部因素，避談自身責任與改善方式。' },
      { id: 's2', pos: '【開放接受回饋與調整能力】面對主管或他人指正時，能以開放態度接受，願意理解回饋內容並進行調整，而非抗拒或防衛。', neg: '【防衛心強與抗拒回饋】面對指正時產生防衛或抗拒，傾向合理化自身行為，或認為他人不公平。' },
      { id: 's3', pos: '【自我檢視與持續優化能力】能主動反思自身表現，持續檢視並優化工作方式，而非僅在被指正時才調整。', neg: '【缺乏自我反思與調整能力】即使接受回饋，仍未實際改變行為，容易重複犯錯或停留在原有模式。' },
    ]
  },
  {
    category: '人格特質天賦',
    items: [
      { id: 'p1', pos: '【同理心與情境理解能力】能理解客戶情緒與需求，對於抱怨、重複提問或情緒反應，能以理解的角度看待，而非僅從自身立場判斷。', neg: '【缺乏同理心與情境理解】無法理解客戶情緒與需求，容易從自身角度評價客戶，或認為客戶要求不合理。' },
      { id: 'p2', pos: '【責任承接與面對困難能力】面對困難或情緒性客戶時，傾向主動承接與處理，而非逃避或切割責任，必要時會尋求協助但仍持續參與解決過程。', neg: '【逃避困難與責任切割】面對情緒性或困難客戶時傾向逃避，將問題轉交他人處理，不願承接或參與解決。' },
      { id: 'p3', pos: '【情緒穩定與壓力調適能力】在高壓或挫折情境下，能維持情緒穩定，不影響服務品質，並能快速調整狀態持續投入工作。', neg: '【情緒反應強或易與客戶對立】容易被客戶情緒影響，產生爭辯或對立情況，影響服務品質與互動關係。' },
    ]
  },
  {
    category: '生存對策',
    items: [
      { id: 'sur1', pos: '【理性職涯規劃】離職原因具邏輯性，能清楚說明轉職與能力成長、職涯方向的關聯，而非單純為薪資或逃避現況。', neg: '【過度抱怨前東家】持續抱怨公司制度、主管或同事，將離職原因歸因於外部環境，缺乏自我檢視。' },
      { id: 'sur2', pos: '【具體職涯發展藍圖】對未來1–2年職涯有明確方向，能說出「想累積的能力 / 想達成的角色」，並與應徵職位具連結。', neg: '【升遷取向但缺乏行動】強調想升遷、加薪，但無法說明為此做過哪些努力或準備。' },
      { id: 'sur3', pos: '【成長導向選擇工作】選擇工作時優先考量「能學到什麼 / 能累積什麼」，而非只看薪資、輕鬆程度或穩定性。', neg: '【職涯方向模糊】對未來沒有明確方向，只是「先找一份工作做看看」、「再看看有沒有機會」。' },
      { id: 'sur4', pos: '【能從過去經驗提煉學習】能具體說明過去每份工作學到了什麼、如何影響現在的選擇，而不是只是描述做過什麼。', neg: '【逃避型轉職】轉職原因主要為逃避壓力、工作量、人際關係，而非追求成長或挑戰。' },
    ]
  }
];

const INTERVIEW_PROMPT = `
# Role
你是一位資深的電信業客服招募專家，擅長透過「人類模型（大腦演算法）」來預測候選人的未來行為。你的任務是彙整面試過程，進行深度評估並給出最終錄取建議。

# Objective
根據面試逐字稿與摘要，分析候選人的核心特質與底層演算法，產出結構化的面試評估報告。

# Hiring Criteria & Weighting (核心任用指標)
1. **業務/服務推動力 (權重 40%)**: 
   - 狼性 (Aggressiveness): 主動追蹤業績、對目標渴望、不甘於報價。
   - 或 極致服務 (Service): 強大共情、理解客戶問題、願意追蹤負責到底。
   - *任用條件：以上兩者必須擇一具備優異表現。*
2. **長期穩定性 (權重 40%)**: 
   - 過去工作年資、離職原因合理性、對高壓環境的心理準備。
   - *任用條件：必須達標，若有顯著風險需發出警告。*
3. **六大特質評分 (權重 20%)**: 情緒韌性、同理傾聽、邏輯溝通、解決問題、紀律專注、學習彈性。

# Scoring Rules (1-5分)
- 5分 (優異): 提供多個具體 STAR 案例，完全符合指標。
- 3分 (合格): 符合基本要求，但缺乏主動性或亮點。
- 1分 (不合格): 展現明顯負向特質或嚴重風險。
- **保守評分原則**：若候選人回答缺乏具體 STAR 案例（僅描述理論、個人風格或「通常會怎麼做」），評分應採取保守態度，通常不應超過 3 分。

# Hiring Levels
- 強烈建議錄取 (Highly Recommended)
- 建議錄取 (Recommended)
- 尚待觀察 (Neutral)
- 不建議錄取 (Not Recommended)

# Target Traits (21項底層特質評估)
${INTERVIEW_TRAITS.map(cat => cat.items.map(item => `- ${item.id}: ${item.pos.split('】')[0].substring(1)}`).join('\n')).join('\n')}

# Output Format (JSON)
{
  "candidate_name": "...",
  "job_title": "...",
  "interview_date": "...",
  "interviewer": "...",
  "test_score": "...",
  "expected_salary": "...",
  "overall_score": 0-100,
  "hiring_recommendation": "...",
  "decision_reasoning": "...",
  "core_indicators": {
    "business_service": { "score": 1-5, "type": "狼性人才/服務人才/兩者皆無", "evidence": "STAR 案例分析..." },
    "stability": { "score": 1-5, "evidence": "STAR 案例分析..." }
  },
  "six_traits_scores": {
    "emotional_resilience": 1-5,
    "empathetic_listening": 1-5,
    "logical_communication": 1-5,
    "problem_solving": 1-5,
    "discipline_focus": 1-5,
    "learning_flexibility": 1-5
  },
  "traits_scores": {
    "k1": { "score": 1, "evidence": "候選人提到在處理...時，主動..." }, 
    "k2": { "score": 0, "evidence": "..." },
    "..." : { "score": 0, "evidence": "..." } // 包含所有 21 項底層特質 (score 1:正向, -1:負向, 0:中性)
  },
  "future_self": "...",
  "conclusion_pos": "...",
  "conclusion_neg": "...",
  "manager_record": "...", // 此欄位請生成一段完整的文字報告，包含：【錄用建議】、【綜合評分】、【核心指標分析(含證據)】、【優劣勢總結】
  "hr_record": "...",
  "salary_benefits": "..."
}

# Requirements
- 必須從逐字稿中提取具體事實（如數字、年資、具體事件）。
- 嚴禁空泛描述，必須使用證據導向的 STAR 分析。
- **特質評估證據**：在 'traits_scores' 的 'evidence' 欄位中，必須根據求職者的具體言論或行為寫出判斷原因。嚴禁直接複製特質定義，必須說明「因為候選人說了...」或「因為候選人表現出...」。
`;

const RESUME_PROMPT = `
# Role
你是一位專業的電信業資深 HR 與招募顧問。你的任務是分析求職者的履歷，並針對我們的 6 大核心特質與「人類模型」提供面試前的洞察。

# Objective
1. 總結候選人的學經歷亮點。
2. 針對 6 大特質，分析履歷中展現的潛在強項。
3. **人類模型預判**：從履歷（如換工作頻率、職位變動）預判其可能的「生存對策」與「報償」傾向。
4. 提供 3-5 個客製化的「樹狀面談」提問建議，特別是針對履歷中的疑點。

# Output Format
請使用 Markdown 格式輸出。
`;

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface Chunk {
  id: number;
  text: string;
  summary?: string;
  isAnalyzing: boolean;
  error?: string;
  audio?: {
    fileName: string;
    mimeType: string;
    data?: string;
    uri?: string;
  };
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4">糟糕！發生了錯誤</h1>
            <p className="text-slate-500 mb-6 leading-relaxed">
              應用程式遇到了一個無法預期的錯誤。您可以嘗試重新整理網頁，或點擊下方按鈕返回首頁。
            </p>
            <div className="bg-red-50 p-4 rounded-xl text-left mb-6 overflow-auto max-h-40">
              <p className="text-xs font-mono text-red-800 break-all">
                {this.state.error?.toString()}
              </p>
            </div>
            <button 
              onClick={() => window.location.href = '/'}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg"
            >
              返回首頁並重置
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [appMode, setAppMode] = useState<'home' | 'meeting' | 'interview'>('home');
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [currentChunkText, setCurrentChunkText] = useState('');
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const chunksRef = useRef<Chunk[]>([]);
  
  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  const getPrevChunkText = (currentId: number): string => {
    // 找出所有 id 小於 currentId 且已成功分析的最後一個 chunk 的逐字稿內容
    const completedChunks = chunksRef.current.filter(c => c.id < currentId && !c.isAnalyzing && c.summary);
    if (completedChunks.length === 0) return '';
    const lastChunk = completedChunks[completedChunks.length - 1];
    const text = lastChunk.summary || '';
    // 抓取最後 150 字作為上下文對齊參考
    return text.substring(Math.max(0, text.length - 150));
  };

  const [finalReport, setFinalReport] = useState('');
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [resumeAnalysis, setResumeAnalysis] = useState('');
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [participants, setParticipants] = useState<{ id: string; placeholder: string; name: string; description: string }[]>([]);
  const [isDetectingParticipants, setIsDetectingParticipants] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [isFfmpegLoading, setIsFfmpegLoading] = useState(true);
  const [ffmpegError, setFfmpegError] = useState(false);
  const [micPermissionStatus, setMicPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  const [debugInfo, setDebugInfo] = useState<string>('');

  const getDebugInfo = () => {
    const info = {
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      isIframe: window.self !== window.top,
      micPermissionStatus
    };
    return JSON.stringify(info, null, 2);
  };

  const checkPermission = async () => {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as any });
        setMicPermissionStatus(result.state as any);
        result.onchange = () => {
          setMicPermissionStatus(result.state as any);
        };
      } catch (e) {
        console.warn('Permissions API not supported for microphone', e);
      }
    }
  };

  useEffect(() => {
    checkPermission();
  }, []);

  const requestMicPermissionManually = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermissionStatus('granted');
      setErrorMsg('');
    } catch (err: any) {
      console.error('Manual permission request failed:', err);
      setMicPermissionStatus('denied');
      const errorDetails = `Error: ${err.name} - ${err.message}`;
      setErrorMsg('手動要求權限失敗：' + errorDetails);
      setDebugInfo(getDebugInfo() + '\n' + errorDetails);
    }
  };
  const [ffmpegLoadingStatus, setFfmpegLoadingStatus] = useState('');
  const [useCompatibilityMode, setUseCompatibilityMode] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [interviewData, setInterviewData] = useState<any>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customGasUrl, setCustomGasUrl] = useState(() => localStorage.getItem('customGasUrl') || '');

  // Persistence: Load from localStorage on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('appMode');
      const savedChunks = localStorage.getItem('chunks');
      const savedInterviewData = localStorage.getItem('interviewData');
      const savedFinalReport = localStorage.getItem('finalReport');
      const savedResumeAnalysis = localStorage.getItem('resumeAnalysis');
      const savedParticipants = localStorage.getItem('participants');

      if (savedMode && (savedChunks || savedInterviewData || savedFinalReport)) {
        setHasRestoredSession(true);
        if (savedChunks) {
          try {
            setChunks(JSON.parse(savedChunks));
          } catch (e) {
            console.error('Error parsing saved chunks:', e);
          }
        }
        if (savedInterviewData) {
          try {
            setInterviewData(JSON.parse(savedInterviewData));
          } catch (e) {
            console.error('Error parsing saved interview data:', e);
          }
        }
        if (savedFinalReport) setFinalReport(savedFinalReport);
        if (savedResumeAnalysis) setResumeAnalysis(savedResumeAnalysis);
        if (savedParticipants) {
          try {
            setParticipants(JSON.parse(savedParticipants));
          } catch (e) {
            console.error('Error parsing saved participants:', e);
          }
        }
        
        console.log('Session data loaded from localStorage');
      }
    } catch (err) {
      console.error('Failed to load session from localStorage:', err);
    }
  }, []);

  // Persistence: Save to localStorage whenever state changes
  useEffect(() => {
    if (appMode !== 'home') {
      const saveToStorage = (key: string, value: any) => {
        try {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, stringValue);
        } catch (err: any) {
          if (err.name === 'QuotaExceededError' || err.message?.includes('quota')) {
            console.warn(`LocalStorage quota exceeded while saving ${key}.`);
            if (key === 'chunks') {
              // Try saving chunks without audio data if not already done
              const slimChunks = (value as any[]).map(c => {
                if (c.audio) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { data, ...audioWithoutData } = c.audio;
                  return { ...c, audio: audioWithoutData };
                }
                return c;
              });
              try {
                localStorage.setItem(key, JSON.stringify(slimChunks));
                console.log(`Saved slimmed ${key} to localStorage.`);
              } catch (e) {
                console.error(`Failed to save slimmed ${key}.`, e);
              }
            }
          } else {
            console.error(`Failed to save ${key} to localStorage:`, err);
          }
        }
      };

      saveToStorage('appMode', appMode);
      
      // Always slim chunks before saving to avoid hitting quota with base64 audio
      const chunksToSave = chunks.map(c => {
        if (c.audio && c.audio.data) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { data, ...audioWithoutData } = c.audio;
          return { ...c, audio: audioWithoutData };
        }
        return c;
      });
      
      saveToStorage('chunks', chunksToSave);
      saveToStorage('interviewData', interviewData);
      saveToStorage('finalReport', finalReport);
      saveToStorage('resumeAnalysis', resumeAnalysis);
      saveToStorage('participants', participants);
    }
  }, [appMode, chunks, interviewData, finalReport, resumeAnalysis, participants]);

  // Persistence: Clear session
  const clearSession = () => {
    localStorage.removeItem('appMode');
    localStorage.removeItem('chunks');
    localStorage.removeItem('interviewData');
    localStorage.removeItem('finalReport');
    localStorage.removeItem('resumeAnalysis');
    localStorage.removeItem('participants');
    setChunks([]);
    setInterviewData(null);
    setFinalReport('');
    setResumeAnalysis('');
    setParticipants([]);
    setAppMode('home');
    setHasRestoredSession(false);
  };

  // Prevent accidental refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording || chunks.length > 0 || interviewData || finalReport) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecording, chunks, interviewData, finalReport]);

  // Helper to extract error message from Gemini API error object
  const getErrorMessage = (err: any): string => {
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.error && err.error.message) return err.error.message;
    try {
      const parsed = JSON.parse(err.message || '{}');
      if (parsed.error && parsed.error.message) return parsed.error.message;
    } catch (e) {}
    try {
      return JSON.stringify(err);
    } catch (e) {
      return '未知錯誤';
    }
  };
  // Helper for Gemini API calls with retry logic
  const callGeminiWithRetry = async (
    apiCall: () => Promise<any>,
    onRetry?: (delay: number, attempt: number) => void,
    retryCount = 0,
    maxRetries = 6
  ): Promise<any> => {
    try {
      return await apiCall();
    } catch (err: any) {
      const errorMsg = getErrorMessage(err);
      const isRetryable = errorMsg.includes('429') || 
                          err.status === 'RESOURCE_EXHAUSTED' || 
                          err.status === 429 ||
                          (err.error && err.error.code === 429) ||
                          errorMsg.includes('Quota exceeded') ||
                          errorMsg.includes('RESOURCE_EXHAUSTED') ||
                          errorMsg.includes('Rate limit') ||
                          errorMsg.includes('limit reached') ||
                          errorMsg.includes('503') ||
                          err.status === 'UNAVAILABLE' ||
                          err.status === 503 ||
                          (err.error && err.error.code === 503) ||
                          errorMsg.includes('500') ||
                          err.status === 'INTERNAL' ||
                          err.status === 500 ||
                          (err.error && err.error.code === 500) ||
                          errorMsg.includes('Internal error') ||
                          errorMsg.includes('high demand') ||
                          errorMsg.includes('try again later');
      
      if (isRetryable && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 10000; 
        console.log(`Service unavailable or rate limited. Retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
        if (onRetry) onRetry(delay, retryCount + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        return callGeminiWithRetry(apiCall, onRetry, retryCount + 1, maxRetries);
      }
      
      if (errorMsg.includes('Requested entity was not found')) {
        console.warn('API Key might be invalid or project not found. Prompting for key selection.');
        if (window.aistudio) {
          await window.aistudio.openSelectKey();
        }
      }
      
      throw err;
    }
  };

  const ffmpegRef = useRef(new FFmpeg());
  const ffmpegLoadedRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const currentChunkRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastChunkTimeRef = useRef<number>(0);

  useEffect(() => {
    loadFFmpeg();
    checkApiKey();
  }, []);

  useEffect(() => {
    if (isRecording) {
      lastChunkTimeRef.current = Date.now();
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev + 1;
          // Every 2 minutes (120 seconds), commit the chunk
          if (next > 0 && next % 120 === 0) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            } else {
              commitCurrentChunk();
            }
            lastChunkTimeRef.current = Date.now();
          }
          return next;
        });
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
      setHasApiKey(true);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const loadFFmpeg = async () => {
    setIsFfmpegLoading(true);
    setFfmpegError(false);
    setFfmpegLoadingStatus('正在初始化...');
    
    const cdns = [
      { name: 'jsDelivr (推薦)', url: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd' },
      { name: 'unpkg (備援)', url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd' }
    ];
    
    const ffmpeg = ffmpegRef.current;
    
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg Log:', message);
      if (message.includes('Loading')) setFfmpegLoadingStatus(`載入中: ${message}`);
    });

    let loaded = false;
    for (const cdn of cdns) {
      try {
        setFfmpegLoadingStatus(`正在從 ${cdn.name} 下載核心組件 (檔案較大，請耐心等候)...`);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 90000) // Increase to 90 seconds for slow networks
        );

        const loadPromise = ffmpeg.load({
          coreURL: await toBlobURL(`${cdn.url}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: `${cdn.url}/ffmpeg-core.wasm`,
        });

        await Promise.race([loadPromise, timeoutPromise]);
        
        loaded = true;
        break;
      } catch (err) {
        console.warn(`Failed to load FFmpeg from ${cdn.url}`, err);
        setFfmpegLoadingStatus(`${cdn.name} 載入失敗，嘗試下一個節點...`);
      }
    }

    if (loaded) {
      setFfmpegLoaded(true);
      ffmpegLoadedRef.current = true;
      setIsFfmpegLoading(false);
      setFfmpegLoadingStatus('');
    } else {
      setFfmpegError(true);
      setIsFfmpegLoading(false);
      setFfmpegLoadingStatus('所有節點均載入失敗');
    }
  };

  const fileToBase64 = (file: Blob | File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    if (fileInputRef.current) fileInputRef.current.value = '';

    setErrorMsg('');
    setIsProcessingFile(true);

    try {
      for (const file of fileList) {
        const statusChunkId = Date.now() + Math.random();
        setChunks(prev => [...prev, {
          id: statusChunkId,
          text: `正在準備處理錄音檔：${file.name}...`,
          isAnalyzing: true
        }]);

        try {
          if (file.size < 20 * 1024 * 1024 && !file.name.toLowerCase().endsWith('.m4a')) {
            await processFileDirectly(file, statusChunkId);
          } else if (useCompatibilityMode) {
            await processFileBySlicing(file, statusChunkId);
          } else {
            if (isFfmpegLoading && !ffmpegLoadedRef.current) {
              setChunks(prev => prev.map(c => c.id === statusChunkId ? { ...c, text: `處理組件載入中，請稍候...` } : c));
              let waitTime = 0;
              while (!ffmpegLoadedRef.current && waitTime < 60) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                waitTime++;
                if (ffmpegError) break;
              }
            }

            if (ffmpegLoadedRef.current) {
              await processFileWithFFmpeg(file, statusChunkId);
            } else {
              if (file.size > 20 * 1024 * 1024) {
                await processFileBySlicing(file, statusChunkId);
              } else {
                await processFileLegacy(file, statusChunkId);
              }
            }
          }
        } catch (e: any) {
          console.error(`Audio processing failed for ${file.name}`, e);
          setErrorMsg(prev => (prev ? prev + '\n' : '') + `${file.name}: ${e.message || '處理失敗'}`);
          setChunks(prev => prev.filter(c => c.id !== statusChunkId));
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (globalErr: any) {
      console.error('Global upload error:', globalErr);
      setErrorMsg(prev => (prev ? prev + '\n' : '') + `上傳過程發生錯誤: ${globalErr.message || '未知錯誤'}`);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (resumeInputRef.current) resumeInputRef.current.value = '';

    setErrorMsg('');
    setIsAnalyzingResume(true);
    setResumeAnalysis('');

    try {
      const base64Data = await fileToBase64(file);
      const response = await callGeminiWithRetry(
        () => getAi().models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { mimeType: file.type || 'application/pdf', data: base64Data } },
              { text: RESUME_PROMPT }
            ]
          }
        })
      );
      setResumeAnalysis(response.text || '');
    } catch (e: any) {
      console.error('Resume Analysis Error:', e);
      setErrorMsg('履歷分析失敗：' + getErrorMessage(e));
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const processFileDirectly = async (file: File, statusChunkId: number) => {
    const base64Data = await fileToBase64(file);
    const segmentChunk: Chunk = {
      id: Date.now() + Math.random(),
      text: `錄音檔：${file.name}`,
      isAnalyzing: true,
      audio: { fileName: file.name, mimeType: file.type || 'audio/mpeg', data: base64Data }
    };
    setChunks(prev => [...prev.filter(c => c.id !== statusChunkId), segmentChunk]);
    await analyzeChunk(segmentChunk);
  };

  const processFileWithFFmpeg = async (file: File, statusChunkId: number) => {
    const ffmpeg = ffmpegRef.current;
    const inputExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase() || '.m4a';
    const inputName = 'input' + inputExt;
    setChunks(prev => prev.map(c => c.id === statusChunkId ? { ...c, text: `正在進行高效能切片處理：${file.name}...` } : c));
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    // Slice into 3-minute segments without re-encoding (very fast)
    await ffmpeg.exec(['-i', inputName, '-f', 'segment', '-segment_time', '180', '-c', 'copy', `out%03d${inputExt}`]);
    const files = await ffmpeg.listDir('.');
    const outputFiles = files.filter(f => f.name.startsWith('out') && !f.isDir);
    setChunks(prev => prev.filter(c => c.id !== statusChunkId));
    
    if (outputFiles.length === 0) {
      throw new Error('切片處理失敗，請確認檔案格式是否支援。');
    }
    
    for (let i = 0; i < outputFiles.length; i++) {
      const fileName = outputFiles[i].name;
      const data = await ffmpeg.readFile(fileName);
      
      // Determine correct mime type based on extension
      let mimeType = 'audio/mpeg';
      if (inputExt === '.m4a') mimeType = 'audio/mp4';
      if (inputExt === '.wav') mimeType = 'audio/wav';
      if (inputExt === '.ogg') mimeType = 'audio/ogg';
      
      const blob = new Blob([data], { type: mimeType });
      const base64Data = await fileToBase64(blob);
      const segmentChunk: Chunk = {
        id: Date.now() + i + Math.random(),
        text: `錄音分段 ${i + 1}/${outputFiles.length} (約第 ${i * 3} 分鐘起)`,
        isAnalyzing: true,
        audio: { fileName: `${file.name} (Part ${i + 1})`, mimeType: mimeType, data: base64Data }
      };
      setChunks(prev => [...prev, segmentChunk]);
      await analyzeChunk(segmentChunk);
      await ffmpeg.deleteFile(fileName);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await ffmpeg.deleteFile(inputName);
  };

  const processFileBySlicing = async (file: File, statusChunkId: number) => {
    setChunks(prev => prev.map(c => c.id === statusChunkId ? { ...c, text: `檔案較大，正在安全上傳至 AI 處理中心 (${file.name})...` } : c));
    
    try {
      const mimeType = file.type || 'audio/mpeg';
      
      let uploadResponse = await getAi().files.upload({
        file: file,
        mimeType: mimeType
      });
      
      if (!uploadResponse.name) {
        throw new Error('無法取得檔案名稱');
      }

      setChunks(prev => prev.map(c => c.id === statusChunkId ? { ...c, text: `檔案上傳成功，正在等待雲端處理完成 (${file.name})...` } : c));
      
      // Wait until state is ACTIVE
      let state = uploadResponse.state;
      let checkCount = 0;
      while (state === 'PROCESSING' && checkCount < 30) { // wait up to 60s
        await new Promise(r => setTimeout(r, 2000));
        uploadResponse = await getAi().files.get({ name: uploadResponse.name });
        state = uploadResponse.state;
        checkCount++;
      }

      const segmentChunk: Chunk = {
        id: Date.now() + Math.random(),
        text: `處理中 (${file.name} - 雲端處理模式)`,
        isAnalyzing: true,
        summary: '',
        audio: { fileName: file.name, mimeType: mimeType, uri: uploadResponse.uri! }
      };
      
      setChunks(prev => [...prev.filter(c => c.id !== statusChunkId), segmentChunk]);
      await analyzeChunk(segmentChunk);

    } catch (err: any) {
      console.warn('File API Upload Failed', err);
      // Wait for 1s so the user can see the error
      await new Promise(r => setTimeout(r, 1000));
      
      setChunks(prev => prev.map(c => c.id === statusChunkId ? { ...c, text: `雲端上傳失敗，正在嘗試最後降級處理...` } : c));
      
      // Ultimately fallback to processFileDirectly
      await processFileDirectly(file, statusChunkId);
    }
  };

  const processFileLegacy = async (file: File, statusChunkId: number) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
      const wavBlob = new Blob([audioBufferToMonoWav(decodedData)], { type: 'audio/wav' });
      const base64Data = await fileToBase64(wavBlob);
      const segmentChunk: Chunk = {
        id: Date.now() + Math.random(),
        text: `錄音檔：${file.name} (相容模式)`,
        isAnalyzing: true,
        audio: { fileName: file.name, mimeType: 'audio/wav', data: base64Data }
      };
      setChunks(prev => [...prev.filter(c => c.id !== statusChunkId), segmentChunk]);
      await analyzeChunk(segmentChunk);
      audioCtx.close();
    } catch (err: any) {
      console.warn('Fallback to direct processing due to decode error', err);
      await processFileDirectly(file, statusChunkId);
    }
  };

  function audioBufferToMonoWav(buffer: AudioBuffer) {
    const numOfChan = 1; // Force mono to save space
    const length = buffer.length * 2 + 44;
    const buffer_out = new ArrayBuffer(length);
    const view = new DataView(buffer_out);
    let pos = 0;
    const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2);
    setUint16(2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);
    
    const channelData0 = buffer.getChannelData(0);
    const channelData1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    
    for (let i = 0; i < buffer.length; i++) {
      let sample = channelData0[i];
      if (channelData1) {
        sample = (sample + channelData1[i]) / 2;
      }
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      pos += 2;
    }
    return buffer_out;
  }

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-TW';
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setInterimText(interim);
      if (final) {
        currentChunkRef.current += final + ' ';
        setCurrentChunkText(currentChunkRef.current);
      }
    };
    recognition.onend = () => { 
      if (isRecordingRef.current) {
        try {
          recognition.start(); 
        } catch (e) {
          console.error('Failed to restart speech recognition:', e);
        }
      }
    };
    recognition.onerror = (event: any) => {
      console.error('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed') {
        setErrorMsg('麥克風存取被拒絕，請檢查瀏覽器設定。');
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    };
    recognitionRef.current = recognition;
  }, []);

  const commitCurrentChunk = async (retryId?: number, retryText?: string) => {
    const text = retryText || currentChunkRef.current.trim();
    const id = retryId || Date.now();
    if (!text) return;
    if (!retryId) {
      setChunks(prev => [...prev, { id, text, isAnalyzing: true }]);
      currentChunkRef.current = '';
      setCurrentChunkText('');
      setInterimText('');
    } else {
      setChunks(prev => prev.map(c => c.id === id ? { ...c, isAnalyzing: true, error: undefined } : c));
    }
    try {
      const response = await callGeminiWithRetry(
        () => getAi().models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `請總結重點：\n\n${text}`,
        }),
        (delay, attempt) => {
          setChunks(prev => prev.map(c => c.id === id ? { 
            ...c, 
            summary: `頻率限制中... 將在 ${delay/1000} 秒後進行第 ${attempt} 次重試` 
          } : c));
        }
      );
      setChunks(prev => prev.map(c => c.id === id ? { ...c, summary: response.text, isAnalyzing: false, error: undefined } : c));
    } catch (e: any) {
      console.error('Gemini API Error (Text Chunk):', e);
      const errorMsg = getErrorMessage(e);
      setChunks(prev => prev.map(c => c.id === id ? { 
        ...c, 
        summary: `分析失敗: ${errorMsg}`, 
        isAnalyzing: false,
        error: errorMsg 
      } : c));
    }
  };

  const analyzeChunk = async (chunk: Chunk): Promise<void> => {
    if (!chunk.audio || (!chunk.audio.data && !chunk.audio.uri)) {
      if (!chunk.audio) return;
      // If audio exists but data is missing (e.g. from restored session without data)
      // we can't re-analyze the audio, so we just mark it as not analyzing.
      setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, isAnalyzing: false } : c));
      return;
    }
    try {
      const prevContext = getPrevChunkText(chunk.id);
      const prevContextPrompt = prevContext
        ? `\n\n【上下文銜接參考】：\n上一段錄音的結尾轉寫內容如下：\n「...${prevContext}」\n本段錄音開頭與上一段可能有重疊或緊密接續。請參考這段文字，確保語意連貫。如果本段開頭的發言與參考內容重複，請自動對齊並【去除重複的字句】，不要輸出重複的開頭，直接順暢地接著寫下去。`
        : '';

      const meetingInstructions = `這是一段會議錄音。請仔細聆聽並將其內容轉錄為逐字稿，然後總結重點、決議與待辦事項。${prevContextPrompt}

**防幻覺與客觀轉錄核心指令：**
1. 如果這段音檔中完全沒有人說話（例如只有背景噪音、鍵盤聲、呼吸聲或完全安靜），請直接回覆「此段音檔無人發言」，**絕對不要**憑空捏造或猜測任何對話內容。
2. 轉錄時只需記錄實際聽到的內容，遇到聽不清楚的部分請標寫 [聽不清] 或跳過，避免腦補或產生任何幻覺。
3. 嚴格逐字記錄，不可主動刪減字句或進行二次創作。`;

      const interviewInstructions = `這是一段電信公司客服人員的面試錄音。${prevContextPrompt}

請執行以下任務：
1. 轉錄逐字稿（請嚴格遵守【防幻覺指令】）。
2. 總結面試進度：
   - 【已詢問問題分類】：識別面試官是否已詢問以下預設問題（請註明問題代號，如 1-A, 2-B 等）。
   - 【人格特質觀察】：針對 6 項核心特質，分析目前候選人的表現。
   - 【⚠️ 模糊敘述偵測】：若候選人回答中出現「通常...」、「我認為...」、「大概...」等非具體行為的模糊敘述，請在此區塊發出警告，並提醒面試官要求具體 STAR 案例。
   - 【🌳 樹狀追問建議】：根據剛才聽到的對話內容，提供 3-4 個深入追問的問題，以挖掘其「人類模型」底層資訊。
   - 【核心特質補題建議】：
     - 請分析目前已涵蓋的人格特質分類（1-6）。
     - **若目前問題已可歸類到某個人格特質，請產出下一個「未問到」或「資訊最少」的人格特質分類。**
     - 針對該「下一個特質」提供 2-3 個具體的面試問題推薦給面試官。

【預設問題清單】：
1. 情緒韌性：(A)奧客經驗與心情調整 (B)連續抱怨電話的品質維持
2. 同理傾聽：(A)帳單超支時的同理對話 (B)發現客戶潛在需求實例
3. 邏輯溝通：(A)向長輩解釋流量超額降速 (B)帶領客戶看懂帳單的邏輯
4. 解決問題：(A)處理 SOP 無效解決的問題 (B)處理權限外的補償僵局
5. 紀律專注：(A)忙碌環境下的零錯誤操作 (B)出勤紀律管理與突發處理
6. 學習彈性：(A)學習新方案的高效率方法 (B)適應介面或政策大幅修改

**防幻覺與客觀轉錄核心指令：**
1. 如果這段音檔中完全沒有人說話（例如只有背景噪音、空白、鍵盤聲或完全安靜），請在轉錄逐字稿區塊直接回覆「此段音檔無人發言」，**絕對不要**憑空捏造或猜測任何對話內容。
2. 轉錄時只需記錄實際聽到的內容，遇到聽不清楚的部分請標寫 [聽不清] 或跳過，避免腦補或產生任何幻覺。`;

      const response = await callGeminiWithRetry(
        () => getAi().models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              chunk.audio.uri 
                ? { fileData: { fileUri: chunk.audio.uri, mimeType: chunk.audio.mimeType } }
                : { inlineData: { mimeType: chunk.audio.mimeType, data: chunk.audio.data! } },
              { text: appMode === 'meeting' ? meetingInstructions : interviewInstructions }
            ]
          }
        }),
        (delay, attempt) => {
          setChunks(prev => prev.map(c => c.id === chunk.id ? { 
            ...c, 
            summary: `頻率限制中... 將在 ${delay/1000} 秒後進行第 ${attempt} 次重試` 
          } : c));
        }
      );
      
      // 成功後立即將 chunks 中的大體積音訊 base64 數據清除，只保留文字
      setChunks(prev => prev.map(c => c.id === chunk.id ? { 
        ...c, 
        summary: response.text, 
        isAnalyzing: false, 
        error: undefined,
        audio: c.audio ? { ...c.audio, data: undefined } : undefined
      } : c));
    } catch (err: any) {
      console.error('Gemini API Error (Audio):', err);
      const errorMsg = getErrorMessage(err);
      setChunks(prev => prev.map(c => c.id === chunk.id ? { 
        ...c, 
        summary: `分析失敗: ${errorMsg}`, 
        isAnalyzing: false,
        error: errorMsg 
      } : c));
    }
  };

  const startMediaRecorder = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('您的瀏覽器不支援音訊錄製功能。');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        try {
          const mimeType = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          if (audioBlob.size > 1000) { 
            const base64Data = await fileToBase64(audioBlob);
            const id = Date.now();
            const segmentChunk: Chunk = {
              id,
              text: currentChunkRef.current.trim() || `即時錄音分段 (${new Date().toLocaleTimeString()})`,
              isAnalyzing: true,
              audio: { fileName: `Live-Segment-${id}.${mimeType.split('/')[1].split(';')[0]}`, mimeType, data: base64Data }
            };
            setChunks(prev => [...prev, segmentChunk]);
            currentChunkRef.current = '';
            setCurrentChunkText('');
            setInterimText('');
            await analyzeChunk(segmentChunk);
          }
          
          if (isRecordingRef.current) {
            audioChunksRef.current = [];
            try {
              recorder.start();
            } catch (e) {
              console.error('Failed to restart MediaRecorder:', e);
            }
          } else {
            stream.getTracks().forEach(track => track.stop());
          }
        } catch (err) {
          console.error('Error in MediaRecorder onstop:', err);
        }
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (err: any) {
      console.error('Failed to start MediaRecorder:', err);
      let msg = '無法啟動音訊錄製，請檢查麥克風權限。';
      
      // Always set denied status to trigger the big banner
      setMicPermissionStatus('denied');
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = '麥克風存取被拒絕。請檢查瀏覽器網址列左側的「鎖頭」圖示，並將「麥克風」設定為「允許」，然後重新整理頁面。';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = '找不到麥克風裝置，請確認已連接麥克風並在系統設定中啟用。';
      } else {
        msg = `麥克風啟動失敗 (${err.name}): ${err.message}`;
      }
      
      setErrorMsg(msg);
      setDebugInfo(getDebugInfo() + '\nError: ' + err.name + ' - ' + err.message);
      throw err;
    }
  };

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        setIsRecording(false); isRecordingRef.current = false;
        try {
          recognitionRef.current?.stop();
        } catch (e) {
          console.error('Failed to stop SpeechRecognition:', e);
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          try {
            mediaRecorderRef.current.stop();
          } catch (e) {
            console.error('Failed to stop MediaRecorder:', e);
          }
        } else if (currentChunkRef.current.trim()) {
          commitCurrentChunk();
        }
      } else {
        setErrorMsg('');
        try {
          await startMediaRecorder();
          setIsRecording(true); 
          isRecordingRef.current = true;
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error('SpeechRecognition start error:', e);
          }
        } catch (err) {
          // Error already handled in startMediaRecorder
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      }
    } catch (err) {
      console.error('Toggle recording error:', err);
      setErrorMsg('切換錄音狀態時發生錯誤。');
    }
  };

  const generateFinalReport = async () => {
    if (chunks.length === 0 && !currentChunkText.trim()) return;
    if (participants.length === 0) {
      setErrorMsg('請先進行「人員識別」，確認與會者姓名後才能產生最終報告。');
      const participantSection = document.getElementById('participant-section');
      participantSection?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setIsGeneratingFinal(true);
    setErrorMsg('');
    let participantContext = "";
    if (participants.length > 0) {
      participantContext = "### 與會人員名單對照與合併說明：\n" + 
        participants.map(p => `- ${p.placeholder} (${p.description}) -> 正確姓名：${p.name || '未提供'}`).join('\n') + 
        "\n\n**重要指令：**\n1. 請在報告中優先使用上述「正確姓名」。\n2. 如果多個代號（例如人員 A 與人員 E）對應到同一個「正確姓名」，請將其視為同一人進行合併處理。\n3. 如果某個代號沒有對應姓名，請使用其特徵描述。\n\n";
    }
    let resumeContext = "";
    if (appMode === 'interview' && resumeAnalysis) {
      resumeContext = `### 候選人履歷預分析參考：\n${resumeAnalysis}\n\n`;
    }
    const parts: any[] = [{ text: `${resumeContext}${participantContext}請根據以下已轉錄的對話與摘要資訊，產出最終的結構化${appMode === 'meeting' ? '會議紀錄' : '面試評估報告'}：\n\n` }];
    chunks.forEach((c, i) => {
      const content = c.summary || c.text || '';
      parts.push({ text: `【分段 ${i + 1}】\n內容與轉錄逐字稿：\n${content}\n\n` });
    });
    try {
      const response = await callGeminiWithRetry(
        () => getAi().models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: { parts },
          config: { 
            systemInstruction: appMode === 'meeting' ? MEETING_PROMPT : INTERVIEW_PROMPT,
            responseMimeType: appMode === 'interview' ? 'application/json' : undefined
          }
        }),
        (delay, attempt) => {
          setFinalReport(`頻率限制中... 將在 ${delay/1000} 秒後進行第 ${attempt} 次重試`);
        }
      );
      
      if (appMode === 'interview') {
        const data = JSON.parse(response.text || '{}');
        setInterviewData(data);
        setFinalReport('面試評估報告已生成，請點擊「匯出面談紀錄表」匯出至 GAS。');
      } else {
        setFinalReport(response.text || '');
      }
    } catch (e: any) {
      console.error('Gemini API Error (Final Report):', e);
      const errorMsg = getErrorMessage(e);
      setFinalReport(`生成失敗: ${errorMsg}`);
    } finally {
      setIsGeneratingFinal(false);
    }
  };

  const detectParticipants = async () => {
    if (chunks.length === 0) return;
    setIsDetectingParticipants(true);
    setErrorMsg('');
    try {
      const allSummaries = chunks.map((c, i) => `[分段 ${i + 1}] ${c.summary}`).join('\n');
      const response = await callGeminiWithRetry(
        () => getAi().models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `請深度分析以下會議摘要，精準識別出所有不同的與會發言者。
請根據以下多維度特徵進行識別：
1. 說話語氣與風格（例如：果斷、客氣、專業、隨意）。
2. 討論的主題領域（例如：負責技術、負責財務、負責管理）。
3. 互動關係（例如：誰在對誰下指令、誰在回答誰的問題）。
4. 提到的關鍵詞或特定口頭禪。
5. 性別特徵（如果能從語境判斷）。
6. 職位或角色暗示（例如：主持人、面試官、應徵者、主管）。

對於每個發言者，請給予一個代號（如：人員 A、人員 B），並詳細描述其識別特徵。

請以 JSON 格式回傳，格式如下：
[
  { "id": "A", "placeholder": "人員 A", "description": "詳細描述特徵（包含語氣、主題、角色等）...", "name": "" },
  ...
]

會議摘要內容：
${allSummaries}`,
          config: { responseMimeType: 'application/json' }
        }),
        (delay, attempt) => {
          setErrorMsg(`識別人員中 (頻率限制，${delay/1000}秒後第 ${attempt} 次重試)`);
        }
      );
      const detected = JSON.parse(response.text || '[]');
      setParticipants(detected);
      setErrorMsg('');
    } catch (e: any) {
      console.error('Detect Participants Error:', e);
      const errorMsg = getErrorMessage(e);
      setErrorMsg('識別與會人員失敗：' + errorMsg);
    } finally {
      setIsDetectingParticipants(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resetApp = () => {
    setAppMode('home');
    setChunks([]);
    setFinalReport('');
    setParticipants([]);
    setIsRecording(false);
    isRecordingRef.current = false;
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  const exportToPdf = async () => {
    if (!interviewData) return;
    setIsExportingPdf(true);
    
    const gasUrl = customGasUrl || 'https://script.google.com/macros/s/AKfycbzi7PHlbOK-Dmls4yCCwRlVNC2EvgXZx4_0cr9gNgNM8JjBU_77y4aZaaCb0bxnMCQZ/exec';

    try {
      // Prepare the data to match the requested structure
      const payload: any = {
        candidate_name: interviewData.candidate_name || '',
        job_title: interviewData.job_title || '',
        interview_date: interviewData.interview_date || '',
        interviewer: interviewData.interviewer || '',
        test_score: interviewData.test_score || '',
        expected_salary: interviewData.expected_salary || '',
        future_self: interviewData.future_self || '',
        conclusion_pos: interviewData.conclusion_pos || '',
        conclusion_neg: interviewData.conclusion_neg || '',
        manager_record: interviewData.manager_record || '',
        hr_record: interviewData.hr_record || '',
        salary_benefits: interviewData.salary_benefits || ''
      };

      // Flatten evidence for each trait for easier GAS mapping
      // Placeholders will be like: evidence_k1, evidence_r1, etc.
      const allTraitIds = [
        'k1', 'k2', 'k3', 
        'v1', 'v2', 'v3', 'v4', 
        'r1', 'r2', 'r3', 'r4', 
        's1', 's2', 's3', 
        'p1', 'p2', 'p3', 
        'sur1', 'sur2', 'sur3', 'sur4'
      ];

      allTraitIds.forEach(id => {
        payload[`evidence_${id}`] = '';
        payload[`score_${id}`] = 0;
      });

      if (interviewData.traits_scores) {
        Object.keys(interviewData.traits_scores).forEach(traitId => {
          const traitData = interviewData.traits_scores[traitId];
          if (traitData && typeof traitData === 'object') {
            payload[`evidence_${traitId}`] = traitData.evidence || '';
            payload[`score_${traitId}`] = traitData.score || 0;
          }
        });
      }

      // Send to GAS
      // We use 'no-cors' and 'text/plain' to avoid preflight issues with GAS Web Apps
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(payload)
      });

      alert('資料已成功傳送至 Google Apps Script！請至 Google Drive 查看產出的報表。');
    } catch (error) {
      console.error('GAS Export Error:', error);
      alert('匯出至 GAS 失敗，請檢查網路連線或 GAS 網址。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const startInterview = () => {
    if (hasRestoredSession) {
      if (confirm('發現未完成的紀錄，是否要清除並開始新面試？')) {
        clearSession();
        setAppMode('interview');
      }
    } else {
      setAppMode('interview');
    }
  };

  const startMeeting = () => {
    if (hasRestoredSession) {
      if (confirm('發現未完成的紀錄，是否要清除並開始新會議？')) {
        clearSession();
        setAppMode('meeting');
      }
    } else {
      setAppMode('meeting');
    }
  };

  const resumeSession = () => {
    const savedMode = localStorage.getItem('appMode');
    if (savedMode) {
      setAppMode(savedMode as any);
      setHasRestoredSession(false);
    }
  };

  if (appMode === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans text-slate-900">
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8">
          <div className="md:col-span-2 text-center mb-4">
            <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              AI 智慧紀錄助手
            </h1>
            <p className="text-slate-500">專業、精準、高效的會議與面試紀錄解決方案</p>
          </div>

          {hasRestoredSession && (
            <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-900">發現未完成的紀錄</h3>
                  <p className="text-xs text-amber-700">系統偵測到您上次的面試/會議紀錄尚未儲存，是否要繼續？</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={resumeSession}
                  className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm"
                >
                  繼續上次紀錄
                </button>
                <button 
                  onClick={clearSession}
                  className="bg-white text-amber-700 border border-amber-200 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors"
                >
                  清除並開始新紀錄
                </button>
              </div>
            </div>
          )}

          <button 
            onClick={startMeeting}
            className="group relative bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-500 hover:shadow-xl transition-all duration-300 text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="w-32 h-32 text-indigo-600" />
            </div>
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Users className="w-7 h-7 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">會議紀錄模式</h2>
            <p className="text-slate-500 mb-6 leading-relaxed">
              適用於團隊週會、專案討論或客戶會議。自動識別發言人、提煉決議事項與行動清單。
            </p>
            <div className="flex items-center text-indigo-600 font-semibold gap-2">
              立即開始 <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          <button 
            onClick={startInterview}
            className="group relative bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-violet-500 hover:shadow-xl transition-all duration-300 text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Briefcase className="w-32 h-32 text-violet-600" />
            </div>
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Briefcase className="w-7 h-7 text-violet-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">面試紀錄模式</h2>
            <p className="text-slate-500 mb-6 leading-relaxed">
              專為招募面試設計。記錄候選人回答要點、技能評估與面試官觀察，輔助人才篩選決策。
            </p>
            <div className="flex items-center text-violet-600 font-semibold gap-2">
              立即開始 <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          <div className="md:col-span-2 flex justify-center mt-4">
            <div className="flex items-center gap-6 text-slate-400 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" /> 即時分段處理
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" /> AI 智慧總結
              </div>
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" /> 私密安全保障
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 p-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={resetApp}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              title="返回首頁"
            >
              <Home className="w-5 h-5 text-slate-500" />
            </button>
            <div className="flex items-center gap-2">
              {appMode === 'meeting' ? <Users className="w-6 h-6 text-indigo-600" /> : <Briefcase className="w-6 h-6 text-violet-600" />}
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  {appMode === 'meeting' ? '會議紀錄模式' : '面試紀錄模式'}
                </h1>
                <p className="text-slate-500 text-[10px]">
                  {appMode === 'meeting' ? '正在進行專業會議紀要提煉' : '正在進行面試過程記錄與評估'}
                </p>
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                micPermissionStatus === 'granted' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 
                micPermissionStatus === 'denied' ? 'bg-red-100 text-red-700 border border-red-200' : 
                'bg-slate-100 text-slate-500 border border-slate-200'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  micPermissionStatus === 'granted' ? 'bg-emerald-500' : 
                  micPermissionStatus === 'denied' ? 'bg-red-500' : 'bg-slate-400'
                } ${micPermissionStatus === 'granted' ? 'animate-pulse' : ''}`} />
                {micPermissionStatus === 'granted' ? 'Mic Ready' : 
                 micPermissionStatus === 'denied' ? 'Mic Blocked' : 'Mic Check'}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              title="設定儲存空間"
            >
              <Settings className="w-5 h-5 text-slate-500" />
            </button>
            {!hasApiKey && (
              <button 
                onClick={handleSelectKey}
                className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
              >
                <Key className="w-3 h-3" />
                設定 API 金鑰 (解決頻率限制)
              </button>
            )}
            
            {isFfmpegLoading && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    組件載入中...
                  </div>
                  {!useCompatibilityMode && (
                    <button 
                      onClick={() => setUseCompatibilityMode(true)}
                      className="text-[10px] text-indigo-600 underline hover:text-indigo-800"
                    >
                      等不及了？切換相容模式
                    </button>
                  )}
                </div>
                {ffmpegLoadingStatus && <span className="text-[10px] text-slate-400 mr-2">{ffmpegLoadingStatus}</span>}
              </div>
            )}
            {ffmpegError && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={loadFFmpeg}
                    className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full border border-red-100 hover:bg-red-100 transition-colors"
                  >
                    <AlertCircle className="w-3 h-3" />
                    組件載入失敗，點擊重試
                  </button>
                  <button 
                    onClick={() => setUseCompatibilityMode(true)}
                    className="text-[10px] text-indigo-600 underline hover:text-indigo-800"
                  >
                    切換至相容模式
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mr-2">網路環境受限？建議使用相容模式</span>
              </div>
            )}
            {useCompatibilityMode && !isFfmpegLoading && !ffmpegError && !ffmpegLoaded && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                <Zap className="w-3 h-3" />
                已啟用相容切片模式
              </div>
            )}
            {ffmpegLoaded && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                <Check className="w-3 h-3" />
                大型檔案處理已就緒
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">錄音與分段分析</h2>
            {chunks.length > 0 && <button onClick={() => setChunks([])} className="text-xs text-slate-400 hover:text-red-500">清除紀錄</button>}
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={toggleRecording} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />} 
              {isRecording ? `停止 (${formatDuration(recordingDuration)})` : '開始錄音'}
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingFile} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50">
              {isProcessingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {isProcessingFile ? '處理中' : '上傳'}
            </button>
            <input type="file" accept="audio/*" multiple ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
          </div>
          
          {/* Microphone Permission Warning Banner */}
          {(micPermissionStatus === 'denied' || errorMsg.includes('麥克風') || errorMsg.includes('Permission')) && (
            <div className="mb-6 p-6 bg-red-600 text-white rounded-2xl shadow-xl animate-bounce-subtle">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/20 rounded-full">
                  <Mic className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold mb-2">麥克風存取被拒絕！</h2>
                  <p className="text-red-100 mb-4">
                    系統偵測到麥克風權限已被封鎖。沒有麥克風權限，您將無法使用「即時錄音」與「語音轉文字」功能。
                  </p>
                  <div className="bg-white/10 p-4 rounded-xl border border-white/20">
                    <p className="font-bold mb-2 flex items-center gap-2">
                      <Check className="w-4 h-4" /> 終極解決方案 (請務必嘗試)：
                    </p>
                    <div className="space-y-4">
                      <div className="p-4 bg-white/10 rounded-lg border border-white/20">
                        <p className="text-sm font-bold mb-2 text-white flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-red-600 text-[10px]">1</span>
                          最快解決：在新分頁開啟 (推薦)
                        </p>
                        <p className="text-xs text-red-100 mb-3 leading-relaxed">
                          內嵌視窗常受限於瀏覽器安全政策。在新分頁中，權限請求通常能 100% 成功。
                        </p>
                        <div className="flex gap-2">
                          <a 
                            href={window.location.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2.5 bg-white text-red-600 font-bold rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
                          >
                            <Upload className="w-4 h-4 rotate-45" /> 立即開啟新分頁
                          </a>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(window.location.href);
                              alert('網址已複製！請貼到新分頁開啟。');
                            }}
                            className="px-3 py-2.5 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                            title="複製網址"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 bg-white/10 rounded-lg border border-white/20">
                        <p className="text-sm font-bold mb-2 text-white flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-red-600 text-[10px]">2</span>
                          為什麼 Chat 麥克風可以，這裡不行？
                        </p>
                        <p className="text-xs text-red-100 mb-2 leading-relaxed">
                          AI Studio 的聊天室屬於「主網頁」，而這個 App 運行在安全的「隔離沙盒 (iframe)」中。部分瀏覽器（尤其是 Chrome）會嚴格阻擋沙盒內的麥克風存取。
                        </p>
                        <p className="text-xs text-red-100 font-bold mb-2">
                          👉 請嘗試重新整理「整個 AI Studio 網頁」(按 F5)，讓權限設定重新載入。
                        </p>
                        <p className="text-[10px] text-red-200 border-t border-white/10 pt-2 mt-2">
                          💡 提示：如果您使用的是公司電腦，企業資安政策 (MDM) 可能會全面封鎖未知網域的麥克風權限。若兩台電腦皆為公司設備，這極可能是主因。
                        </p>
                      </div>

                      <div className="p-4 bg-white/10 rounded-lg border border-white/20">
                        <p className="text-sm font-bold mb-2 text-white flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-red-600 text-[10px]">3</span>
                          最終替代方案：上傳錄音檔
                        </p>
                        <p className="text-xs text-red-100 mb-3 leading-relaxed">
                          如果瀏覽器持續阻擋，建議您使用手機或電腦內建的「語音備忘錄 / 錄音機」錄製後，直接上傳檔案進行分析。
                        </p>
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
                        >
                          <Upload className="w-4 h-4" /> 選擇錄音檔上傳
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 mt-4">
                    <button 
                      onClick={() => setMicPermissionStatus('granted')}
                      className="w-full py-2 bg-transparent text-white/50 text-[10px] hover:text-white transition-colors underline"
                    >
                      我確定已開啟，請直接進入錄音介面 (強制關閉警告)
                    </button>

                    {debugInfo && (
                      <div className="mt-4 p-3 bg-black/40 rounded-lg border border-white/10">
                        <p className="text-[10px] font-mono text-gray-400 mb-2">Debug Info (請提供給開發者):</p>
                        <pre className="text-[9px] font-mono text-gray-300 overflow-x-auto">
                          {debugInfo}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Existing Error Message */}
          {errorMsg && micPermissionStatus !== 'denied' && !errorMsg.includes('麥克風') && !errorMsg.includes('Permission') && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-700 font-medium whitespace-pre-line">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="mb-4 p-4 bg-white border border-indigo-100 rounded-xl shadow-sm">
            <h3 className="text-xs font-bold text-indigo-900 mb-2 uppercase tracking-wider">當前收音</h3>
            <p className="text-sm text-slate-700 min-h-[3rem]">{currentChunkText}<span className="text-slate-400">{interimText}</span></p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {isProcessingFile && (
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl shadow-sm flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="text-sm text-indigo-700 font-medium">正在批次處理音檔中，請稍候...</span>
              </div>
            )}
            {chunks.map((chunk, idx) => (
              <div key={chunk.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">分段 {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    {chunk.error && (
                      <button 
                        onClick={() => chunk.audio ? analyzeChunk(chunk) : commitCurrentChunk(chunk.id, chunk.text)}
                        className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 hover:bg-red-100"
                      >
                        重試
                      </button>
                    )}
                    {chunk.isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> : <Check className="w-3 h-3 text-emerald-500" />}
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-2">{chunk.text}</p>
                {chunk.summary && (
                  <div className={`p-3 rounded-lg text-sm ${chunk.error ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-50 border border-slate-100'}`}>
                    <div className="prose prose-sm max-w-none prose-slate">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{chunk.summary}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-medium">
              {appMode === 'meeting' ? '最終會議紀錄' : '面試評估報告'}
            </h2>
            {finalReport && <button onClick={() => { navigator.clipboard.writeText(finalReport); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-sm text-indigo-600">{copied ? '已複製' : '複製'}</button>}
          </div>

          {appMode === 'interview' && (
            <div className="mb-6 space-y-4">
              {/* Resume Analysis Section */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" /> 候選人履歷預分析
                  </h3>
                  <button 
                    onClick={() => resumeInputRef.current?.click()}
                    disabled={isAnalyzingResume}
                    className="text-xs flex items-center gap-1 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    {isAnalyzingResume ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {isAnalyzingResume ? '分析中...' : '上傳履歷 (PDF)'}
                  </button>
                  <input 
                    type="file" 
                    ref={resumeInputRef} 
                    onChange={handleResumeUpload} 
                    accept="application/pdf" 
                    className="hidden" 
                  />
                </div>
                
                {resumeAnalysis ? (
                  <div className="prose prose-sm max-w-none prose-indigo bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{resumeAnalysis}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">尚未上傳履歷。上傳後 AI 將針對 6 大特質提供面試戰略建議。</p>
                )}
              </div>

              {/* Interview Assistant Panel */}
              <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-violet-900 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4" /> 面試官即時洞察與建議
                </h3>
                {chunks.filter(c => c.summary).length > 0 ? (
                  <div className="prose prose-sm max-w-none prose-violet">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {(() => {
                        const lastSummary = [...chunks].reverse().find(c => c.summary)?.summary || '';
                        return lastSummary || "正在分析面試進度，請稍候...";
                      })()}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-violet-400 italic">錄音滿 2 分鐘後，AI 將在此提供即時洞察與補題建議...</p>
                )}
              </div>

              {/* Trait Reference Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-violet-600" /> 核心人格特質目標
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { t: "1. 情緒韌性", d: "情緒切割，不將挫折帶到下一通。", qs: ["(A) 奧客經驗與心情調整", "(B) 連續抱怨電話的品質維持"] },
                    { t: "2. 同理傾聽", d: "聽出話中話，讓客戶感到被重視。", qs: ["(A) 帳單超支時的同理對話", "(B) 發現客戶潛在需求實例"] },
                    { t: "3. 邏輯溝通", d: "將複雜術語白話化（如：流量降速）。", qs: ["(A) 向長輩解釋流量超額降速", "(B) 帶領客戶看懂帳單的邏輯"] },
                    { t: "4. 解決問題", d: "靈活應變 SOP 沒寫的情況。", qs: ["(A) 處理 SOP 無法解決的問題", "(B) 處理權限外的補償僵局"] },
                    { t: "5. 紀律專注", d: "多系統操作且維持零錯誤。", qs: ["(A) 忙碌環境下的零錯誤操作", "(B) 出勤紀律管理與突發處理"] },
                    { t: "6. 學習彈性", d: "快速吸收每週更新的資費方案。", qs: ["(A) 學習新方案的高效率方法", "(B) 適應介面或政策大幅修改"] }
                  ].map(trait => (
                    <div key={trait.t} className="flex flex-col gap-1 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-violet-700">{trait.t}</span>
                        <span className="text-[10px] text-slate-400 italic">{trait.d}</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {trait.qs.map((q, i) => (
                          <div key={i} className="text-[10px] text-slate-600 flex items-start gap-1">
                            <span className="text-violet-400">•</span>
                            <span>{q}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Participant Identification Section */}
          <div id="participant-section" className={`mb-6 bg-white border rounded-xl p-4 shadow-sm transition-all ${participants.length === 0 ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> 與會人員識別
                {participants.length === 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">必填</span>}
              </h3>
              <button 
                onClick={detectParticipants} 
                disabled={isDetectingParticipants || chunks.length === 0}
                className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full hover:bg-indigo-100 disabled:opacity-50"
              >
                {isDetectingParticipants ? '識別中...' : '自動識別人員特徵'}
              </button>
            </div>
            
            {participants.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-400">請輸入正確姓名（相同姓名將自動合併），或刪除錯誤識別：</p>
                  <button 
                    onClick={() => setParticipants([])}
                    className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> 清空全部
                  </button>
                </div>
                {participants.map((p, idx) => (
                  <div key={p.id} className="flex flex-col gap-1 p-2 bg-slate-50 rounded-lg border border-slate-100 group">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium w-16 shrink-0 text-indigo-600">{p.placeholder}</span>
                      <input 
                        type="text" 
                        placeholder="輸入姓名 (例如: Ryan)" 
                        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        value={p.name}
                        onChange={(e) => {
                          const newParticipants = [...participants];
                          newParticipants[idx].name = e.target.value;
                          setParticipants(newParticipants);
                        }}
                      />
                      <button 
                        onClick={() => setParticipants(prev => prev.filter(item => item.id !== p.id))}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="刪除此人員"
                      >
                        <UserMinus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 italic leading-tight">{p.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">分析完音檔後，點擊上方按鈕識別人員。</p>
            )}
          </div>

          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={generateFinalReport} 
              disabled={isGeneratingFinal || chunks.length === 0} 
              className={`flex-1 py-3 rounded-xl font-bold transition-all ${isGeneratingFinal || chunks.length === 0 ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md'}`}
            >
              {isGeneratingFinal ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在生成報告...
                </span>
              ) : '生成最終會議紀錄'}
            </button>
            
            {finalReport && (
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(finalReport);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="ml-3 p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 flex items-center gap-2 transition-all shadow-sm"
                title="複製報告內容"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                <span className="text-xs font-medium">{copied ? '已複製' : '一鍵複製'}</span>
              </button>
            )}
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 overflow-y-auto prose prose-sm max-w-none shadow-inner relative">
            {finalReport ? (
              appMode === 'interview' && interviewData ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <div>
                      <h3 className="text-indigo-900 font-bold mb-1">面試評估已完成</h3>
                      <p className="text-xs text-indigo-600">AI 已根據面試內容生成錄用決策建議與 21 項特質評估。</p>
                    </div>
                    <button 
                      onClick={exportToPdf}
                      disabled={isExportingPdf}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
                    >
                      {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      匯出面談紀錄表 (GAS)
                    </button>
                  </div>

                  {/* Hiring Decision Dashboard */}
                  <div className="bg-white border-2 border-indigo-500 rounded-2xl p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-indigo-500 text-white px-4 py-1 rounded-bl-xl text-[10px] font-bold uppercase tracking-widest">
                      AI Hiring Decision
                    </div>
                    <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                      <div className="flex flex-col items-center justify-center bg-indigo-50 w-32 h-32 rounded-full border-4 border-indigo-100 shrink-0">
                        <span className="text-3xl font-black text-indigo-600">{interviewData.overall_score}</span>
                        <span className="text-[10px] text-indigo-400 font-bold">OVERALL SCORE</span>
                      </div>
                      <div className="flex-1 text-center md:text-left">
                        <div className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mb-2">
                          {interviewData.hiring_recommendation}
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">錄用決策摘要</h3>
                        <p className="text-sm text-slate-600 leading-relaxed italic">
                          "{interviewData.decision_reasoning}"
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-slate-500">指標 A：業務/服務推動力</span>
                          <span className="text-xs font-black text-indigo-600">{interviewData.core_indicators?.business_service?.score} / 5</span>
                        </div>
                        <div className="text-[10px] text-indigo-500 font-bold mb-1">類型：{interviewData.core_indicators?.business_service?.type}</div>
                        <p className="text-[10px] text-slate-500 leading-tight">{interviewData.core_indicators?.business_service?.evidence}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-slate-500">指標 B：長期穩定性</span>
                          <span className="text-xs font-black text-indigo-600">{interviewData.core_indicators?.stability?.score} / 5</span>
                        </div>
                        <div className="text-[10px] text-indigo-500 font-bold mb-1">風險評估：{interviewData.core_indicators?.stability?.score >= 4 ? '低風險' : '需注意'}</div>
                        <p className="text-[10px] text-slate-500 leading-tight">{interviewData.core_indicators?.stability?.evidence}</p>
                      </div>
                    </div>

                    {/* Six Core Traits Scores */}
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">六大核心職能評分</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                          { key: 'emotional_resilience', label: '情緒韌性' },
                          { key: 'empathetic_listening', label: '同理傾聽' },
                          { key: 'logical_communication', label: '邏輯溝通' },
                          { key: 'problem_solving', label: '解決問題' },
                          { key: 'discipline_focus', label: '紀律專注' },
                          { key: 'learning_flexibility', label: '學習彈性' }
                        ].map(trait => (
                          <div key={trait.key} className="flex flex-col gap-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-medium text-slate-600">{trait.label}</span>
                              <span className="text-[11px] font-bold text-indigo-600">{interviewData.six_traits_scores?.[trait.key] || 0}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                              <div 
                                className="bg-indigo-500 h-full transition-all duration-500" 
                                style={{ width: `${(interviewData.six_traits_scores?.[trait.key] || 0) * 20}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="text-sm font-bold mb-3">應徵者資訊摘要</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div><span className="text-slate-400">姓名：</span>{interviewData.candidate_name}</div>
                      <div><span className="text-slate-400">職務：</span>{interviewData.job_title}</div>
                      <div><span className="text-slate-400">時間：</span>{interviewData.interview_date}</div>
                      <div><span className="text-slate-400">面試官：</span>{interviewData.interviewer}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold">特質評估預覽</h4>
                    {INTERVIEW_TRAITS.map(cat => (
                      <div key={cat.category} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider">{cat.category}</div>
                        <div className="divide-y divide-slate-100">
                          {cat.items.map(item => {
                            const traitData = interviewData.traits_scores?.[item.id];
                            const score = typeof traitData === 'object' ? traitData.score : (traitData || 0);
                            const evidence = typeof traitData === 'object' ? traitData.evidence : '';
                            
                            return (
                              <div key={item.id} className="p-3 flex flex-col gap-2">
                                <div className="flex items-start gap-3">
                                  <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${score === 1 ? 'bg-emerald-100 text-emerald-700' : score === -1 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {score === 1 ? '√' : score === -1 ? 'X' : '△'}
                                    </div>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-[10px] leading-relaxed text-slate-700">
                                      <span className="font-bold text-emerald-600">正向：</span>{item.pos}
                                    </p>
                                    <p className="text-[10px] leading-relaxed text-slate-400 mt-1">
                                      <span className="font-bold text-red-400">負向：</span>{item.neg}
                                    </p>
                                  </div>
                                </div>
                                {evidence && (
                                  <div className="ml-9 p-2 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                                    <p className="text-[10px] text-indigo-700 leading-relaxed italic">
                                      <span className="font-bold not-italic mr-1">AI 判定依據：</span>{evidence}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalReport}</ReactMarkdown>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 italic gap-2">
                <FileText className="w-12 h-12 opacity-20" />
                <p>點擊按鈕生成報告</p>
              </div>
            )}
          </div>

          {/* Hidden PDF Content for Capture */}
          <div id="interview-pdf-content" className="hidden fixed left-[-9999px] top-0 w-[210mm] bg-white text-black p-[10mm] font-serif" style={{ display: 'none', backgroundColor: '#ffffff', color: '#000000' }}>
            <div className="border-2 border-black p-4" style={{ borderColor: '#000000' }}>
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded flex items-center justify-center text-white font-bold" style={{ backgroundColor: '#059669', color: '#ffffff' }}>智</div>
                  <span className="text-xl font-bold">智生活</span>
                </div>
                <h1 className="text-2xl font-bold tracking-[0.5em]">面談紀錄表</h1>
              </div>

              {/* Page 1 Header */}
              <table className="w-full border-collapse border border-black text-sm mb-4" style={{ borderColor: '#000000' }}>
                <tbody>
                  <tr>
                    <td className="border border-black p-2 w-24" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>應徵者</td>
                    <td className="border border-black p-2 w-1/3" style={{ borderColor: '#000000' }}>{interviewData?.candidate_name}</td>
                    <td className="border border-black p-2 w-24" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>應徵職務</td>
                    <td className="border border-black p-2" style={{ borderColor: '#000000' }}>{interviewData?.job_title}</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>面談時間</td>
                    <td className="border border-black p-2" style={{ borderColor: '#000000' }}>{interviewData?.interview_date}</td>
                    <td className="border border-black p-2 w-24" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>面談人員</td>
                    <td className="border border-black p-2" style={{ borderColor: '#000000' }}>{interviewData?.interviewer}</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>測驗分數</td>
                    <td className="border border-black p-2" style={{ borderColor: '#000000' }}>{interviewData?.test_score}</td>
                    <td className="border border-black p-2 w-24" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>期望薪資</td>
                    <td className="border border-black p-2" style={{ borderColor: '#000000' }}>{interviewData?.expected_salary}</td>
                  </tr>
                </tbody>
              </table>

              <div className="border border-black p-1 text-center font-bold text-sm mb-4" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>演算法條件設定對照表</div>

              {/* Traits Table - Page 1 & 2 */}
              <table className="w-full border-collapse border border-black text-[10px]" style={{ borderColor: '#000000' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <th className="border border-black p-1 w-16" style={{ borderColor: '#000000' }}>分類</th>
                    <th className="border border-black p-1" style={{ borderColor: '#000000' }}>正向特質(符合請√部分符合△)</th>
                    <th className="border border-black p-1 w-8" style={{ borderColor: '#000000' }}>勾選</th>
                    <th className="border border-black p-1" style={{ borderColor: '#000000' }}>負向特質(符合請√部分符合△)</th>
                    <th className="border border-black p-1 w-8" style={{ borderColor: '#000000' }}>勾選</th>
                  </tr>
                </thead>
                <tbody>
                  {INTERVIEW_TRAITS.map(cat => (
                    cat.items.map((item, idx) => {
                      const score = interviewData?.traits_scores?.[item.id] || 0;
                      return (
                        <tr key={item.id}>
                          {idx === 0 && (
                            <td className="border border-black p-1 text-center font-bold align-middle" rowSpan={cat.items.length} style={{ borderColor: '#000000' }}>
                              {cat.category}
                            </td>
                          )}
                          <td className="border border-black p-1" style={{ borderColor: '#000000' }}>{item.pos}</td>
                          <td className="border border-black p-1 text-center font-bold" style={{ borderColor: '#000000' }}>{score === 1 ? '√' : score === 0 ? '△' : ''}</td>
                          <td className="border border-black p-1" style={{ borderColor: '#000000' }}>{item.neg}</td>
                          <td className="border border-black p-1 text-center font-bold" style={{ borderColor: '#000000' }}>{score === -1 ? '√' : ''}</td>
                        </tr>
                      );
                    })
                  ))}
                </tbody>
              </table>

              {/* Page 3 Sections */}
              <div className="mt-8 pt-8 border-t-2 border-dashed" style={{ borderColor: '#cbd5e1' }}>
                <table className="w-full border-collapse border border-black text-sm" style={{ borderColor: '#000000' }}>
                  <tbody>
                    <tr>
                      <td className="border border-black p-2 w-32" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>未來虛擬自我(選填)</td>
                      <td className="border border-black p-2 h-24 vertical-top" style={{ borderColor: '#000000' }}>{interviewData?.future_self}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-4 border border-black" style={{ borderColor: '#000000' }}>
                  <div className="p-2 text-center font-bold border-b border-black" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>條件的結論</div>
                  <div className="flex divide-x divide-black" style={{ borderColor: '#000000' }}>
                    <div className="flex-1 p-2">
                      <div className="font-bold mb-1 text-xs">正向特質對於團隊幫助的總結</div>
                      <div className="text-xs min-h-[80px]">{interviewData?.conclusion_pos}</div>
                    </div>
                    <div className="flex-1 p-2" style={{ borderColor: '#000000' }}>
                      <div className="font-bold mb-1 text-xs">負向特質注意與如何校正的總結</div>
                      <div className="text-xs min-h-[80px]">{interviewData?.conclusion_neg}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Page 4 Sections */}
              <div className="mt-8 pt-8 border-t-2 border-dashed" style={{ borderColor: '#cbd5e1' }}>
                <div className="text-center font-bold text-xl mb-4">面談紀錄表</div>
                <table className="w-full border-collapse border border-black text-sm" style={{ borderColor: '#000000' }}>
                  <tbody>
                    <tr>
                      <td className="border border-black p-2 w-32" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>主管面談[關鍵]紀錄</td>
                      <td className="border border-black p-2 h-48 align-top" style={{ borderColor: '#000000' }}>{interviewData?.manager_record}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 w-32" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>HR面談[關鍵]紀錄</td>
                      <td className="border border-black p-2 h-48 align-top" style={{ borderColor: '#000000' }}>{interviewData?.hr_record}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 w-32" style={{ backgroundColor: '#f1f5f9', borderColor: '#000000' }}>應徵者各份工作薪資福利</td>
                      <td className="border border-black p-2 h-32 align-top" style={{ borderColor: '#000000' }}>{interviewData?.salary_benefits}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-[10px] text-right" style={{ color: '#94a3b8' }}>改版--面談紀錄表20230317.docx</div>
            </div>
          </div>
        </div>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                設定儲存空間 (GAS Web App)
              </h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-bold text-slate-700 mb-2">Google Apps Script Web App URL</label>
                <input
                  type="text"
                  value={customGasUrl}
                  onChange={(e) => setCustomGasUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  請填寫您自行部署的 GAS Web App URL。如果留白，將使用系統預設的儲存空間。
                </p>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('customGasUrl', customGasUrl);
                  setShowSettings(false);
                  alert('設定已儲存！');
                }}
                className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                儲存設定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
