import type {
  DocTab,
  AnyAnnotation,
  ChatSession,
  OutlineItem,
  AppSettings,
} from '../types';

export const initialTabs: DocTab[] = [
  {
    id: 'doc-1',
    docHash: 'a7c93e41b9e5',
    title: '2025年度报告.pdf',
    kind: 'pdf',
    pageCount: 86,
    currentPage: 12,
    scale: 1.25,
    rotation: 0,
    textSource: 'native',
  },
  {
    id: 'doc-2',
    docHash: 'f4820ad41e9b',
    title: '采购合同-扫描件.pdf',
    kind: 'scanned-pdf',
    pageCount: 36,
    currentPage: 2,
    scale: 1.25,
    rotation: 0,
    textSource: 'ocr',
    ocrStatus: {
      isRecognizing: true,
      currentPage: 12,
      totalPage: 36,
      unrecognizedPages: 24,
    },
  },
  {
    id: 'doc-3',
    docHash: '8cb3729d0124',
    title: '会议纪要.png',
    kind: 'image',
    pageCount: 1,
    currentPage: 1,
    scale: 1.0,
    rotation: 0,
    textSource: 'hybrid',
  },
];

export const initialOutline: OutlineItem[] = [
  {
    id: 'out-1',
    title: '2025 年度经营报告',
    page: 1,
    children: [
      {
        id: 'out-2',
        title: '一、总体经营情况',
        page: 12,
        children: [
          { id: 'out-3', title: '1.1 营业收入季度变化', page: 12 },
          { id: 'out-4', title: '1.2 主要财务指标', page: 12 },
        ],
      },
      {
        id: 'out-5',
        title: '二、分业务线表现与分析',
        page: 18,
      },
      {
        id: 'out-6',
        title: '三、市场竞争与宏观环境',
        page: 25,
      },
      {
        id: 'out-7',
        title: '四、2026 年度战略规划',
        page: 40,
      },
    ],
  },
];

export const initialAnnotations: AnyAnnotation[] = [
  // Page 1
  {
    id: 'ann-1',
    docId: 'doc-1',
    page: 1,
    type: 'highlight',
    color: '#F6C445',
    author: '张三',
    createdAt: '2025-11-14 14:20',
    summaryText: '高亮 预计2025年营收将达...',
    quotedText: '预计2025年营收将达130亿元以上',
    rects: [{ x: 50, y: 120, width: 220, height: 20 }],
  },
  {
    id: 'ann-2',
    docId: 'doc-1',
    page: 1,
    type: 'underline',
    color: '#EF4444',
    author: '张三',
    createdAt: '2025-11-14 14:22',
    summaryText: '下划线 公司将持续加大研发...',
    quotedText: '公司将持续加大研发投入，巩固核心竞争力',
    rects: [{ x: 50, y: 160, width: 260, height: 18 }],
  },
  // Page 2
  {
    id: 'ann-3',
    docId: 'doc-1',
    page: 2,
    type: 'highlight',
    color: '#22C55E',
    author: '张三',
    createdAt: '2025-11-14 16:30',
    summaryText: '高亮 核心业务保持稳定增...',
    quotedText: '核心业务保持稳定增长态势，市场占有率达 34%',
    rects: [{ x: 50, y: 100, width: 280, height: 20 }],
  },
  {
    id: 'ann-4',
    docId: 'doc-1',
    page: 2,
    type: 'note',
    color: '#F59E0B',
    author: '张三',
    createdAt: '2025-11-14 20:45',
    summaryText: '便签 需要补充行业数据',
    contents: '需要补充行业数据和竞争对手情况',
    x: 480,
    y: 130,
  },
  {
    id: 'ann-5',
    docId: 'doc-1',
    page: 2,
    type: 'rect',
    color: '#3B82F6',
    author: '张三',
    createdAt: '2025-11-14 17:15',
    summaryText: '矩形 重点关注该图表',
    x: 60,
    y: 280,
    width: 380,
    height: 180,
    strokeWidth: 2,
  },
  // Page 3
  {
    id: 'ann-6',
    docId: 'doc-1',
    page: 3,
    type: 'freetext',
    color: '#EF4444',
    author: '张三',
    createdAt: '2025-11-14 18:02',
    summaryText: '图注 128.6',
    text: '128.6',
    x: 420,
    y: 285,
  },
  {
    id: 'ann-7',
    docId: 'doc-1',
    page: 3,
    type: 'arrow',
    color: '#3B82F6',
    author: '张三',
    createdAt: '2025-11-14 18:05',
    summaryText: '箭头 数据增长趋势明显',
    from: { x: 470, y: 290 },
    to: { x: 435, y: 310 },
  },
];

export const initialChatSessions: ChatSession[] = [
  {
    id: 'conv-1',
    docId: 'doc-1',
    title: '营收情况分析',
    model: 'DeepSeek-R1',
    updatedAt: '2025-11-14 21:05',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: '这份报告里第三季度营收下降的原因是什么？',
        createdAt: '2025-11-14 21:02',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        createdAt: '2025-11-14 21:03',
        toolCalls: [
          {
            id: 't-1',
            icon: 'search',
            text: '已搜索文档：第三季度 营收',
            status: 'completed',
          },
          {
            id: 't-2',
            icon: 'document',
            text: '已读取第 12-15 页',
            status: 'completed',
          },
        ],
        content:
          '根据报告，第三季度营收下降主要是由于宏观经济环境趋于复杂，部分行业需求减弱，导致公司主营业务收入环比下降 8.7%。[[p12|第 12 页]]\n\n同时，受市场竞争加剧影响，部分产品销售增速放缓，进一步加大了营收压力。[[p15|第 15 页]]',
        citations: [
          {
            page: 12,
            label: '第 12 页',
            quotedSnippet: '第三季度受宏观经济环境影响，部分业务需求下降，导致营收环比下滑 8.7%。',
          },
          {
            page: 15,
            label: '第 15 页',
            quotedSnippet: '受市场竞争加剧影响，部分产品销售增速放缓，进一步加大了营收压力。',
          },
        ],
        systemAction: {
          text: '已为你创建 2 处高亮',
          actionLabel: '撤销',
          actionType: 'undo-annotations',
        },
      },
    ],
  },
  {
    id: 'conv-2',
    docId: 'doc-1',
    title: '图表趋势解读（框选提问）',
    model: 'DeepSeek-R1',
    updatedAt: '2025-11-14 21:30',
    messages: [
      {
        id: 'msg-201',
        role: 'user',
        content: '解读一下这张图的趋势',
        createdAt: '2025-11-14 21:28',
        attachments: [
          {
            id: 'att-1',
            page: 23,
            title: '第 23 页 · 框选区域',
            imageUrl: '',
          },
        ],
      },
      {
        id: 'msg-202',
        role: 'assistant',
        createdAt: '2025-11-14 21:29',
        isStreaming: true,
        toolCalls: [
          {
            id: 't-201',
            icon: 'image',
            text: '正在查看区域图像...',
            status: 'pending',
          },
        ],
        content:
          '从这张图可以看出，2025 年公司营业收入呈现先降后升的趋势。前三季度受宏观环境影响，第二季度和第三季度分别回落至 102.8 和 94.1 亿元，第四季度则回升至 128.6 亿元',
      },
    ],
  },
  {
    id: 'conv-3',
    docId: 'doc-2',
    title: '智能助手',
    model: 'DeepSeek-R1',
    updatedAt: '2025-11-14 21:40',
    messages: [
      {
        id: 'msg-301',
        role: 'user',
        content: '这份合同中违约责任的具体条款是什么？',
        createdAt: '2025-11-14 21:38',
      },
      {
        id: 'msg-302',
        role: 'assistant',
        createdAt: '2025-11-14 21:39',
        toolCalls: [
          {
            id: 't-301',
            icon: 'ocr',
            text: '正在读取第 5-8 页 (识别中 2/4)',
            status: 'pending',
            progress: { current: 2, total: 4 },
          },
        ],
        content:
          '根据文档，合同中关于违约责任的条款主要包括：\n\n1. 任何一方违反本合同约定，应承担违约责任，向守约方支付违约金，并赔偿因此造成的损失。\n2. 具体违约责任的范围和计算方式，详见合同第二条第2.1款。',
      },
    ],
  },
];

export const initialSettings: AppSettings = {
  providers: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      hasKey: true,
      isDefault: true,
      models: ['DeepSeek-R1', 'DeepSeek-V3'],
      selectedModel: 'DeepSeek-R1',
      supportsVision: true,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      hasKey: true,
      isDefault: false,
      models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
      selectedModel: 'gpt-4o',
      supportsVision: true,
    },
    {
      id: 'dashscope',
      name: '阿里通义',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      hasKey: true,
      isDefault: false,
      models: ['qwen-max', 'qwen-plus', 'qwen-vl-max'],
      selectedModel: 'qwen-max',
      supportsVision: true,
    },
  ],
  annotation: {
    author: '张三',
    defaultColor: '#F6C445',
    defaultOpacity: 0.6,
    autoShowFloatingBar: true,
  },
  ocr: {
    tier: 'small',
    enableGpu: true,
    cachedPages: 42,
    cacheSizeBytes: 18.6 * 1024 * 1024,
  },
};
