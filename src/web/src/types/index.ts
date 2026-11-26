export type DocumentKind = 'pdf' | 'scanned-pdf' | 'image';

export interface DocTab {
  id: string;
  docHash: string;
  title: string;
  kind: DocumentKind;
  pageCount: number;
  currentPage: number;
  scale: number; // e.g. 1.25 for 125%
  rotation: number; // 0, 90, 180, 270
  textSource: 'native' | 'ocr' | 'hybrid';
  ocrStatus?: {
    isRecognizing: boolean;
    currentPage: number;
    totalPage: number;
    unrecognizedPages: number;
  };
}

export type ToolType =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'note'
  | 'freetext'
  | 'ink'
  | 'rect'
  | 'arrow'
  | 'regionAsk'
  | 'eraser';

export type AnnotationColor = '#F6C445' | '#22C55E' | '#3B82F6' | '#EF4444' | '#A855F7';

export type AnnotationType =
  'highlight' | 'underline' | 'note' | 'freetext' | 'ink' | 'rect' | 'arrow';

export interface BaseAnnotation {
  id: string;
  docId: string;
  page: number;
  type: AnnotationType;
  color: string;
  strokeWidth?: number;
  opacity?: number;
  author: string;
  createdAt: string;
  contents?: string; // Note content or freetext text
  summaryText: string;
  llmRef?: {
    conversationId: string;
    messageId: string;
  };
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight' | 'underline';
  quotedText: string;
  rects: { x: number; y: number; width: number; height: number }[];
}

export interface NoteAnnotation extends BaseAnnotation {
  type: 'note';
  x: number;
  y: number;
}

export interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected?: boolean;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface FreetextAnnotation extends BaseAnnotation {
  type: 'freetext';
  x: number;
  y: number;
  text: string;
  color: string;
}

export type AnyAnnotation =
  HighlightAnnotation | NoteAnnotation | RectAnnotation | ArrowAnnotation | FreetextAnnotation;

export interface ToolCallRecord {
  id: string;
  icon: 'search' | 'document' | 'ocr' | 'image';
  text: string;
  status: 'pending' | 'completed';
  progress?: { current: number; total: number };
}

export interface Citation {
  page: number;
  label: string;
  quotedSnippet: string;
}

export interface ChatAttachment {
  id: string;
  page: number;
  title: string;
  imageUrl: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallRecord[];
  citations?: Citation[];
  attachments?: ChatAttachment[];
  systemAction?: {
    text: string;
    actionLabel: string;
    actionType: 'undo-annotations' | 'retry';
  };
}

export interface ChatSession {
  id: string;
  docId: string;
  title: string;
  model: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface OutlineItem {
  id: string;
  title: string;
  page: number;
  children?: OutlineItem[];
}

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  isDefault: boolean;
  models: string[];
  selectedModel: string;
  supportsVision: boolean;
}

export interface AppSettings {
  providers: ModelProvider[];
  annotation: {
    author: string;
    defaultColor: AnnotationColor;
    defaultOpacity: number;
    autoShowFloatingBar: boolean;
  };
  ocr: {
    tier: 'tiny' | 'small' | 'medium';
    enableGpu: boolean;
    cachedPages: number;
    cacheSizeBytes: number;
  };
}

export type SidePanelType = 'none' | 'thumbnails' | 'outline' | 'annotations';
