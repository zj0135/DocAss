import { createStore } from 'zustand/vanilla';
import type { DocHandle, Settings } from '../contracts';
import { defaultSettings } from '../services/BrowserServices';
export const appStore = createStore<{tabs:DocHandle[];activeDocId:string;settings:Settings;ready:boolean;error?:string}>(()=>({tabs:[],activeDocId:'',settings:structuredClone(defaultSettings),ready:false}));
// Runtime resources live outside the serializable application state.
export { DocSession } from './DocSession';
