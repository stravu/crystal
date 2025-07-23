import React, { useState, useEffect } from 'react';
import { Modal, ModalBody } from './ui/Modal';

interface DiscordPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiscordPopup: React.FC<DiscordPopupProps> = ({ isOpen, onClose }) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    // Check if "don't show again" was previously selected from database
    const loadPreference = async () => {
      if (window.electron?.invoke) {
        try {
          console.log('[Discord] Loading hide_discord preference...');
          const result = await window.electron.invoke('preferences:get', 'hide_discord');
          console.log('[Discord] Preference result:', result);
          
          if (result?.success) {
            // Handle null (preference doesn't exist) as false
            const shouldHide = result.data === 'true';
            setDontShowAgain(shouldHide);
            console.log('[Discord] Set dontShowAgain to:', shouldHide);
          } else {
            console.error('[Discord] Failed to load preference:', result?.error);
          }
        } catch (error) {
          console.error('[Discord] Error loading preference:', error);
        }
      } else {
        console.warn('[Discord] Electron invoke not available');
      }
    };
    loadPreference();
  }, []);

  const handleClose = async () => {
    if (window.electron?.invoke) {
      try {
        const result = await window.electron.invoke('preferences:set', 'hide_discord', dontShowAgain ? 'true' : 'false');
        if (!result?.success) {
          console.error('[Discord] Failed to set preference on close:', result?.error);
        }
      } catch (error) {
        console.error('[Discord] Error setting preference on close:', error);
      }
    }
    onClose();
  };

  const handleRemindLater = async () => {
    // Just close without setting the hide flag
    if (window.electron?.invoke) {
      try {
        const result = await window.electron.invoke('preferences:set', 'hide_discord', 'false');
        if (!result?.success) {
          console.error('[Discord] Failed to set preference on remind later:', result?.error);
        }
      } catch (error) {
        console.error('[Discord] Error setting preference on remind later:', error);
      }
    }
    onClose();
  };

  const handleJoinDiscord = async () => {
    // Only try to open external link if Electron API is available
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('https://discord.gg/XrVa6q7DPY');
    } else {
      // Fallback for web/development mode
      window.open('https://discord.gg/XrVa6q7DPY', '_blank');
    }
    if (dontShowAgain && window.electron?.invoke) {
      try {
        const result = await window.electron.invoke('preferences:set', 'hide_discord', 'true');
        if (!result?.success) {
          console.error('[Discord] Failed to set preference on join discord:', result?.error);
        }
      } catch (error) {
        console.error('[Discord] Error setting preference on join discord:', error);
      }
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="relative overflow-hidden -m-6 mb-0">
        <div className="absolute inset-0 bg-gradient-to-r from-[#5865F2] to-[#7289DA] opacity-90" />
        <div className="relative px-6 py-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Join the Crystal Community!</h2>
          <p className="text-white/90">Connect with other Crystal users, get help, and stay updated</p>
        </div>
      </div>

      <ModalBody>
          <div className="space-y-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-[#5865F2] mt-2 flex-shrink-0" />
              <p className="text-text-secondary">Get help with Crystal and Claude Code</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-[#5865F2] mt-2 flex-shrink-0" />
              <p className="text-text-secondary">Share your workflows and learn from others</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 rounded-full bg-[#5865F2] mt-2 flex-shrink-0" />
              <p className="text-text-secondary">Be the first to know about updates and features</p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleJoinDiscord}
              className="w-full px-4 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>Join Discord Server</span>
            </button>
            
            <button
              onClick={handleRemindLater}
              className="w-full px-4 py-3 bg-surface-tertiary hover:bg-surface-hover text-text-secondary font-medium rounded-lg transition-colors"
            >
              Remind Me Later
            </button>
          </div>

          {/* Don't show again button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={async () => {
                const newValue = !dontShowAgain;
                setDontShowAgain(newValue);
                if (window.electron?.invoke) {
                  try {
                    const result = await window.electron.invoke('preferences:set', 'hide_discord', newValue ? 'true' : 'false');
                    if (result?.success) {
                      console.log('[Discord] Successfully set hide_discord preference to', newValue);
                    } else {
                      console.error('[Discord] Failed to set preference:', result?.error);
                    }
                  } catch (error) {
                    console.error('[Discord] Error setting preference:', error);
                  }
                }
                // Close the popup when don't show again is clicked and set to true
                if (newValue) {
                  onClose();
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                dontShowAgain
                  ? 'bg-surface-tertiary text-text-primary hover:bg-surface-hover'
                  : 'bg-surface-primary text-text-tertiary hover:bg-surface-secondary hover:text-text-secondary'
              }`}
            >
              {dontShowAgain ? "Will hide permanently" : "Don't show this again"}
            </button>
          </div>
      </ModalBody>
    </Modal>
  );
};