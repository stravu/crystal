import { create } from 'zustand';

interface SlashCommandStore {
  slashCommands: Record<string, string[]>; // panelId -> available commands
  setSlashCommands: (panelId: string, commands: string[]) => void;
  getSlashCommands: (panelId: string) => string[];
  clearSlashCommands: (panelId: string) => void;
}

export const useSlashCommandStore = create<SlashCommandStore>((set, get) => ({
  slashCommands: {},

  setSlashCommands: (panelId: string, commands: string[]) => {
    console.log(`[slash-debug] Storing slash commands for panel ${panelId}:`, commands);
    set((state) => ({
      slashCommands: {
        ...state.slashCommands,
        [panelId]: commands,
      },
    }));
  },

  getSlashCommands: (panelId: string) => {
    const commands = get().slashCommands[panelId] || [];
    console.log(`[slash-debug] Retrieved slash commands for panel ${panelId}:`, commands);
    return commands;
  },

  clearSlashCommands: (panelId: string) => {
    console.log(`[slash-debug] Clearing slash commands for panel ${panelId}`);
    set((state) => {
      const { [panelId]: _, ...rest } = state.slashCommands;
      return { slashCommands: rest };
    });
  },
}));
