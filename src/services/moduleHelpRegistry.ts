import { create } from 'zustand';
import type { ModuleHelpSection } from '../components/ModuleHelp';

export interface ModuleHelpContent {
  title: string;
  subtitle?: string;
  sections: ModuleHelpSection[];
}

interface ModuleHelpRegistryState {
  content: ModuleHelpContent | null;
  setModuleHelp: (content: ModuleHelpContent) => void;
  clearModuleHelp: () => void;
}

/**
 * Registro mínimo para que la cabecera fija de la app (`Header.tsx`) pueda
 * pintar el botón de ayuda del módulo activo junto al nombre del módulo, en
 * vez de repetirlo dentro de cada página. Cada `PageHeader` que reciba
 * `helpSections` se "anuncia" aquí al montarse y se retira al desmontarse;
 * como solo hay una página activa a la vez, en todo momento hay como mucho
 * un contenido de ayuda registrado.
 */
export const useModuleHelpRegistry = create<ModuleHelpRegistryState>((set) => ({
  content: null,
  setModuleHelp: (content) => set({ content }),
  clearModuleHelp: () => set({ content: null }),
}));
